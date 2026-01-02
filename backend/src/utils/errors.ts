export class AppError extends Error {
    constructor(
        public message: string,
        public statusCode: number = 500,
        public code?: string,
        public details?: any
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string, details?: any) {
        super(message, 409, 'CONFLICT', details);
        this.name = 'ConflictError';
    }
}

export class NotFoundError extends AppError {
    constructor(message: string, details?: any) {
        super(message, 404, 'NOT_FOUND', details);
        this.name = 'NotFoundError';
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string, details?: any) {
        super(message, 401, 'UNAUTHORIZED', details);
        this.name = 'UnauthorizedError';
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
        super(message, 400, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}
