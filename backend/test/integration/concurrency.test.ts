import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, pool } from '../../src/db';
import * as schema from '../../src/db/schema';
import { sql } from 'drizzle-orm';
import { BookingService } from '../../src/modules/booking/service';
import { FastifyInstance } from 'fastify';

describe('Concurrency Integration Test', () => {
    let service: BookingService;

    beforeAll(async () => {
        // Clean and Seed minimal data
        await db.delete(schema.appointment_devices);
        await db.delete(schema.appointments);
        await db.delete(schema.service_devices);
        await db.delete(schema.breaks);
        await db.delete(schema.working_hours);
        await db.delete(schema.devices);
        await db.delete(schema.rooms);
        await db.delete(schema.services);
        await db.delete(schema.patients);
        await db.delete(schema.doctors);
        await db.delete(schema.tenants);

        const [tenant] = await db.insert(schema.tenants).values({ name: 'Test Tenant' }).returning();
        const [doctor] = await db.insert(schema.doctors).values({ tenant_id: tenant.id, name: 'Dr. Test' }).returning();
        const [room] = await db.insert(schema.rooms).values({ tenant_id: tenant.id, name: 'Room Test' }).returning();
        const [patient1] = await db.insert(schema.patients).values({ tenant_id: tenant.id, name: 'Patient 1', email: 'p1@test.com' }).returning();
        const [patient2] = await db.insert(schema.patients).values({ tenant_id: tenant.id, name: 'Patient 2', email: 'p2@test.com' }).returning();

        const [serviceData] = await db.insert(schema.services).values({
            tenant_id: tenant.id,
            name: 'Test Service',
            duration_min: 30,
            buffer_before_min: 0,
            buffer_after_min: 0,
            requires_room: true,
            requires_device: false
        }).returning();

        // Working Hours (All day for simplicity)
        await db.insert(schema.working_hours).values({
            tenant_id: tenant.id,
            doctor_id: doctor.id,
            weekday: new Date().getDay(),
            start_time: '00:00',
            end_time: '23:59'
        });

        // Mock Fastify for Service
        const mockFastify = { db } as unknown as FastifyInstance;
        service = new BookingService(mockFastify);

        return { tenant, doctor, room, patient1, patient2, service: serviceData };
    });

    afterAll(async () => {
        // Close pool to avoid hanging
        await pool.end();
    });

    it('should only allow one booking for the same slot when attempted concurrently', async () => {
        // Need to re-fetch the seeded data because beforeAll return value isn't shared easily
        const [tenant] = await db.select().from(schema.tenants);
        const [doctor] = await db.select().from(schema.doctors);
        const [room] = await db.select().from(schema.rooms);
        const [patient1] = await db.select().from(schema.patients).where(sql`name = 'Patient 1'`);
        const [patient2] = await db.select().from(schema.patients).where(sql`name = 'Patient 2'`);
        const [serviceData] = await db.select().from(schema.services);

        const startsAt = new Date();
        startsAt.setMinutes(startsAt.getMinutes() + 60); // 1 hour from now
        startsAt.setSeconds(0);
        startsAt.setMilliseconds(0);
        const startsAtStr = startsAt.toISOString();

        const req1 = {
            doctor_id: doctor.id,
            patient_id: patient1.id,
            service_id: serviceData.id,
            room_id: room.id,
            starts_at: startsAtStr,
            device_ids: []
        };

        const req2 = {
            doctor_id: doctor.id,
            patient_id: patient2.id,
            service_id: serviceData.id,
            room_id: room.id,
            starts_at: startsAtStr,
            device_ids: []
        };

        // Attempt both simultaneously
        const results = await Promise.allSettled([
            service.createAppointment(req1, tenant.id),
            service.createAppointment(req2, tenant.id)
        ]);

        const fulfilled = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        // The error should be a ConflictError from the DB constraint (or caught by my service check if it somehow happens sequentially but very fast)
        // If it's a DB constraint violation, the service will throw a generic error UNLESS caught.
        // Wait, my service has checks, but they might both PASS if done in the same millisecond before either transaction commits.
        // BUT the DB exclusion constraint will definitely catch it on commit.

        const error: any = rejected[0];
        // If it was caught by DB constraint, it might be a PostgresError
        console.log('Concurrent rejection:', error.reason);
    });
});
