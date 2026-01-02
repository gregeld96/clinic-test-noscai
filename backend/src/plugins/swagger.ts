import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
    fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'Clinic API',
                description: 'API for NoscAi Clinic',
                version: '1.0.0',
            },
            servers: [],
            components: {
                securitySchemes: {
                    apiKey: {
                        type: 'apiKey',
                        name: 'X-Tenant-Id',
                        in: 'header',
                    },
                },
            },
            security: [{ apiKey: [] }],
        },
        transform: jsonSchemaTransform,
    });

    fastify.register(fastifySwaggerUi, {
        routePrefix: '/documentation',
    });
};

export default fp(swaggerPlugin, {
    name: 'swagger-plugin'
});
