// Sentry must be initialised before any other imports so it can instrument them
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  enabled: !!process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  profilesSampleRate: 1.0,
  // Only capture server errors — ignore expected client/auth errors
  beforeSend(event) {
    const status = event.contexts?.response?.status_code as number | undefined;
    if (status && status < 500) return null;
    return event;
  },
});

// Config must be imported first — validates env vars before anything else loads
import config from "./config";
import app from "./app";
import { initializeModels } from "./models";
import { createSocketServer } from "./config/socket";
import { initializeSocketService } from "./services/socket.service";
import {
  startStellarStream,
  stopStellarStream,
} from "./services/stellar-stream.service";
import {
  emailWorker,
  paymentWorker,
  escrowReleaseWorker,
  reportWorker,
  sessionReminderWorker,
  notificationCleanupWorker,
  startScheduler,
  stopScheduler,
} from "./workers";
import { initializeEmailTemplates } from "./services/template-initializer.service";
import { logger } from "./utils/logger";
import { logger } from "./utils/logger.utils";

// Initialize database tables, then seed email templates
initializeModels()
  .then(() => initializeEmailTemplates())
  .catch((err) => {
    logger.error({ err }, "Failed to initialize models");
    console.error("Failed to initialize models:", err);
  });

// Start background job workers and scheduler
startScheduler().catch((err) => {
  logger.error("Failed to start job scheduler", { error: err });
});

const { port: PORT, apiVersion: API_VERSION } = config.server;
const NODE_ENV = config.env;

// Start server
const server = app.listen(PORT, () => {
  logger.info("Server started", {
    port: PORT,
    env: NODE_ENV,
    apiUrl: `http://localhost:${PORT}/api/${API_VERSION}`,
    healthCheck: `http://localhost:${PORT}/health`,
    apiDocs: `http://localhost:${PORT}/api/${API_VERSION}/docs`,
    webSocket: `ws://localhost:${PORT}/ws`,
  });
});

// Attach Socket.IO server to the same HTTP server
const io = createSocketServer(server);
initializeSocketService(io);

// Subscribe to Stellar Horizon SSE for real-time payment confirmations
startStellarStream();

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Signal received: closing HTTP server");
  stopStellarStream();
  await Promise.all([
    emailWorker.close(),
    paymentWorker.close(),
    escrowReleaseWorker.close(),
    reportWorker.close(),
    sessionReminderWorker.close(),
    notificationCleanupWorker.close(),
    stopScheduler(),
  ]);
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
