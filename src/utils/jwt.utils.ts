import jwt, { SignOptions } from 'jsonwebtoken';
import config from '../config';
import crypto from 'crypto';
import { Request } from 'express';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  fingerprint?: string;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
  jti: string;
}

export const JwtUtils = {
  /**
   * Generate access token with short TTL (15 min)
   */
  generateAccessToken(payload: TokenPayload, fingerprint?: string): string {
    const options: SignOptions = {
      expiresIn: '15m', // Hardened: 15 min as requested
      issuer: 'mentorsmind-api',
      audience: 'mentorsmind-client',
      jwtid: crypto.randomUUID(),
    };

    const finalPayload = {
      ...payload,
      fingerprint: fingerprint ? this.hashFingerprint(fingerprint) : undefined,
    };

    return jwt.sign(finalPayload, config.jwt.secret, options);
  },

  /**
   * Generate refresh token with longer TTL (7 days)
   */
  generateRefreshToken(payload: TokenPayload, fingerprint?: string): string {
    const options: SignOptions = {
      expiresIn: '7d', // Hardened: 7 days as requested
      issuer: 'mentorsmind-api',
      audience: 'mentorsmind-client',
      jwtid: crypto.randomUUID(),
    };

    const finalPayload = {
      ...payload,
      fingerprint: fingerprint ? this.hashFingerprint(fingerprint) : undefined,
    };

    return jwt.sign(finalPayload, config.jwt.refreshSecret, options);
  },

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): DecodedToken {
    return jwt.verify(token, config.jwt.secret, {
      issuer: 'mentorsmind-api',
      audience: 'mentorsmind-client',
    }) as DecodedToken;
  },

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): DecodedToken {
    return jwt.verify(token, config.jwt.refreshSecret, {
      issuer: 'mentorsmind-api',
      audience: 'mentorsmind-client',
    }) as DecodedToken;
  },

  /**
   * Generate device fingerprint from request
   */
  getDeviceFingerprint(req: Request): string {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    return `${userAgent}-${ip}`;
  },

  /**
   * Hash fingerprint for privacy in token
   */
  hashFingerprint(fingerprint: string): string {
    return crypto.createHash('sha256').update(fingerprint).digest('hex');
  },

  /**
   * Hash token for storage in DB
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  },
};
