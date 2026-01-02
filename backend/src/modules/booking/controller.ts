import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { BookingService } from './service';
import { services, doctors } from '../../db/schema';
import { eq } from 'drizzle-orm';

export class BookingController {
    private bookingService: BookingService;

    constructor(private fastify: FastifyInstance) {
        this.bookingService = new BookingService(fastify);
    }

    async create(request: FastifyRequest, reply: FastifyReply) {
        try {
            const body = request.body as any;
            const tenantId = request.tenantId;

            const appointment = await this.bookingService.createAppointment({
                ...body,
            }, tenantId);

            return reply.success(appointment, 'Appointment created successfully', 201);
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async delete(request: FastifyRequest, reply: FastifyReply) {
        try {
            const { id } = request.params as { id: string };
            const tenantId = request.tenantId;
            await this.bookingService.cancelAppointment(parseInt(id), tenantId);
            return reply.success(null, 'Appointment cancelled successfully', 200);
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async getServices(request: FastifyRequest, reply: FastifyReply) {
        try {
            const tenantId = request.tenantId;
            const rows = await this.fastify.db.select().from(services).where(eq(services.tenant_id, tenantId));
            return reply.success(rows, 'Services retrieved successfully');
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async getDoctors(request: FastifyRequest, reply: FastifyReply) {
        try {
            const tenantId = request.tenantId;
            const rows = await this.fastify.db.select().from(doctors).where(eq(doctors.tenant_id, tenantId));
            return reply.success(rows, 'Doctors retrieved successfully');
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async createPatient(request: FastifyRequest, reply: FastifyReply) {
        try {
            const body = request.body as any;
            const tenantId = request.tenantId;

            const patient = await this.bookingService.createPatient(body, tenantId);
            return reply.success(patient, 'Patient created successfully', 201);
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    async getPatients(request: FastifyRequest, reply: FastifyReply) {
        try {
            const tenantId = request.tenantId;

            const patients = await this.getBookingService().getPatients(tenantId);
            return reply.success(patients, 'Patients retrieved successfully');
        } catch (e: any) {
            return reply.handleError(e);
        }
    }

    private getBookingService() {
        if (!this.bookingService) {
            this.bookingService = new BookingService(this.fastify);
        }
        return this.bookingService;
    }
}
