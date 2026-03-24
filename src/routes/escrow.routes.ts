import { Router } from 'express';
import { EscrowController } from '../controllers/escrow.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validation.middleware';
import { asyncHandler } from '../utils/asyncHandler.utils';
import {
  createEscrowSchema,
  releaseEscrowSchema,
  disputeEscrowSchema,
  resolveDisputeSchema,
  refundEscrowSchema,
  listEscrowsSchema,
  getEscrowByIdSchema,
} from '../validators/schemas/escrow.schemas';

const router = Router();

// All escrow routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /escrow:
 *   get:
 *     summary: List user escrows
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, funded, released, disputed, resolved, refunded, cancelled]
 *         description: Filter by escrow status
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [learner, mentor]
 *         description: Filter by user role in escrow
 *     responses:
 *       200:
 *         description: List of escrows
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Escrow'
 *                     meta:
 *                       $ref: '#/components/schemas/PaginationMeta'
 */
router.get('/', validate(listEscrowsSchema), asyncHandler(EscrowController.listEscrows));

/**
 * @swagger
 * /escrow:
 *   post:
 *     summary: Create escrow contract
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mentorId
 *               - amount
 *             properties:
 *               mentorId:
 *                 type: string
 *                 format: uuid
 *                 description: Mentor's user ID
 *               amount:
 *                 type: string
 *                 pattern: ^\d+(\.\d{1,7})?$
 *                 description: Escrow amount (up to 7 decimal places)
 *                 example: "100.50"
 *               currency:
 *                 type: string
 *                 default: XLM
 *                 description: Currency code
 *                 example: XLM
 *               description:
 *                 type: string
 *                 maxLength: 5000
 *                 description: Escrow description
 *     responses:
 *       201:
 *         description: Escrow created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Escrow'
 */
router.post('/', validate(createEscrowSchema), asyncHandler(EscrowController.createEscrow));

/**
 * @swagger
 * /escrow/{id}:
 *   get:
 *     summary: Get escrow details
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     responses:
 *       200:
 *         description: Escrow details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Escrow'
 *       404:
 *         description: Escrow not found
 */
router.get('/:id', validate(getEscrowByIdSchema), asyncHandler(EscrowController.getEscrow));

/**
 * @swagger
 * /escrow/{id}/status:
 *   get:
 *     summary: Check escrow status
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     responses:
 *       200:
 *         description: Escrow status
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         status:
 *                           type: string
 *                           enum: [pending, funded, released, disputed, resolved, refunded, cancelled]
 *                         amount:
 *                           type: string
 *                         currency:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 */
router.get('/:id/status', validate(getEscrowByIdSchema), asyncHandler(EscrowController.getEscrowStatus));

/**
 * @swagger
 * /escrow/{id}/release:
 *   post:
 *     summary: Release funds to mentor
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stellarTxHash:
 *                 type: string
 *                 pattern: ^[a-fA-F0-9]{64}$
 *                 description: Stellar transaction hash (optional)
 *     responses:
 *       200:
 *         description: Funds released successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Escrow'
 */
router.post('/:id/release', validate(releaseEscrowSchema), asyncHandler(EscrowController.releaseEscrow));

/**
 * @swagger
 * /escrow/{id}/dispute:
 *   post:
 *     summary: Open a dispute
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 2000
 *                 description: Reason for dispute
 *     responses:
 *       200:
 *         description: Dispute opened successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         escrow:
 *                           $ref: '#/components/schemas/Escrow'
 *                         disputeId:
 *                           type: string
 *                           format: uuid
 */
router.post('/:id/dispute', validate(disputeEscrowSchema), asyncHandler(EscrowController.openDispute));

/**
 * @swagger
 * /escrow/{id}/refund:
 *   post:
 *     summary: Process refund to learner
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stellarTxHash:
 *                 type: string
 *                 pattern: ^[a-fA-F0-9]{64}$
 *                 description: Stellar transaction hash (optional)
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Escrow'
 */
router.post('/:id/refund', validate(refundEscrowSchema), asyncHandler(EscrowController.refundEscrow));

/**
 * @swagger
 * /escrow/{id}/resolve:
 *   post:
 *     summary: Resolve dispute (admin only)
 *     tags: [Escrow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Escrow ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resolution
 *             properties:
 *               resolution:
 *                 type: string
 *                 enum: [release_to_mentor, refund_to_learner]
 *                 description: Resolution decision
 *               notes:
 *                 type: string
 *                 maxLength: 5000
 *                 description: Resolution notes
 *               stellarTxHash:
 *                 type: string
 *                 pattern: ^[a-fA-F0-9]{64}$
 *                 description: Stellar transaction hash (optional)
 *     responses:
 *       200:
 *         description: Dispute resolved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Escrow'
 */
router.post('/:id/resolve', requireAdmin, validate(resolveDisputeSchema), asyncHandler(EscrowController.resolveDispute));

export default router;
