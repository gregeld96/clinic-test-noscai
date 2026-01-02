import { z } from 'zod';

export const CreateAppointmentSchema = z.object({
    doctor_id: z.number(),
    patient_id: z.number(),
    service_id: z.number(),
    room_id: z.number(),
    device_ids: z.array(z.number()).optional(),
    starts_at: z.string(),
});

export const CreatePatientSchema = z.object({
    name: z.string().min(1),
    email: z.string().email().optional(),
});