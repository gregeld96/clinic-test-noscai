import * as schema from '../../db/schema';
import { AvailabilitySearchRequest, TimeSlot, ScheduleItem } from '../../types';
import { eq, and, sql, lt, gt, inArray, or } from 'drizzle-orm';
import { addMinutes, format, parseISO, isBefore, isAfter, getDay, addDays, startOfDay, endOfDay, differenceInMinutes, max, min } from 'date-fns';
import { FastifyInstance } from 'fastify';
import { NotFoundError } from '../../utils/errors';

export class AvailabilityService {
    constructor(private fastify: FastifyInstance) { }

    async checkAvailability(
        request: AvailabilitySearchRequest,
        tenantId: number
    ): Promise<TimeSlot[]> {
        const { service_id, doctor_ids, from, to, limit } = request;
        const fromDate = parseISO(from);
        const toDate = parseISO(to);

        // 1. Get Service Details
        const serviceRows = await this.fastify.db.select().from(schema.services).where(and(eq(schema.services.id, service_id), eq(schema.services.tenant_id, tenantId)));

        if (serviceRows.length === 0) throw new NotFoundError('Service not found');
        const service = serviceRows[0];
        const totalDuration = service.duration_min + service.buffer_before_min + service.buffer_after_min;

        // 2. Identify Candidates (Doctors)
        let doctorIds = doctor_ids;
        const allDoctors = await this.fastify.db.select().from(schema.doctors).where(eq(schema.doctors.tenant_id, tenantId));
        if (!doctorIds || doctorIds.length === 0) {
            doctorIds = allDoctors.map(d => d.id);
        }

        if (!doctorIds || doctorIds.length === 0) return [];


        // Prefetch all appointments and working hours in the range
        // Working Hours
        const whRows = await this.fastify.db.select().from(schema.working_hours)
            .where(and(eq(schema.working_hours.tenant_id, tenantId), inArray(schema.working_hours.doctor_id, doctorIds)));

        // Breaks
        const breakRows = await this.fastify.db.select().from(schema.breaks)
            .where(and(
                eq(schema.breaks.tenant_id, tenantId),
                or(
                    sql`${schema.breaks.date} IS NULL`,
                    and(
                        sql`${schema.breaks.date} >= ${format(fromDate, 'yyyy-MM-dd')}`,
                        sql`${schema.breaks.date} <= ${format(toDate, 'yyyy-MM-dd')}`
                    )
                )
            ));

        // Existing Appointments
        const apptRows = await this.fastify.db.select().from(schema.appointments)
            .where(and(
                eq(schema.appointments.tenant_id, tenantId),
                inArray(schema.appointments.doctor_id, doctorIds),
                gt(schema.appointments.ends_at, new Date(from)),
                lt(schema.appointments.starts_at, new Date(to))
            ));

        // Rooms
        const roomRows = await this.fastify.db.select().from(schema.rooms).where(eq(schema.rooms.tenant_id, tenantId));
        const allRoomIds = roomRows.map(r => r.id);

        // Required Devices for this service
        const reqDeviceRows = await this.fastify.db.select().from(schema.service_devices).where(eq(schema.service_devices.service_id, service_id));
        const possibleDeviceIds = reqDeviceRows.map(rd => rd.device_id);


        // Create lookup maps for names
        const doctorMap = new Map(allDoctors.map(d => [d.id, d.name]));
        const roomMap = new Map(roomRows.map(r => [r.id, r.name]));
        const slots: TimeSlot[] = [];

        for (const docId of doctorIds) {
            if (slots.length >= limit) break;

            const docSchedule = await this.getDoctorSchedule(docId, from, to, tenantId);
            const availableGaps = docSchedule.filter(s => s.type === 'available');

            for (const gap of availableGaps) {
                if (slots.length >= limit) break;

                let gapCursor = parseISO(gap.start);
                const gapEnd = parseISO(gap.end);

                while (slots.length < limit && isBefore(gapCursor, gapEnd)) {
                    // Find the applicable working hour block to check for shift start
                    const dayOfWeek = getDay(gapCursor);
                    const docWh = whRows.filter(wh => wh.doctor_id === docId && wh.weekday === dayOfWeek);
                    const gapCursorStr = format(gapCursor, 'HH:mm:ss');

                    const matchedWh = docWh.find(wh => gapCursorStr >= wh.start_time && gapCursorStr < wh.end_time);
                    if (!matchedWh) {
                        // If we are at the end of a WH block, jump to the next WH or end of day
                        // Or if gapCursor is outside any WH block for the current day
                        break;
                    }

                    const isShiftStart = gapCursorStr === matchedWh.start_time;
                    const actualBufferBefore = isShiftStart ? 0 : service.buffer_before_min;

                    const serviceStart = gapCursor; // The actual service start time
                    const serviceEnd = addMinutes(serviceStart, service.duration_min);
                    const effectiveStart = addMinutes(serviceStart, -actualBufferBefore);
                    const effectiveEnd = addMinutes(serviceEnd, service.buffer_after_min);

                    if (isAfter(effectiveEnd, gapEnd) || isBefore(effectiveStart, parseISO(gap.start)) || isAfter(serviceEnd, parseISO(format(gapCursor, 'yyyy-MM-dd') + 'T' + matchedWh.end_time))) {
                        // Doesn't fit in current gap or WH block (either too late or too early due to buffer)
                        // Move cursor to the next 5m alignment to try and fit it
                        const nextAttempt = addMinutes(gapCursor, 5);
                        if (isAfter(nextAttempt, gapEnd)) {
                            break;
                        }
                        gapCursor = nextAttempt;
                        continue;
                    }

                    // For the gap check, we essentially already know the doctor is free for [gapCursor, gapEnd].
                    // But we still need to find an available ROOM and optionally DEVICES for [effectiveStart, effectiveEnd].

                    // Check Room Availability
                    const roomId = await this.findAvailableRoom(tenantId, serviceStart, serviceEnd, actualBufferBefore, service.buffer_after_min, apptRows);

                    if (roomId) {
                        // Check Device Availability
                        let selectedDeviceIds: number[] = [];
                        if (service.requires_device) {
                            selectedDeviceIds = await this.findAvailableDevices(tenantId, serviceStart, serviceEnd, actualBufferBefore, service.buffer_after_min, service_id, apptRows);
                        }

                        if (!service.requires_device || selectedDeviceIds.length > 0) {
                            slots.push({
                                doctor_id: docId,
                                doctor_name: doctorMap.get(docId) || 'Unknown',
                                room_id: roomId,
                                room_name: roomMap.get(roomId) || 'Unknown',
                                device_ids: selectedDeviceIds,
                                start: serviceStart.toISOString(),
                                end: effectiveEnd.toISOString()
                            });

                            // Success! Move cursor to the start of the next potential slot, which is effectiveEnd
                            gapCursor = effectiveEnd;
                            continue;
                        }
                    }

                    // If no room or devices at this exact spot, increment by 5m to try another alignment
                    // Ensure we don't increment past the gap end or WH end
                    const nextAttempt = addMinutes(gapCursor, 5);
                    if (isAfter(nextAttempt, gapEnd) || isAfter(nextAttempt, parseISO(format(gapCursor, 'yyyy-MM-dd') + 'T' + matchedWh.end_time))) {
                        break; // Cannot fit another slot or reached end of gap/WH
                    }
                    gapCursor = nextAttempt;
                }
            }
        }

        return slots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }

