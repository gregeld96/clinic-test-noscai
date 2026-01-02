import { FastifyInstance } from 'fastify';
import tenantPlugin from '../plugins/tenant';
import bookingRoutes from '../modules/booking/route';
import availabilityRoutes from '../modules/availability/route';

export default async function apiRoutes(fastify: FastifyInstance) {
    // Register Tenant Middleware
    fastify.register(tenantPlugin);

    // Register Modules
    fastify.register(bookingRoutes);
    fastify.register(availabilityRoutes);
}
