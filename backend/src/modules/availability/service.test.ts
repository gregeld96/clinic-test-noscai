import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvailabilityService } from './service';
import { FastifyInstance } from 'fastify';
import { parseISO, addMinutes, format } from 'date-fns';

describe('AvailabilityService', () => {
    let service: AvailabilityService;
    let mockFastify: any;

    beforeEach(() => {
        const mockDb = {
            select: vi.fn(),
            from: vi.fn(),
            where: vi.fn(),
            innerJoin: vi.fn(),
            leftJoin: vi.fn(),
            execute: vi.fn()
        };
        mockDb.select.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.innerJoin.mockReturnValue(mockDb);
        mockDb.leftJoin.mockReturnValue(mockDb);

        mockFastify = {
            db: mockDb
        };
        service = new AvailabilityService(mockFastify as unknown as FastifyInstance);
    });

    describe('checkAvailability', () => {
        it('should return the next 3 slots correctly considering buffers', async () => {
            const tenantId = 1;
            const request = {
                service_id: 1,
                from: '2026-01-02T08:00:00',
                to: '2026-01-02T18:00:00',
                limit: 3
            };

            const mockDb = mockFastify.db;

            // Mock Service Details
            mockDb.where.mockResolvedValueOnce([{
                id: 1,
                tenant_id: tenantId,
                name: 'Consultation',
                duration_min: 30,
                buffer_before_min: 5,
                buffer_after_min: 10,
                requires_room: true,
                requires_device: false
            }]);

            // Mock Doctors
            mockDb.where.mockResolvedValueOnce([{ id: 101, name: 'Dr. Smith', tenant_id: tenantId }]);

            // Mock Working Hours (prefetch)
            mockDb.where.mockResolvedValueOnce([{
                doctor_id: 101, weekday: 5, start_time: '09:00:00', end_time: '12:00:00', tenant_id: tenantId
            }]);

            // Other prefetches (breaks, appts, rooms, devices)
            mockDb.where.mockResolvedValueOnce([]); // breaks
            mockDb.where.mockResolvedValueOnce([]); // appts
            mockDb.where.mockResolvedValueOnce([{ id: 1, name: 'Room 1', tenant_id: tenantId }]); // rooms
            mockDb.where.mockResolvedValueOnce([]); // service_devices

            vi.spyOn(service, 'getDoctorSchedule').mockResolvedValue([
                { type: 'available', start: '2026-01-02T09:00:00', end: '2026-01-02T12:00:00', doctor_id: 101, doctor_name: 'Dr. Smith' }
            ]);

            // Mock findAvailableRoom
            vi.spyOn(service as any, 'findAvailableRoom').mockResolvedValue(1);

            const results = await service.checkAvailability(request, tenantId);

            expect(results).toHaveLength(3);

            // Slot 1: Starts at 09:00
            expect(format(new Date(results[0].start), 'HH:mm:ss')).toBe('09:00:00');
            expect(format(new Date(results[0].end), 'HH:mm:ss')).toBe('09:40:00');

            // Slot 2: starts at 09:40
            expect(format(new Date(results[1].start), 'HH:mm:ss')).toBe('09:40:00');
            expect(format(new Date(results[1].end), 'HH:mm:ss')).toBe('10:20:00');

            expect(format(new Date(results[2].start), 'HH:mm:ss')).toBe('10:20:00');
            expect(format(new Date(results[2].end), 'HH:mm:ss')).toBe('11:00:00');
        });

        it('should respect breaks and skip unavailable periods', async () => {
            const tenantId = 1;
            const request = {
                service_id: 1,
                from: '2026-01-02T08:00:00',
                to: '2026-01-02T18:00:00',
                limit: 1
            };

            const mockDb = mockFastify.db;

            // Service
            mockDb.where.mockResolvedValueOnce([{
                id: 1, tenant_id: tenantId, duration_min: 30, buffer_before_min: 5, buffer_after_min: 5, requires_room: true
            }]);
            // Doctors
            mockDb.where.mockResolvedValueOnce([{ id: 101, name: 'Dr. Smith', tenant_id: tenantId }]);
            // WH prefetch
            mockDb.where.mockResolvedValueOnce([{
                doctor_id: 101, weekday: 5, start_time: '09:00:00', end_time: '12:00:00', tenant_id: tenantId
            }]);
            // others
            mockDb.where.mockResolvedValueOnce([]); // breaks
            mockDb.where.mockResolvedValueOnce([]); // appts
            mockDb.where.mockResolvedValueOnce([{ id: 1, name: 'Room 1', tenant_id: tenantId }]); // rooms
            mockDb.where.mockResolvedValueOnce([]); // devices

            // getDoctorSchedule returns a gap starting at 10:00 (after a break)
            vi.spyOn(service, 'getDoctorSchedule').mockResolvedValue([
                { type: 'closed', start: '2026-01-02T08:00:00', end: '2026-01-02T09:00:00', doctor_id: 101, doctor_name: 'Dr. Smith' },
                { type: 'break', start: '2026-01-02T09:00:00', end: '2026-01-02T10:00:00', doctor_id: 101, doctor_name: 'Dr. Smith' },
                { type: 'available', start: '2026-01-02T10:00:00', end: '2026-01-02T12:00:00', doctor_id: 101, doctor_name: 'Dr. Smith' }
            ]);

            vi.spyOn(service as any, 'findAvailableRoom').mockResolvedValue(1);

            const results = await service.checkAvailability(request, tenantId);

            // Should start after the break.
            // The break ends at 10:00. 10:00 is NOT shift start (09:00).
            // So actualBufferBefore = 5.
            // serviceStart = 10:00.
            // BUT wait, if serviceStart is 10:00, effectiveStart is 09:55.
            // The break ends at 10:00. So [09:55, 10:00] conflicts with the break!
            // So it should increment by 5m until it fits.
            // 10:05 serviceStart -> effectiveStart 10:00. This fits!

            expect(format(new Date(results[0].start), 'HH:mm:ss')).toBe('10:05:00');
        });
    });
});
