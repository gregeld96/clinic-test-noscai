import { db, pool } from '.';
import { tenants, doctors, services, rooms, patients, working_hours, breaks, devices, service_devices, appointment_devices, appointments } from './schema';

async function cleanDatabase() {
    console.log('Cleaning database...');

    // Order matters for FK constraints
    await db.delete(appointment_devices);
    await db.delete(appointments);
    await db.delete(service_devices);
    await db.delete(breaks);
    await db.delete(working_hours);
    await db.delete(devices);
    await db.delete(rooms);
    await db.delete(services);
    await db.delete(patients);
    await db.delete(doctors);
    await db.delete(tenants);
    console.log('Database cleaned.');
}

async function runSeed() {
    console.log('Seeding...');
    try {
        await cleanDatabase();

        // 1. Tenants
        const [tenant] = await db.insert(tenants).values({ name: 'City Central Clinic' }).returning({ id: tenants.id });
        const tenantId = tenant.id;

        // 2. Doctors
        const [doc1] = await db.insert(doctors).values({ tenant_id: tenantId, name: 'Dr. Alice Smith' }).returning({ id: doctors.id });
        const [doc2] = await db.insert(doctors).values({ tenant_id: tenantId, name: 'Dr. Bob Jones' }).returning({ id: doctors.id });

        // 3. Rooms
        const [room1] = await db.insert(rooms).values({ tenant_id: tenantId, name: 'Room 101' }).returning({ id: rooms.id });
        const [room2] = await db.insert(rooms).values({ tenant_id: tenantId, name: 'Room 102' }).returning({ id: rooms.id });
        const [room3] = await db.insert(rooms).values({ tenant_id: tenantId, name: 'Room 201' }).returning({ id: rooms.id });

        // 4. Devices
        const [device1] = await db.insert(devices).values({ tenant_id: tenantId, name: 'Portable X-Ray', device_type: 'imaging' }).returning({ id: devices.id });
        const [device2] = await db.insert(devices).values({ tenant_id: tenantId, name: 'Heart Rate Monitor A', device_type: 'monitoring' }).returning({ id: devices.id });

        // 5. Services
        const [service1] = await db.insert(services).values({
            tenant_id: tenantId,
            name: 'General Checkup',
            duration_min: 30,
            buffer_before_min: 5,
            buffer_after_min: 5,
            requires_room: true,
            requires_device: false
        }).returning({ id: services.id });

        const [service2] = await db.insert(services).values({
            tenant_id: tenantId,
            name: 'X-Ray Scan',
            duration_min: 20,
            buffer_before_min: 10,
            buffer_after_min: 10,
            requires_room: true,
            requires_device: true
        }).returning({ id: services.id });

        const [service3] = await db.insert(services).values({
            tenant_id: tenantId,
            name: 'Extended Consultation',
            duration_min: 60,
            buffer_before_min: 0,
            buffer_after_min: 0,
            requires_room: true,
            requires_device: false
        }).returning({ id: services.id });

        // Link service 2 with device 1
        await db.insert(service_devices).values({
            service_id: service2.id,
            device_id: device1.id
        });

        // 6. Patients
        const [patient1] = await db.insert(patients).values({ tenant_id: tenantId, name: 'John Doe', email: 'john@example.com' }).returning({ id: patients.id });
        const [patient2] = await db.insert(patients).values({ tenant_id: tenantId, name: 'Jane Doe', email: 'jane@example.com' }).returning({ id: patients.id });

        // 7. Working Hours
        const days = [1, 2, 3, 4, 5]; // Mon to Fri
        for (const d of days) {
            await db.insert(working_hours).values({
                tenant_id: tenantId,
                doctor_id: doc1.id,
                weekday: d,
                start_time: '08:00:00',
                end_time: '17:00:00'
            });
            await db.insert(working_hours).values({
                tenant_id: tenantId,
                doctor_id: doc2.id,
                weekday: d,
                start_time: '09:00:00',
                end_time: '18:00:00'
            });
        }

        // 8. Breaks
        await db.insert(breaks).values([
            {
                tenant_id: tenantId,
                resource_type: 'doctor',
                resource_id: doc1.id,
                start_time: '12:00:00',
                end_time: '13:00:00',
                description: 'Lunch Break'
            },
            {
                tenant_id: tenantId,
                resource_type: 'doctor',
                resource_id: doc2.id,
                start_time: '13:00:00',
                end_time: '14:00:00',
                description: 'Lunch Break'
            }
        ]);

        // 9. Existing Appointments
        const [appt1] = await db.insert(appointments).values({
            tenant_id: tenantId,
            doctor_id: doc1.id,
            patient_id: patient1.id,
            service_id: service1.id,
            room_id: room1.id,
            starts_at: new Date('2025-12-31T09:20:00Z'),
            ends_at: new Date('2025-12-31T09:50:00Z'),
            buffer_before_min: 5,
            buffer_after_min: 5
        }).returning({ id: appointments.id });

        await db.insert(appointment_devices).values({
            appointment_id: appt1.id,
            device_id: device2.id
        });

        console.log('Seed Complete');
    } catch (e) {
        console.error('Error during seeding:', e);
    } finally {
        await pool.end();
    }
}

runSeed();
