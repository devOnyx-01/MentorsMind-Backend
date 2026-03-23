import { Router } from 'express';
import { UsersController } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireOwnerOrAdmin } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validation.middleware';
import { asyncHandler } from '../utils/asyncHandler.utils';
import {
  updateUserSchema,
  updateMeSchema,
  avatarUploadSchema,
} from '../validators/schemas/users.schemas';
import { idParamSchema } from '../validators/schemas/common.schemas';

const router = Router();

// All user routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
router.get('/me', asyncHandler(UsersController.getMe));

/**
 * @swagger
 * /users/me:
 *   put:
 *     summary: Update current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               bio: { type: string }
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Validation error
 */
router.put('/me', validate(updateMeSchema), asyncHandler(UsersController.updateMe));

/**
 * @swagger
 * /users/avatar:
 *   post:
 *     summary: Upload user avatar (base64)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [avatarBase64]
 *             properties:
 *               avatarBase64:
 *                 type: string
 *                 description: Base64-encoded image (data:image/jpeg;base64,...)
 *     responses:
 *       200:
 *         description: Avatar updated
 *       400:
 *         description: Validation error
 */
router.post('/avatar', validate(avatarUploadSchema), asyncHandler(UsersController.uploadAvatar));

/**
 * @swagger
 * /users/{id}/public:
 *   get:
 *     summary: Get public profile of a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Public user profile
 *       404:
 *         description: User not found
 */
router.get('/:id/public', validate(idParamSchema), asyncHandler(UsersController.getPublicUser));

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID (owner or admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User profile
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get('/:id', validate(idParamSchema), requireOwnerOrAdmin, asyncHandler(UsersController.getUser));

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user by ID (owner or admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               bio: { type: string }
 *     responses:
 *       200:
 *         description: Updated user
 *       403:
 *         description: Forbidden
 */
router.put(
  '/:id',
  validate(updateUserSchema),
  requireOwnerOrAdmin,
  asyncHandler(UsersController.updateUser)
);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete (deactivate) user by ID (owner or admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204:
 *         description: Deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete(
  '/:id',
  validate(idParamSchema),
  requireOwnerOrAdmin,
  asyncHandler(UsersController.deleteUser)
);

export default router;
