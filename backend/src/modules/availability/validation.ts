import { z } from 'zod';

export const SearchQuerySchema = z.object({
    service_id: z.coerce.number(),
    doctor_ids: z.string().optional(),
    from: z.string(),
    to: z.string(),
    limit: z.coerce.number().optional().default(10),
});