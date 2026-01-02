import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { AvailabilityService } from './service';
import { appointments } from '../../db/schema';
import { eq, and, gt, lt } from 'drizzle-orm';

export class AvailabilityController {
    private availabilityService: AvailabilityService;

    constructor(private fastify: FastifyInstance) {
        this.availabilityService = new AvailabilityService(fastify);
    }

    async check(request: FastifyRequest, reply: FastifyReply) {
        try {
            const query = request.query as any;
            const tenantId = request.tenantId;

            const doctorIds = query.doctor_ids ? query.doctor_ids.split(',').map(Number) : undefined;

            const slots = await this.availabilityService.checkAvailability({
                service_id: query.service_id,
                doctor_ids: doctorIds,
                from: query.from,
                to: query.to,
                limit: query.limit,
            }, tenantId);

            return reply.success({ slots, limit: query.limit }, 'Availability checked successfully');
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async getDoctorSchedule(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            const { from, to } = request.query as { from: string; to: string };
            const tenantId = request.tenantId;

            const schedule = await this.availabilityService.getDoctorSchedule(
                parseInt(id),
                from,
                to,
                tenantId
            );

            return reply.success(schedule, 'Doctor schedule retrieved successfully');
        } catch (e: any) {
            return reply.handleError(e);
        }
    }
}