    private async findAvailableRoom(
        tenantId: number,
        start: Date,
        end: Date,
        bufferBefore: number,
        bufferAfter: number,
        allAppts: any[]
    ): Promise<number | null> {
        const rooms = await this.fastify.db.select().from(schema.rooms).where(eq(schema.rooms.tenant_id, tenantId));
        const effStart = addMinutes(start, -bufferBefore);
        const effEnd = addMinutes(end, bufferAfter);

        for (const room of rooms) {
            const conflicts = allAppts.filter(a => a.room_id === room.id);
            let hasOverlap = false;
            for (const a of conflicts) {
                const aStart = new Date(a.starts_at);
                const aEnd = new Date(a.ends_at);
                // Need to find this appt's buffer. Simplified: use stored buffers if possible.
                // Since this is for room check, let's use the actual buffer stored in DB.
                const aEffStart = addMinutes(aStart, -a.buffer_before_min);
                const aEffEnd = addMinutes(aEnd, a.buffer_after_min);

                if (effStart < aEffEnd && effEnd > aEffStart) {
                    hasOverlap = true;
                    break;
                }
            }
            if (!hasOverlap) return room.id;
        }
        return null;
    }

    private async findAvailableDevices(
        tenantId: number,
        start: Date,
        end: Date,
        bufferBefore: number,
        bufferAfter: number,
        serviceId: number,
        allAppts: any[]
    ): Promise<number[]> {
        const requiredDevices = await this.fastify.db.select({ device_id: schema.service_devices.device_id })
            .from(schema.service_devices)
            .where(eq(schema.service_devices.service_id, serviceId));

        if (requiredDevices.length === 0) return [];

        const effStart = addMinutes(start, -bufferBefore);
        const effEnd = addMinutes(end, bufferAfter);

        const selectedIds: number[] = [];
        // To check device availability, we need to know which devices are assigned to existing appointments.
        // This requires fetching appointment_devices for all relevant appointments.
        const apptDeviceRows = await this.fastify.db.select().from(schema.appointment_devices)
            .where(inArray(schema.appointment_devices.appointment_id, allAppts.map(a => a.id).concat([0])));

        for (const req of requiredDevices) {
            // Find appointments that use this specific required device
            const conflicts = allAppts.filter(a =>
                apptDeviceRows.some(ad => ad.appointment_id === a.id && ad.device_id === req.device_id)
            );

            let hasOverlap = false;
            for (const a of conflicts) {
                const aStart = new Date(a.starts_at);
                const aEnd = new Date(a.ends_at);
                const aEffStart = addMinutes(aStart, -a.buffer_before_min);
                const aEffEnd = addMinutes(aEnd, a.buffer_after_min);

                if (effStart < aEffEnd && effEnd > aEffStart) {
                    hasOverlap = true;
                    break;
                }
            }
            if (!hasOverlap) {
                selectedIds.push(req.device_id);
            } else {
                return []; // If even one required device is not available, the slot is not available
            }
        }
        return selectedIds;
    }

