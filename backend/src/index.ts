import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import drizzlePlugin from './plugins/drizzle';
import swaggerPlugin from './plugins/swagger';
import responsePlugin from './plugins/response';
import apiRoutes from './routes/api';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

dotenv.config();

const fastify = Fastify({
    logger: {
        transport: {
            target: 'pino-pretty',
            options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        },
    },
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Add Zod Type Provider settings
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Register Plugins
fastify.register(fastifyCors, {
    origin: '*',
});
fastify.register(drizzlePlugin);
fastify.register(responsePlugin);
fastify.register(swaggerPlugin);

// Type the instance
const app = fastify.withTypeProvider<ZodTypeProvider>();

app.register(apiRoutes);


// Health Check
app.get('/health', async (request, reply) => {
    return reply.success({ status: 'ok' }, 'Server is healthy');
});

// Start Server
const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        app.log.info(`Server listening on ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
