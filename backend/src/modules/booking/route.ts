import { FastifyInstance } from 'fastify';
import { BookingController } from './controller';
import { CreateAppointmentSchema, CreatePatientSchema } from './validation';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export default async function bookingRoutes(fastify: FastifyInstance) {
    const controller = new BookingController(fastify);
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.post('/api/appointments', {
        schema: {
            body: CreateAppointmentSchema,
            tags: ['Booking'],
        }
    }, controller.create.bind(controller));

    app.delete('/api/appointments/:id', {
        schema: {
            tags: ['Booking'],
            params: z.object({
                id: z.string()
            })
        }
    }, controller.delete.bind(controller));

    app.get('/api/services', {
        schema: {
            tags: ['Metadata']
        }
    }, controller.getServices.bind(controller));

    app.get('/api/doctors', {
        schema: {
            tags: ['Metadata']
        }
    }, controller.getDoctors.bind(controller));

    app.post('/api/patients', {
        schema: {
            body: CreatePatientSchema,
            tags: ['Patients'],
        }
    }, controller.createPatient.bind(controller));

    app.get('/api/patients', {
        schema: {
            tags: ['Patients']
        }
    }, controller.getPatients.bind(controller));
}
