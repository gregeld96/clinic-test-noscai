-- Database DDL for Clinic Scheduling
-- Supports PostgreSQL with btree_gist extension for exclusion constraints

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Tenants
CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Doctors
CREATE TABLE doctors (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_doctor_tenant ON doctors(tenant_id);

-- 3. Patients
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_patient_tenant ON patients(tenant_id);

-- 4. Rooms
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_room_tenant ON rooms(tenant_id);

-- 5. Devices
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    device_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_device_tenant ON devices(tenant_id);

-- 6. Services
CREATE TABLE services (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    duration_min INTEGER NOT NULL,
    buffer_before_min INTEGER DEFAULT 0 NOT NULL,
    buffer_after_min INTEGER DEFAULT 0 NOT NULL,
    requires_room BOOLEAN DEFAULT TRUE NOT NULL,
    requires_device BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_service_tenant ON services(tenant_id);

-- 7. Working Hours
CREATE TABLE working_hours (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    weekday INTEGER NOT NULL, -- 0=Sunday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL
);
CREATE INDEX idx_wh_tenant_doctor ON working_hours(tenant_id, doctor_id);

-- 8. Breaks
CREATE TABLE breaks (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    resource_type TEXT DEFAULT 'doctor' NOT NULL, -- 'doctor', 'room', 'device'
    resource_id INTEGER NOT NULL,
    doctor_id INTEGER REFERENCES doctors(id), -- legacy
    date DATE, -- NULL for recurring, value for one-off/holiday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    description TEXT
);
CREATE INDEX idx_break_tenant_resource ON breaks(tenant_id, resource_type, resource_id);

-- 9. Appointments
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    patient_id INTEGER REFERENCES patients(id),
    service_id INTEGER NOT NULL REFERENCES services(id),
    room_id INTEGER NOT NULL REFERENCES rooms(id),
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    buffer_before_min INTEGER DEFAULT 0 NOT NULL,
    buffer_after_min INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for scaling and lookups
CREATE INDEX idx_appt_tenant_time ON appointments(tenant_id, starts_at);
CREATE INDEX idx_appt_tenant_doctor_time ON appointments(tenant_id, doctor_id, starts_at);
CREATE INDEX idx_appt_tenant_room_time ON appointments(tenant_id, room_id, starts_at);

-- STRETCH GOAL: Exclusion Constraints for Race-Condition Prevention
-- This prevents overlapping appointments (including buffers) for the same doctor/room.

-- For Doctor
ALTER TABLE appointments ADD CONSTRAINT no_doctor_overlap 
EXCLUDE USING gist (
    tenant_id WITH =,
    doctor_id WITH =, 
    tstzrange(
        starts_at - (buffer_before_min || ' minutes')::interval, 
        ends_at + (buffer_after_min || ' minutes')::interval
    ) WITH &&
);

-- For Room
ALTER TABLE appointments ADD CONSTRAINT no_room_overlap 
EXCLUDE USING gist (
    tenant_id WITH =,
    room_id WITH =, 
    tstzrange(
        starts_at - (buffer_before_min || ' minutes')::interval, 
        ends_at + (buffer_after_min || ' minutes')::interval
    ) WITH &&
);

-- 10. Appointment Devices
CREATE TABLE appointment_devices (
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES devices(id),
    PRIMARY KEY (appointment_id, device_id)
);

-- 11. Service Devices (Capable devices for a service)
CREATE TABLE service_devices (
    service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    device_id INTEGER NOT NULL REFERENCES devices(id),
    PRIMARY KEY (service_id, device_id)
);

--------------------------------------------------------------------------------
-- STRETCH GOAL: ROW LEVEL SECURITY (RLS)
--------------------------------------------------------------------------------

-- Enable RLS on all domain tables
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE breaks ENABLE ROW LEVEL SECURITY;

-- Dynamic Tenant Isolation Policy
-- Set app.current_tenant_id via: SET app.current_tenant_id = '42';
CREATE POLICY tenant_isolation_policy ON doctors USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON patients USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON rooms USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON devices USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON services USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON appointments USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON working_hours USING (tenant_id = current_setting('app.current_tenant_id')::integer);
CREATE POLICY tenant_isolation_policy ON breaks USING (tenant_id = current_setting('app.current_tenant_id')::integer);
