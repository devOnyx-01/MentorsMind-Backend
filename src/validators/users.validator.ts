import { z } from 'zod';
import { idParamSchema } from '../schemas/common.schemas';

export const updateUserSchema = z.object({
  params: idParamSchema.shape.params,
  body: z.object({
    firstName: z.string().min(2).max(100).optional(),
    lastName: z.string().min(2).max(100).optional(),
    bio: z.string().max(1000).optional(),
  }).strict(),
});

export const updateMeSchema = z.object({
  body: z.object({
    firstName: z.string().min(2).max(100).optional(),
    lastName: z.string().min(2).max(100).optional(),
    bio: z.string().max(1000).optional(),
  }).strict(),
});

export const avatarUploadSchema = z.object({
  body: z.object({
    avatarBase64: z
      .string()
      .min(1, 'Avatar data is required')
      .regex(/^data:image\/(jpeg|png|webp);base64,/, 'Must be a base64-encoded JPEG, PNG, or WebP image'),
  }),
});

export { idParamSchema };