    async getDoctorSchedule(
        doctorId: number,
        from: string,
        to: string,
        tenantId: number
    ): Promise<ScheduleItem[]> {
        const fromDate = parseISO(from);
        const toDate = parseISO(to);

        // 1. Get Doctor Details
        const doctorRows = await this.fastify.db.select().from(schema.doctors).where(and(eq(schema.doctors.id, doctorId), eq(schema.doctors.tenant_id, tenantId)));
        if (doctorRows.length === 0) throw new NotFoundError('Doctor not found');
        const doctor = doctorRows[0];

        // 2. Fetch Working Hours & Breaks
        const whRows = await this.fastify.db.select().from(schema.working_hours)
            .where(and(eq(schema.working_hours.tenant_id, tenantId), eq(schema.working_hours.doctor_id, doctorId)));

        const breakRows = await this.fastify.db.select().from(schema.breaks)
            .where(and(
                eq(schema.breaks.tenant_id, tenantId),
                eq(schema.breaks.resource_type, 'doctor'),
                eq(schema.breaks.resource_id, doctorId),
                or(
                    sql`${schema.breaks.date} IS NULL`,
                    and(
                        sql`${schema.breaks.date} >= ${format(fromDate, 'yyyy-MM-dd')}`,
                        sql`${schema.breaks.date} <= ${format(toDate, 'yyyy-MM-dd')}`
                    )
                )
            ));

        // 3. Fetch Appointments with details
        const apptRows = await this.fastify.db.select({
            id: schema.appointments.id,
            starts_at: schema.appointments.starts_at,
            ends_at: schema.appointments.ends_at,
            patient_id: schema.appointments.patient_id,
            patient_name: schema.patients.name,
            service_id: schema.appointments.service_id,
            service_name: schema.services.name,
            room_id: schema.appointments.room_id,
            room_name: schema.rooms.name,
            buffer_before_min: schema.appointments.buffer_before_min,
            buffer_after_min: schema.appointments.buffer_after_min,
        })
            .from(schema.appointments)
            .leftJoin(schema.patients, eq(schema.appointments.patient_id, schema.patients.id))
            .leftJoin(schema.services, eq(schema.appointments.service_id, schema.services.id))
            .leftJoin(schema.rooms, eq(schema.appointments.room_id, schema.rooms.id))
            .where(and(
                eq(schema.appointments.tenant_id, tenantId),
                eq(schema.appointments.doctor_id, doctorId),
                gt(schema.appointments.ends_at, fromDate),
                lt(schema.appointments.starts_at, toDate)
            ));

        const schedule: ScheduleItem[] = [];
        let timelineCursor = fromDate;

        // Iterate through each day in range
        let currentDateStart = startOfDay(fromDate);
        while (isBefore(currentDateStart, toDate)) {
            const dayOfWeek = getDay(currentDateStart);
            const dayWh = whRows.filter(wh => wh.weekday === dayOfWeek).sort((a, b) => a.start_time.localeCompare(b.start_time));

            // If there's a gap between the current timeline cursor and the first working hour of the day, mark it as closed.
            // Or if there are no working hours for the day, mark the whole day as closed.
            if (dayWh.length === 0) {
                const dayEnd = min([endOfDay(currentDateStart), toDate]);
                if (isBefore(timelineCursor, dayEnd)) {
                    schedule.push({
                        type: 'closed' as any,
                        start: timelineCursor.toISOString(),
                        end: dayEnd.toISOString(),
                        doctor_id: doctorId,
                        doctor_name: doctor.name
                    });
                    timelineCursor = dayEnd;
                }
            } else {
                const firstWhStart = new Date(currentDateStart);
                const [firstWhSH, firstWhSM] = dayWh[0].start_time.split(':').map(Number);
                firstWhStart.setHours(firstWhSH, firstWhSM, 0, 0);

                if (isBefore(timelineCursor, firstWhStart)) {
                    const closedEnd = min([firstWhStart, toDate]);
                    if (isBefore(timelineCursor, closedEnd)) {
                        schedule.push({
                            type: 'closed' as any,
                            start: timelineCursor.toISOString(),
                            end: closedEnd.toISOString(),
                            doctor_id: doctorId,
                            doctor_name: doctor.name
                        });
                        timelineCursor = closedEnd;
                    }
                }
            }


            for (const wh of dayWh) {
                const [startH, startM] = wh.start_time.split(':').map(Number);
                const [endH, endM] = wh.end_time.split(':').map(Number);

                let periodStart = new Date(currentDateStart);
                periodStart.setHours(startH, startM, 0, 0);

                let periodEnd = new Date(currentDateStart);
                periodEnd.setHours(endH, endM, 0, 0);

                // Gap between cursor and period start is "closed"
                if (isBefore(timelineCursor, periodStart)) {
                    const closedEnd = min([periodStart, toDate]);
                    if (isBefore(timelineCursor, closedEnd)) {
                        schedule.push({
                            type: 'closed' as any,
                            start: timelineCursor.toISOString(),
                            end: closedEnd.toISOString(),
                            doctor_id: doctorId,
                            doctor_name: doctor.name
                        });
                        timelineCursor = closedEnd;
                    }
                }

                // Constrain period by request range cursor
                periodStart = max([periodStart, timelineCursor]);
                periodEnd = min([periodEnd, toDate]);

                if (!isBefore(periodStart, periodEnd)) {
                    timelineCursor = max([timelineCursor, periodEnd]);
                    continue;
                }

                // Appointments in this constrained period (using buffered effective ranges)
                const periodAppts = apptRows.filter(a => {
                    const aStart = new Date(a.starts_at);
                    const aEnd = new Date(a.ends_at);
                    const aWhStart = new Date(currentDateStart);
                    aWhStart.setHours(startH, startM, 0, 0);

                    // Buffer before only applicable after second schedule (if not at WH start)
                    const actualBufferBefore = (format(aStart, 'HH:mm:ss') === wh.start_time) ? 0 : a.buffer_before_min;
                    const aEffStart = addMinutes(aStart, -actualBufferBefore);
                    const aEffEnd = addMinutes(aEnd, a.buffer_after_min);

                    return isBefore(aEffStart, periodEnd) && isAfter(aEffEnd, periodStart);
                }).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

                let lastEnd = periodStart;

                for (const appt of periodAppts) {
                    const aStart = new Date(appt.starts_at);
                    const aEnd = new Date(appt.ends_at);
                    const actualBufferBefore = (format(aStart, 'HH:mm:ss') === wh.start_time) ? 0 : appt.buffer_before_min;
                    const aEffStart = addMinutes(aStart, -actualBufferBefore);
                    const aEffEnd = addMinutes(aEnd, appt.buffer_after_min);

                    const boundedEffStart = max([aEffStart, periodStart]);
                    const boundedEffEnd = min([aEffEnd, periodEnd]);

                    if (isBefore(lastEnd, boundedEffStart)) {
                        this.addAvailabilityWithBreaks(schedule, lastEnd, boundedEffStart, doctorId, doctor.name, breakRows);
                    }

                    // Add the appointment (core range, but we could also show buffers as occupied)
                    schedule.push({
                        type: 'appointment',
                        start: aStart.toISOString(),
                        end: aEnd.toISOString(),
                        doctor_id: doctorId,
                        doctor_name: doctor.name,
                        appointment_id: appt.id,
                        patient_id: appt.patient_id ?? undefined,
                        patient_name: appt.patient_name ?? undefined,
                        service_id: appt.service_id,
                        service_name: appt.service_name ?? undefined,
                        room_id: appt.room_id,
                        room_name: appt.room_name ?? undefined,
                        // Include buffer info for frontend use if needed
                        buffer_before_min: actualBufferBefore,
                        buffer_after_min: appt.buffer_after_min
                    } as any);

                    lastEnd = boundedEffEnd;
                }

                if (isBefore(lastEnd, periodEnd)) {
                    this.addAvailabilityWithBreaks(schedule, lastEnd, periodEnd, doctorId, doctor.name, breakRows);
                }
                timelineCursor = periodEnd;
            }
            currentDateStart = addDays(currentDateStart, 1);
        }

        // Final gap to toDate
        if (isBefore(timelineCursor, toDate)) {
            schedule.push({
                type: 'closed' as any,
                start: timelineCursor.toISOString(),
                end: toDate.toISOString(),
                doctor_id: doctorId,
                doctor_name: doctor.name
            });
        }

        return schedule.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }

