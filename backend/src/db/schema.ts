import { pgTable, serial, text, integer, timestamp, time, primaryKey, boolean, index, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const tenants = pgTable('tenants', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    created_at: timestamp('created_at').defaultNow(),
});

export const doctors = pgTable('doctors', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_doctor_tenant').on(t.tenant_id),
}));

export const patients = pgTable('patients', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    email: text('email'),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_patient_tenant').on(t.tenant_id),
}));

export const rooms = pgTable('rooms', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_room_tenant').on(t.tenant_id),
}));

export const devices = pgTable('devices', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    device_type: text('device_type').notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_device_tenant').on(t.tenant_id),
}));

export const services = pgTable('services', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    name: text('name').notNull(),
    duration_min: integer('duration_min').notNull(),
    buffer_before_min: integer('buffer_before_min').default(0).notNull(),
    buffer_after_min: integer('buffer_after_min').default(0).notNull(),
    requires_room: boolean('requires_room').default(true).notNull(),
    requires_device: boolean('requires_device').default(false).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantIdx: index('idx_service_tenant').on(t.tenant_id),
}));

export const working_hours = pgTable('working_hours', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    doctor_id: integer('doctor_id').notNull().references(() => doctors.id),
    weekday: integer('weekday').notNull(), // 0=Sunday
    start_time: time('start_time').notNull(),
    end_time: time('end_time').notNull(),
}, (t) => ({
    tenantDoctorIdx: index('idx_wh_tenant_doctor').on(t.tenant_id, t.doctor_id),
}));

export const breaks = pgTable('breaks', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    resource_type: text('resource_type').default('doctor').notNull(), // 'doctor', 'room', 'device'
    resource_id: integer('resource_id').notNull(),
    doctor_id: integer('doctor_id').references(() => doctors.id), // legacy if still needed
    date: date('date'), // null for recurring, value for one-off/holiday
    start_time: time('start_time').notNull(),
    end_time: time('end_time').notNull(),
    description: text('description'),
}, (t) => ({
    tenantResourceIdx: index('idx_break_tenant_resource').on(t.tenant_id, t.resource_type, t.resource_id),
}));

export const appointments = pgTable('appointments', {
    id: serial('id').primaryKey(),
    tenant_id: integer('tenant_id').notNull().references(() => tenants.id),
    doctor_id: integer('doctor_id').notNull().references(() => doctors.id),
    patient_id: integer('patient_id').references(() => patients.id),
    service_id: integer('service_id').notNull().references(() => services.id),
    room_id: integer('room_id').notNull().references(() => rooms.id),
    starts_at: timestamp('starts_at', { withTimezone: true }).notNull(),
    ends_at: timestamp('ends_at', { withTimezone: true }).notNull(),
    buffer_before_min: integer('buffer_before_min').default(0).notNull(),
    buffer_after_min: integer('buffer_after_min').default(0).notNull(),
    created_at: timestamp('created_at').defaultNow(),
}, (t) => ({
    tenantTimeIdx: index('idx_appt_tenant_time').on(t.tenant_id, t.starts_at),
    tenantDoctorTimeIdx: index('idx_appt_tenant_doctor_time').on(t.tenant_id, t.doctor_id, t.starts_at),
    tenantRoomTimeIdx: index('idx_appt_tenant_room_time').on(t.tenant_id, t.room_id, t.starts_at),
}));

export const appointment_devices = pgTable('appointment_devices', {
    appointment_id: integer('appointment_id').notNull().references(() => appointments.id, { onDelete: 'cascade' }),
    device_id: integer('device_id').notNull().references(() => devices.id),
}, (t) => ({
    pk: primaryKey({ columns: [t.appointment_id, t.device_id] }),
}));

export const service_devices = pgTable('service_devices', {
    service_id: integer('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
    device_id: integer('device_id').notNull().references(() => devices.id),
}, (t) => ({
    pk: primaryKey({ columns: [t.service_id, t.device_id] }),
}));

// Relations (Optional but helpful)
export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
    doctor: one(doctors, { fields: [appointments.doctor_id], references: [doctors.id] }),
    room: one(rooms, { fields: [appointments.room_id], references: [rooms.id] }),
    service: one(services, { fields: [appointments.service_id], references: [services.id] }),
}));

export const doctorsRelations = relations(doctors, ({ many }) => ({
    appointments: many(appointments),
    working_hours: many(working_hours),
    breaks: many(breaks),
}));
