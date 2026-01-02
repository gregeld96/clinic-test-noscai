import 'fastify';
import { PaginationMeta, ApiErrorDetails } from './index';

declare module 'fastify' {
    interface FastifyRequest {
        tenantId: number;
    }

    interface FastifyReply {
        success(data: any, message?: string, statusCode?: number): FastifyReply;
        error(message: string, statusCode?: number, errorDetails?: ApiErrorDetails): FastifyReply;
        paginated(data: any[], pagination: PaginationMeta, message?: string, statusCode?: number): FastifyReply;
    }
}
