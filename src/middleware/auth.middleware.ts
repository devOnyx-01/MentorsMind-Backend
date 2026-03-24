import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types/api.types';
import { ResponseUtil } from '../utils/response.utils';
import { JwtUtils } from '../utils/jwt.utils';
import { TokenService } from '../services/token.service';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ResponseUtil.unauthorized(res, 'No token provided');
      return;
    }

    const token = authHeader.substring(7);
    const decoded = JwtUtils.verifyAccessToken(token);

    // Check if token is blacklisted
    const isBlacklisted = await TokenService.isTokenBlacklisted(decoded.jti);
    if (isBlacklisted) {
      ResponseUtil.unauthorized(res, 'Token has been revoked');
      return;
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      ResponseUtil.unauthorized(res, 'Invalid token');
      return;
    }
    if (error instanceof jwt.TokenExpiredError) {
      ResponseUtil.unauthorized(res, 'Token expired');
      return;
    }
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      ResponseUtil.unauthorized(res, 'Authentication required');
      return;
    }

    if (roles.length && !roles.includes(req.user.role)) {
      ResponseUtil.forbidden(res, 'Insufficient permissions');
      return;
    }

    next();
  };
};
