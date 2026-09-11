import { z } from 'zod';

export const PaginationQuerySchema = z.object({
    page: z.string().optional()
        .transform(val => (val ? parseInt(val, 10) : 1))
        .refine(val => !isNaN(val) && val >= 1, { message: 'Page must be a positive integer' }),
    pageSize: z.string().optional()
        .transform(val => (val ? parseInt(val, 10) : 50))
        .refine(val => !isNaN(val) && val >= 1 && val <= 100, { message: 'PageSize must be between 1 and 100' })
});

export interface PaginatedResponse<T> {
    data: T[];
    meta: {
        page: number;
        pageSize: number;
        total: number;
    };
}
