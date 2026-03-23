import express, { Application } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import config from './config';
import { corsMiddleware } from './middleware/cors.middleware';
import { securityMiddleware, sanitizeInput } from './middleware/security.middleware';
import { requestLogger } from './middleware/logging.middleware';
import { generalLimiter } from './middleware/rate-limit.middleware';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { swaggerOptions } from './config/swagger';
import routes from './routes';

const app: Application = express();
const { apiVersion } = config.server;

// Security middleware (should be first)
app.use(securityMiddleware);
app.use(corsMiddleware);
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(sanitizeInput);
app.use(generalLimiter);
app.set('trust proxy', 1);

// Swagger docs
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use(`/api/${apiVersion}/docs`, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'MentorMinds API Documentation',
}));
app.get(`/api/${apiVersion}/docs.json`, (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API routes
app.use(`/api/${apiVersion}`, routes);

app.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'MentorMinds Stellar API',
    version: apiVersion,
    documentation: `/api/${apiVersion}/docs`,
    health: '/health',
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
