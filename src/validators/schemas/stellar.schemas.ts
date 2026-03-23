/**
 * Stellar Validation Schemas
 * Zod schemas for Stellar-blockchain-related endpoints.
 */

import { z } from 'zod';
import { stellarAddressSchema, stellarTxHashSchema, idParamSchema } from './common.schemas';

export const linkStellarWalletSchema = z.object({
    body: z.object({
        stellarAddress: stellarAddressSchema,
    }).strict(),
});

export const verifyTransactionSchema = z.object({
    body: z.object({
        transactionHash: stellarTxHashSchema,
        expectedAmount: z
            .string()
            .regex(/^\d+(\.\d{1,7})?$/, 'Amount must be a valid decimal with up to 7 decimal places'),
        assetCode: z
            .string()
            .trim()
            .min(1)
            .max(12, 'Asset code must not exceed 12 characters')
            .regex(/^[A-Z0-9]+$/, 'Asset code must be uppercase letters or digits')
            .optional(),
    }).strict(),
});

export const paymentQuerySchema = z.object({
    params: idParamSchema.shape.params,
    query: z.object({
        cursor: z.string().optional(),
        limit: z
            .string()
            .optional()
            .transform((v) => (v ? parseInt(v, 10) : 10))
            .refine((v) => v >= 1 && v <= 100, 'Limit must be between 1 and 100'),
        order: z.enum(['asc', 'desc']).optional().default('desc'),
    }),
});

export type LinkStellarWalletInput = z.infer<typeof linkStellarWalletSchema>['body'];
export type VerifyTransactionInput = z.infer<typeof verifyTransactionSchema>['body'];
export type PaymentQuery = z.infer<typeof paymentQuerySchema>['query'];
