import { FastifyInstance } from 'fastify';
import { AvailabilityController } from './controller';
import { SearchQuerySchema } from './validation';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

export default async function availabilityRoutes(fastify: FastifyInstance) {
    const controller = new AvailabilityController(fastify);
    const app = fastify.withTypeProvider<ZodTypeProvider>();

    app.get('/api/availability', {
        schema: {
            querystring: SearchQuerySchema,
            tags: ['Availability'],
        }
    }, controller.check.bind(controller));

    app.get('/api/doctors/:id/schedule', {
        schema: {
            tags: ['Availability'],
            params: z.object({
                id: z.string()
            }),
            querystring: z.object({
                from: z.string(),
                to: z.string()
            })
        }
    }, controller.getDoctorSchedule.bind(controller));
}
