import { Router } from 'express';
import { ResponseUtil } from '../utils/response.utils';
import authRoutes from './auth.routes';
import usersRoutes from './users.routes';
import exportRoutes from './export.routes';
import adminRoutes from './admin.routes';
import bookingsRoutes from './bookings.routes';
import timezoneRoutes from './timezone.routes';
import { AdminService } from '../services/admin.service';
import { BookingsService } from '../services/bookings.service';

const router = Router();

// Initialize admin tables (async, don't block)
AdminService.initialize().catch((err) => {
  console.error('Failed to initialize admin tables:', err);
});

// Initialize bookings tables (async, don't block)
BookingsService.initialize().catch(err => {
  console.error('Failed to initialize bookings tables:', err);
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/', exportRoutes);
router.use('/admin', adminRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/timezones', timezoneRoutes);

/**
 * @swagger
 * /:
 *   get:
 *     summary: API version info
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API info
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/', (_req, res) => {
  ResponseUtil.success(
    res,
    {
      version: '1.0.0',
      name: 'MentorMinds Stellar API',
      description: 'Backend API for MentorMinds platform',
      endpoints: {
        health: '/health',
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        mentors: '/api/v1/mentors',
        bookings: '/api/v1/bookings',
        payments: '/api/v1/payments',
        wallets: '/api/v1/wallets',
      },
      documentation: '/api/docs',
    },
    'Welcome to MentorMinds API',
  );
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Service health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
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
 *                         uptime: { type: number, example: 3600 }
 *                         timestamp: { type: string, format: date-time }
 *                         environment: { type: string, example: production }
 *                         version: { type: string, example: v1 }
 */
router.get('/health', asyncHandler(HealthController.getHealth));

/**
 * @swagger
 * /ready:
 *   get:
 *     summary: Service readiness check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
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
 *                         database: { type: boolean }
 *                         stellar: { type: boolean }
 *       503:
 *         description: Service not ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const health = await HealthService.checkHealth();
  const isReady = health.overall === 'healthy';
  ResponseUtil.success(res, { ...health, isReady }, isReady ? 'Service is ready' : 'Service degraded', isReady ? 200 : 503);
}));

export default router;
