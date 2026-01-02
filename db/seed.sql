-- Realistic Seed Data for Clinic Scheduling
-- Assume Tenant ID 1 = "City Central Clinic"

INSERT INTO tenants (id, name) VALUES (1, 'City Central Clinic');

-- Doctors
INSERT INTO doctors (id, tenant_id, name) VALUES 
(1, 1, 'Dr. Alice Smith'),
(2, 1, 'Dr. Bob Jones');

-- Rooms
INSERT INTO rooms (id, tenant_id, name) VALUES 
(1, 1, 'Room 101'),
(2, 1, 'Room 102'),
(3, 1, 'Room 201');

-- Devices
INSERT INTO devices (id, tenant_id, name, device_type) VALUES 
(1, 1, 'Portable X-Ray', 'imaging'),
(2, 1, 'Heart Rate Monitor A', 'monitoring');

-- Services
INSERT INTO services (id, tenant_id, name, duration_min, buffer_before_min, buffer_after_min, requires_room, requires_device) VALUES 
(1, 1, 'General Checkup', 30, 5, 5, true, false),
(2, 1, 'X-Ray Scan', 20, 10, 10, true, true),
(3, 1, 'Extended Consultation', 60, 0, 0, true, false);

-- Link Service 2 (X-Ray) to Device 1 (X-Ray Machine)
INSERT INTO service_devices (service_id, device_id) VALUES (2, 1);

-- Working Hours (Mon-Fri, 08:00 to 17:00)
INSERT INTO working_hours (tenant_id, doctor_id, weekday, start_time, end_time) 
SELECT 1, 1, d, '08:00:00', '17:00:00' FROM generate_series(1, 5) d;

INSERT INTO working_hours (tenant_id, doctor_id, weekday, start_time, end_time) 
SELECT 1, 2, d, '09:00:00', '18:00:00' FROM generate_series(1, 5) d;

-- Breaks (Lunch break 12:00 to 13:00)
INSERT INTO breaks (tenant_id, resource_type, resource_id, start_time, end_time, description) VALUES 
(1, 'doctor', 1, '12:00:00', '13:00:00', 'Lunch Break'),
(1, 'doctor', 2, '13:00:00', '14:00:00', 'Lunch Break');

-- Patients
INSERT INTO patients (id, tenant_id, name, email) VALUES 
(1, 1, 'John Doe', 'john@example.com'),
(2, 1, 'Jane Doe', 'jane@example.com');

-- Existing Appointments (Today - assuming 2025-12-31 for testing purposes)
-- 09:20 to 09:50 for Dr Alice
-- This appointment has 5min buffers, so it occupies 09:15 to 09:55
INSERT INTO appointments (id, tenant_id, doctor_id, patient_id, service_id, room_id, starts_at, ends_at, buffer_before_min, buffer_after_min) VALUES 
(1, 1, 1, 1, 1, 1, '2025-12-31 09:20:00+00', '2025-12-31 09:50:00+00', 5, 5);

-- Associate Device 1 with Appt 1 (if it needed it, but service 1 doesn't)
-- Associate Device 2 with Appt 1 manually for testing
INSERT INTO appointment_devices (appointment_id, device_id) VALUES (1, 2);

-- Reset Sequences (For PG serial)
SELECT setval('tenants_id_seq', (SELECT max(id) FROM tenants));
SELECT setval('doctors_id_seq', (SELECT max(id) FROM doctors));
SELECT setval('rooms_id_seq', (SELECT max(id) FROM rooms));
SELECT setval('devices_id_seq', (SELECT max(id) FROM devices));
SELECT setval('services_id_seq', (SELECT max(id) FROM services));
SELECT setval('patients_id_seq', (SELECT max(id) FROM patients));
SELECT setval('appointments_id_seq', (SELECT max(id) FROM appointments));
