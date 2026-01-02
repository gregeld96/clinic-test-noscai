import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { tenants } from '../db/schema';
import { eq } from 'drizzle-orm';

const tenantPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.addHook('onRequest', async (request, reply) => {
        const tenantId = request.headers['x-tenant-id'] as string;

        if (!tenantId) {
            return reply.error('Unauthorized: X-Tenant-Id header is required', 403);
        }

        if (isNaN(parseInt(tenantId))) {
            return reply.error('Unauthorized: Invalid X-Tenant-Id format', 403);
        }

        const tenantIdInt = parseInt(tenantId);

        const tenant = await fastify.db.query.tenants.findFirst({ where: eq(tenants.id, tenantIdInt) });

        if (!tenant) {
            return reply.error('Unauthorized: Tenant not found', 403);
        }

        // Attach tenantId to request for easy access in controllers
        request.tenantId = tenantIdInt;
    });
};

export default fp(tenantPlugin, {
    name: 'tenant-plugin'
});
