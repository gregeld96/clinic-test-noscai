import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ApiResponse, PaginationMeta, ApiErrorDetails } from '../types';
import { AppError } from '../utils/errors';

declare module 'fastify' {
    interface FastifyReply {
        success(data: any, message?: string, statusCode?: number): FastifyReply;
        error(message: string, statusCode?: number, errorDetails?: ApiErrorDetails): FastifyReply;
        paginated(data: any[], pagination: PaginationMeta, message?: string, statusCode?: number): FastifyReply;
        handleError(error: any): FastifyReply;
    }
}

const responsePlugin: FastifyPluginAsync = async (fastify) => {
    fastify.decorateReply('success', function (data: any, message: string = 'Success', statusCode: number = 200) {
        const response: ApiResponse = {
            success: true,
            message,
            data
        };
        return this.code(statusCode).send(response);
    });

    fastify.decorateReply('error', function (message: string, statusCode: number = 500, errorDetails?: ApiErrorDetails) {
        const response: ApiResponse = {
            success: false,
            message,
            error: errorDetails
        };
        return this.code(statusCode).send(response);
    });

    fastify.decorateReply('paginated', function (
        data: any[],
        pagination: PaginationMeta,
        message: string = 'Data retrieved successfully',
        statusCode: number = 200
    ) {
        const response: ApiResponse = {
            success: true,
            message,
            data,
            pagination
        };
        this.code(statusCode).send(response);
        return this;
    });

    fastify.decorateReply('handleError', function (error: any) {
        if (error instanceof AppError) {
            return this.error(error.message, error.statusCode, {
                code: error.code,
                details: error.details
            });
        }

        // Handle PostgreSQL unique violations or other generic errors with status codes if possible
        if (error.message.includes('Conflict')) {
            return this.error(error.message, 409);
        }

        if (error.message.includes('not found') || error.message.includes('unauthorized')) {
            return this.error(error.message, 404);
        }

        return this.error(error.message || 'Internal Server Error', 500);
    });
};

export default fp(responsePlugin, {
    name: 'response-plugin'
});
