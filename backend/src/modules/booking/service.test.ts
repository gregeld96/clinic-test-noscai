import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingService } from './service';
import { FastifyInstance } from 'fastify';
import { ConflictError, UnauthorizedError } from '../../utils/errors';

describe('BookingService', () => {
    let service: BookingService;
    let mockFastify: any;

    beforeEach(() => {
        const mockDb = {
            select: vi.fn(),
            from: vi.fn(),
            where: vi.fn(),
            insert: vi.fn(),
            values: vi.fn(),
            execute: vi.fn(),
            transaction: vi.fn()
        };
        mockDb.select.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.insert.mockReturnValue(mockDb);
        mockDb.values.mockReturnValue(mockDb);

        // Transaction takes a callback and should execute it passing the tx object (which is mockDb)
        mockDb.transaction.mockImplementation(async (callback: any) => await callback(mockDb));

        mockFastify = {
            db: mockDb
        };
        service = new BookingService(mockFastify as unknown as FastifyInstance);
    });

    describe('createAppointment', () => {
        const tenantId = 1;
        const validRequest = {
            doctor_id: 101,
            patient_id: 201,
            service_id: 1,
            room_id: 301,
            starts_at: '2026-01-02T10:00:00',
            device_ids: []
        };

        it('should throw UnauthorizedError if service belongs to another tenant', async () => {
            // 1. set_config
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            mockFastify.db.where.mockResolvedValueOnce([]); // Service not found for this tenant
            await expect(service.createAppointment(validRequest, tenantId))
                .rejects.toThrow(UnauthorizedError);
        });

        it('should throw ConflictError if doctor has overlapping appointment', async () => {
            // 1. set_config
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            // 2. Validate Resources
            mockFastify.db.where.mockResolvedValueOnce([{ id: 1, tenant_id: tenantId, duration_min: 30, buffer_before_min: 0, buffer_after_min: 0 }]); // service
            mockFastify.db.where.mockResolvedValueOnce([{ id: 101, tenant_id: tenantId }]); // doctor
            mockFastify.db.where.mockResolvedValueOnce([{ id: 201, tenant_id: tenantId }]); // patient
            mockFastify.db.where.mockResolvedValueOnce([{ id: 301, tenant_id: tenantId }]); // room
            // 3. WH
            mockFastify.db.where.mockResolvedValueOnce([{ doctor_id: 101, start_time: '08:00:00', end_time: '18:00:00', weekday: 5 }]);
            // 4. Breaks
            mockFastify.db.where.mockResolvedValueOnce([]);
            // 5. Doctor Conflict (SQL)
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [{ id: 999 }] });

            await expect(service.createAppointment(validRequest, tenantId))
                .rejects.toThrow(ConflictError);
        });

        it('should throw ConflictError if room is busy', async () => {
            // 1. set_config
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            // 2. Validate Resources
            mockFastify.db.where.mockResolvedValueOnce([{ id: 1, tenant_id: tenantId, duration_min: 30, buffer_before_min: 0, buffer_after_min: 0 }]); // service
            mockFastify.db.where.mockResolvedValueOnce([{ id: 101, tenant_id: tenantId }]); // doctor
            mockFastify.db.where.mockResolvedValueOnce([{ id: 201, tenant_id: tenantId }]); // patient
            mockFastify.db.where.mockResolvedValueOnce([{ id: 301, tenant_id: tenantId }]); // room
            // 3. WH
            mockFastify.db.where.mockResolvedValueOnce([{ doctor_id: 101, start_time: '08:00:00', end_time: '18:00:00', weekday: 5 }]);
            // 4. Breaks
            mockFastify.db.where.mockResolvedValueOnce([]);
            // 5. Doctor Conflict (None)
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            // 6. Room Conflict (SQL)
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [{ id: 888 }] });

            await expect(service.createAppointment(validRequest, tenantId))
                .rejects.toThrow(ConflictError);
        });

        it('should create appointment successfully if no conflicts', async () => {
            // 1. set_config
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            // 2. Validate Resources
            mockFastify.db.where.mockResolvedValueOnce([{ id: 1, tenant_id: tenantId, duration_min: 30, buffer_before_min: 0, buffer_after_min: 0 }]); // service
            mockFastify.db.where.mockResolvedValueOnce([{ id: 101, tenant_id: tenantId }]); // doctor
            mockFastify.db.where.mockResolvedValueOnce([{ id: 201, tenant_id: tenantId }]); // patient
            mockFastify.db.where.mockResolvedValueOnce([{ id: 301, tenant_id: tenantId }]); // room
            // 3. WH
            mockFastify.db.where.mockResolvedValueOnce([{ doctor_id: 101, start_time: '08:00:00', end_time: '18:00:00', weekday: 5 }]);
            // 4. Breaks
            mockFastify.db.where.mockResolvedValueOnce([]);
            // 5. Doctor Conflict (None)
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });
            // 6. Room Conflict (None)
            mockFastify.db.execute.mockResolvedValueOnce({ rows: [] });

            // Mock Insert
            const mockReturning = {
                returning: vi.fn().mockResolvedValueOnce([{ id: 123 }])
            };
            const mockValues = {
                values: vi.fn().mockReturnValue(mockReturning)
            };
            mockFastify.db.insert.mockReturnValue(mockValues);

            const result = await service.createAppointment(validRequest, tenantId);
            expect(result.id).toBe(123);
        });
    });
});
