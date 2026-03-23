/**
 * Mentor / Session Validation Schemas
 * Zod schemas for mentor profile and scheduling endpoints.
 */

import { z } from 'zod';
import { idParamSchema, shortTextSchema, longTextSchema, urlSchema, paginationSchema } from './common.schemas';

const hourlyRateSchema = z
    .number()
    .positive('Hourly rate must be positive')
    .max(10_000, 'Hourly rate exceeds maximum allowed value');

// ---------------------------------------------------------------------------
// Mentor profile schemas
// ---------------------------------------------------------------------------

export const updateMentorProfileSchema = z.object({
    params: idParamSchema.shape.params,
    body: z.object({
        headline: shortTextSchema.optional(),
        bio: longTextSchema.optional(),
        skills: z
            .array(z.string().trim().min(1).max(50))
            .max(30, 'You can list at most 30 skills')
            .optional(),
        hourlyRate: hourlyRateSchema.optional(),
        currency: z
            .string()
            .length(3, 'Currency code must be exactly 3 characters (ISO 4217)')
            .toUpperCase()
            .optional(),
        timezone: z
            .string()
            .trim()
            .max(50)
            .optional(),
        linkedinUrl: urlSchema.optional().or(z.literal('')),
        githubUrl: urlSchema.optional().or(z.literal('')),
        websiteUrl: urlSchema.optional().or(z.literal('')),
    }).strict(),
});

// ---------------------------------------------------------------------------
// Session schemas
// ---------------------------------------------------------------------------

export const createSessionSchema = z.object({
    body: z.object({
        mentorId: z.string().uuid('Mentor ID must be a valid UUID'),
        scheduledAt: z
            .string()
            .min(1, 'Scheduled time is required')
            .datetime({ message: 'scheduledAt must be an ISO 8601 datetime string' })
            .refine(
                (v) => new Date(v) > new Date(),
                { message: 'Session must be scheduled in the future' },
            ),
        durationMinutes: z
            .number()
            .int('Duration must be a whole number of minutes')
            .min(15, 'Session must be at least 15 minutes')
            .max(240, 'Session cannot exceed 4 hours'),
        topic: shortTextSchema,
        notes: longTextSchema.optional(),
    }).strict(),
});

export const updateSessionSchema = z.object({
    params: idParamSchema.shape.params,
    body: z.object({
        scheduledAt: z
            .string()
            .datetime({ message: 'scheduledAt must be an ISO 8601 datetime string' })
            .refine(
                (v) => new Date(v) > new Date(),
                { message: 'Session must be scheduled in the future' },
            )
            .optional(),
        durationMinutes: z
            .number()
            .int()
            .min(15)
            .max(240)
            .optional(),
        topic: shortTextSchema.optional(),
        notes: longTextSchema.optional(),
        status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
    }).strict(),
});

export const listSessionsSchema = z.object({
    query: paginationSchema.shape.query.extend({
        status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
    }),
});

export type UpdateMentorProfileInput = z.infer<typeof updateMentorProfileSchema>['body'];
export type CreateSessionInput = z.infer<typeof createSessionSchema>['body'];
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>['body'];
export type ListSessionsQuery = z.infer<typeof listSessionsSchema>['query'];