    private addAvailabilityWithBreaks(
        schedule: ScheduleItem[],
        start: Date,
        end: Date,
        doctorId: number,
        doctorName: string,
        breaks: any[]
    ) {
        const startStr = format(start, 'HH:mm:ss');
        const endStr = format(end, 'HH:mm:ss');

        const dateStr = format(start, 'yyyy-MM-dd');
        const periodBreaks = breaks.filter(b => {
            return (b.date === null || b.date === dateStr) && startStr < b.end_time && endStr > b.start_time;
        }).sort((a, b) => a.start_time.localeCompare(b.start_time));

        let current = start;
        for (const b of periodBreaks) {
            const bStart = new Date(start);
            const [bsh, bsm] = b.start_time.split(':').map(Number);
            bStart.setHours(bsh, bsm, 0, 0);

            const bEnd = new Date(start);
            const [beh, bem] = b.end_time.split(':').map(Number);
            bEnd.setHours(beh, bem, 0, 0);

            const effectiveBStart = max([current, bStart]);
            const effectiveBEnd = min([end, bEnd]);

            if (isBefore(current, effectiveBStart)) {
                schedule.push({
                    type: 'available',
                    start: current.toISOString(),
                    end: effectiveBStart.toISOString(),
                    doctor_id: doctorId,
                    doctor_name: doctorName
                });
            }

            schedule.push({
                type: 'break',
                start: effectiveBStart.toISOString(),
                end: effectiveBEnd.toISOString(),
                doctor_id: doctorId,
                doctor_name: doctorName
            });

            current = effectiveBEnd;
        }

        if (isBefore(current, end)) {
            schedule.push({
                type: 'available',
                start: current.toISOString(),
                end: end.toISOString(),
                doctor_id: doctorId,
                doctor_name: doctorName
            });
        }
    }
}
