import { FastifyRequest } from 'fastify';
import { ZodSchema } from 'zod';

export function validateInput<T>(schema: ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}
