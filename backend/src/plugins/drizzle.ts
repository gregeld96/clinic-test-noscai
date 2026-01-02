import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { db, pool } from '../db';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

// Declare augmentation for fastify instance
declare module 'fastify' {
    interface FastifyInstance {
        db: NodePgDatabase<typeof schema>;
    }
}

const drizzlePlugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorate('db', db);

    fastify.addHook('onClose', async (instance) => {
        await pool.end();
        instance.log.info('Drizzle pool connection closed');
    });
};

export default fp(drizzlePlugin, {
    name: 'drizzle-plugin'
});
