import pino from "pino";
import os from 'os';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// ---------------------------------------------------------------------------
// Sensitive-field redaction paths (pino built-in redaction)
// ---------------------------------------------------------------------------
const REDACT_PATHS = [
  "password",
  "token",
  "secret",
  "secretKey",
  "authorization",
  "refreshToken",
  "apiKey",
  "privateKey",
  "*.password",
  "*.token",
  "*.secret",
  "*.secretKey",
  "*.authorization",
  "*.refreshToken",
  "*.apiKey",
  "*.privateKey",
  "req.headers.authorization",
  "req.body.password",
  "req.body.token",
];

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_TEST = process.env.NODE_ENV === "test";
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------
export const logger = pino({
  level: IS_TEST ? "silent" : LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(IS_PRODUCTION
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
      }),
});

/**
 * Stable identifier for this process/pod.
 * Priority: INSTANCE_ID env var → hostname → random suffix.
 * Included in every log line so logs from multiple instances can be
 * correlated and filtered independently in Grafana / CloudWatch / Datadog.
 */
export const INSTANCE_ID: string =
  process.env.INSTANCE_ID || os.hostname() || `instance-${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Child-logger helper — attach requestId / correlationId to every log entry
// ---------------------------------------------------------------------------
export function withRequestId(requestId: string): pino.Logger {
  return logger.child({ requestId });
}

/** @deprecated use withRequestId */
export function withCorrelationId(correlationId: string): pino.Logger {
  return logger.child({ correlationId });
}

// ---------------------------------------------------------------------------
// Sensitive-field redaction helper (kept for backward-compat with tests)
// ---------------------------------------------------------------------------
export function redactSensitiveFields(obj: unknown, depth = 0): unknown {
  const SENSITIVE_KEYS = new Set([
    "password",
    "token",
    "secret",
    "secretKey",
    "authorization",
    "refreshToken",
    "apiKey",
    "privateKey",
  ]);
// Attach instanceId to every log entry so log streams from multiple
// API replicas can be distinguished without grep.
const instanceFormat = winston.format((info) => {
  (info as any).instanceId = INSTANCE_ID;
  return info;
});

export const logger = winston.createLogger({
  level: LOG_LEVEL,
  levels: winston.config.npm.levels,
  defaultMeta: { instanceId: INSTANCE_ID },
  format: instanceFormat(),
  transports,
  // Never exit on uncaught exceptions within the logger itself
  exitOnError: false,
});

  if (depth > 10 || obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj))
    return obj.map((item) => redactSensitiveFields(item, depth + 1));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = SENSITIVE_KEYS.has(key)
      ? "[REDACTED]"
      : redactSensitiveFields(value, depth + 1);
  }
  return result;
}
