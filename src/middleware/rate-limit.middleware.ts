import { Request, Response, NextFunction } from 'express';
import { RateLimiterService } from '../services/rate-limiter.service';
import rateLimitsConfig, { RateLimitProfile } from '../config/rate-limits.config';
import {
  ipKey,
  userKey,
  isAdminRequest,
  setRateLimitHeaders,
  buildRateLimitEvent,
  logRateLimitEvent,
} from '../utils/rate-limit.utils';

// ─── Core Factory ─────────────────────────────────────────────────────────────

type KeyStrategy = 'ip' | 'user';

interface CreateLimiterOptions {
  profile: RateLimitProfile;
  keyStrategy?: KeyStrategy;
  /** Override the profile message */
  message?: string;
}

/**
 * Creates a sliding-window rate-limit middleware backed by Redis (or in-memory).
 *
 * - Admin users are always bypassed.
 * - Attaches X-RateLimit-* headers on every response.
 * - Logs events for monitoring and alerting.
 */
function createLimiter(options: CreateLimiterOptions) {
  const { profile, keyStrategy = 'ip', message } = options;
  const responseMessage = message ?? profile.message;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Admin bypass
    if (isAdminRequest(req)) {
      res.setHeader('X-RateLimit-Bypass', 'admin');
      return next();
    }

    const key = keyStrategy === 'user' ? userKey(req) : ipKey(req);

    // Skip successful requests if configured (e.g. auth endpoints)
    // We still need to check first, then decide whether to count
    const result = await RateLimiterService.check(key, profile.windowMs, profile.max);

    setRateLimitHeaders(res, {
      limit: result.limit,
      current: result.current,
      remaining: result.remaining,
      resetTime: result.resetTime,
    });

    const event = buildRateLimitEvent(req, key, !result.allowed, result.remaining);
    logRateLimitEvent(event);

    if (!result.allowed) {
      res.setHeader('Retry-After', Math.ceil((result.resetTime.getTime() - Date.now()) / 1000));
      res.status(429).json({
        status: 'error',
        message: responseMessage,
        retryAfter: result.resetTime.toISOString(),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}

// ─── Pre-built Limiters ───────────────────────────────────────────────────────

/** Global IP-based limiter — applied to all routes */
export const generalLimiter = createLimiter({
  profile: rateLimitsConfig.general,
  keyStrategy: 'ip',
});

/** Auth endpoints (login, register, refresh) — strict IP-based */
export const authLimiter = createLimiter({
  profile: rateLimitsConfig.auth,
  keyStrategy: 'ip',
});

/** Authenticated API routes — per-user sliding window */
export const apiLimiter = createLimiter({
  profile: rateLimitsConfig.api,
  keyStrategy: 'user',
});

/** Sensitive flows (password reset, email verify) — very strict */
export const sensitiveLimiter = createLimiter({
  profile: rateLimitsConfig.sensitive,
  keyStrategy: 'ip',
});

/** Payment / Stellar endpoints */
export const paymentLimiter = createLimiter({
  profile: rateLimitsConfig.payment,
  keyStrategy: 'user',
});

/** Public read-only endpoints */
export const publicLimiter = createLimiter({
  profile: rateLimitsConfig.public,
  keyStrategy: 'ip',
});

/** Factory for custom per-route limiters */
export { createLimiter };
