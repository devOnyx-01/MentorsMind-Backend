import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service';
import { JwtUtils } from '../utils/jwt.utils';
import { ResponseUtil } from '../utils/response.utils';

/**
 * Middleware to handle token refresh requests
 * Rotates the refresh token and issues a new access token
 */
export const handleTokenRefresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      ResponseUtil.unauthorized(res, 'Refresh token required');
      return;
    }

    const fingerprint = JwtUtils.getDeviceFingerprint(req);

    try {
      const tokens = await TokenService.rotateRefreshToken(
        refreshToken,
        fingerprint,
      );
      ResponseUtil.success(res, tokens, 'Token refreshed successfully');
    } catch (error: any) {
      // Check for specific security errors to log them
      if (
        error.message.includes('Suspicious activity') ||
        error.message.includes('Device mismatch')
      ) {
        // Here you could also trigger an audit log or email the user
        console.warn(`SECURITY ALERT: ${error.message} for IP ${req.ip}`);
        ResponseUtil.unauthorized(res, 'Security alert: Session revoked');
        return;
      }

      ResponseUtil.unauthorized(res, error.message || 'Invalid refresh token');
    }
  } catch (error) {
    next(error);
  }
};
