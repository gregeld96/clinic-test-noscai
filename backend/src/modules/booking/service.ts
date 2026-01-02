import * as schema from '../../db/schema';
import { CreateAppointmentRequest } from '../../types';
import { eq, and, sql, or } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { format, getDay } from 'date-fns';
import { ConflictError, UnauthorizedError, NotFoundError } from '../../utils/errors';

export class BookingService {
    constructor(private fastify: FastifyInstance) { }

    async createAppointment(
        request: CreateAppointmentRequest,
        tenantId: number
    ) {
        return await this.fastify.db.transaction(async (tx) => {
            // Set Tenant ID for RLS (Stretch Goal)
            await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId.toString()}, true)`);

            // 1. Validate Resources Belong to Tenant
            const [service] = await tx.select().from(schema.services).where(and(eq(schema.services.id, request.service_id), eq(schema.services.tenant_id, tenantId)));
            if (!service) throw new UnauthorizedError('Service not found');

            const [doctor] = await tx.select().from(schema.doctors).where(and(eq(schema.doctors.id, request.doctor_id), eq(schema.doctors.tenant_id, tenantId)));
            if (!doctor) throw new UnauthorizedError('Doctor not found');

            const [patient] = await tx.select().from(schema.patients).where(and(eq(schema.patients.id, request.patient_id), eq(schema.patients.tenant_id, tenantId)));
            if (!patient) throw new UnauthorizedError('Patient not found');

            const [room] = await tx.select().from(schema.rooms).where(and(eq(schema.rooms.id, request.room_id), eq(schema.rooms.tenant_id, tenantId)));
            if (!room) throw new UnauthorizedError('Room not found');

            if (request.device_ids && request.device_ids.length > 0) {
                const deviceRows = await tx.select().from(schema.devices).where(and(
                    sql`id IN ${sql.raw(`(${request.device_ids.join(',')})`)}`,
                    eq(schema.devices.tenant_id, tenantId)
                ));
                if (deviceRows.length !== request.device_ids.length) {
                    throw new UnauthorizedError('One or more devices not found');
                }
            }

            const start = new Date(request.starts_at);
            const end = new Date(start.getTime() + service.duration_min * 60000);

            const startDay = getDay(start);
            const startTimeStr = format(start, 'HH:mm:ss');
            const endTimeStr = format(end, 'HH:mm:ss');
            const dateStr = format(start, 'yyyy-MM-dd');

            // 2. Validate Working Hours
            const whRows = await tx.select().from(schema.working_hours).where(and(
                eq(schema.working_hours.tenant_id, tenantId),
                eq(schema.working_hours.doctor_id, request.doctor_id),
                eq(schema.working_hours.weekday, startDay)
            ));

            let matchedWh = null;
            for (const wh of whRows) {
                if (startTimeStr >= wh.start_time && endTimeStr <= wh.end_time) {
                    matchedWh = wh;
                    break;
                }
            }
            if (!matchedWh) {
                throw new ConflictError('Appointment is outside doctor\'s working hours');
            }

            // Buffer before only applicable after second schedule (if not at WH start)
            const actualBufferBefore = (startTimeStr === matchedWh.start_time) ? 0 : service.buffer_before_min;
            const effStart = new Date(start.getTime() - actualBufferBefore * 60000);
            const effEnd = new Date(end.getTime() + service.buffer_after_min * 60000);

            // 3. Validate Breaks (Recurring and Specific Date)
            const breakRows = await tx.select().from(schema.breaks).where(and(
                eq(schema.breaks.tenant_id, tenantId),
                eq(schema.breaks.resource_type, 'doctor'),
                eq(schema.breaks.resource_id, request.doctor_id),
                or(
                    eq(schema.breaks.date, dateStr),
                    sql`${schema.breaks.date} IS NULL`
                )
            ));

            for (const br of breakRows) {
                if (startTimeStr < br.end_time && endTimeStr > br.start_time) {
                    throw new ConflictError(`Appointment overlaps with a break (${br.description || 'Break'})`);
                }
            }

            // 4. Doctor Conflicts (considering buffers of both new and existing appointments)
            const docConflictsResult = await tx.execute(sql`
                SELECT id FROM ${schema.appointments}
                WHERE tenant_id = ${tenantId}
                  AND doctor_id = ${request.doctor_id}
                  AND (starts_at - (buffer_before_min || ' minutes')::interval) < ${effEnd}
                  AND (ends_at + (buffer_after_min || ' minutes')::interval) > ${effStart}
            `);

            if (docConflictsResult.rows.length > 0) {
                throw new ConflictError('Doctor is busy during this period');
            }

            // 5. Room Conflicts
            const roomConflictsResult = await tx.execute(sql`
                SELECT id FROM ${schema.appointments}
                WHERE tenant_id = ${tenantId}
                  AND room_id = ${request.room_id}
                  AND (starts_at - (buffer_before_min || ' minutes')::interval) < ${effEnd}
                  AND (ends_at + (buffer_after_min || ' minutes')::interval) > ${effStart}
            `);

            if (roomConflictsResult.rows.length > 0) {
                throw new ConflictError('Room is busy during this period');
            }

            // 6. Device Conflicts
            if (request.device_ids && request.device_ids.length > 0) {
                const deviceConflictsResult = await tx.execute(sql`
                    SELECT a.id FROM ${schema.appointments} a
                    JOIN ${schema.appointment_devices} ad ON a.id = ad.appointment_id
                    WHERE a.tenant_id = ${tenantId}
                      AND ad.device_id IN ${sql.raw(`(${request.device_ids.join(',')})`)}
                      AND (a.starts_at - (a.buffer_before_min || ' minutes')::interval) < ${effEnd}
                      AND (a.ends_at + (a.buffer_after_min || ' minutes')::interval) > ${effStart}
                `);

                if (deviceConflictsResult.rows.length > 0) {
                    throw new ConflictError('One or more devices are busy during this period');
                }
            }

            // 5. Insert Appointment
            const [inserted] = await tx.insert(schema.appointments).values({
                tenant_id: tenantId,
                doctor_id: request.doctor_id,
                patient_id: request.patient_id,
                service_id: request.service_id,
                room_id: request.room_id,
                starts_at: start,
                ends_at: end,
                buffer_before_min: service.buffer_before_min,
                buffer_after_min: service.buffer_after_min,
            }).returning();

            // 6. Insert Devices
            if (request.device_ids && request.device_ids.length > 0) {
                await tx.insert(schema.appointment_devices).values(
                    request.device_ids.map(deviceId => ({
                        appointment_id: inserted.id,
                        device_id: deviceId
                    }))
                );
            }

            return inserted;
        });
    }

    async cancelAppointment(id: number, tenantId: number) {
        await this.fastify.db.delete(schema.appointments).where(and(eq(schema.appointments.id, id), eq(schema.appointments.tenant_id, tenantId)));
    }

    async createPatient(
        data: { name: string; email?: string },
        tenantId: number
    ) {
        const [patient] = await this.fastify.db.insert(schema.patients).values({
            tenant_id: tenantId,
            name: data.name,
            email: data.email,
        }).returning();

        return patient;
    }

    async getPatients(tenantId: number) {
        const patientList = await this.fastify.db.select()
            .from(schema.patients)
            .where(eq(schema.patients.tenant_id, tenantId));

        return patientList;
    }
}
