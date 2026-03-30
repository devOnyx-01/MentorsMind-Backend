import { Request, Response, NextFunction } from 'express';
import { IpFilterService } from '../services/ipFilter.service';
import { logger } from '../utils/logger.utils';
import { extractIpAddress, AuditLogService } from '../services/auditLog.service';

/**
 * Global blocklist middleware.
 * Returns 403 Forbidden with no body for blocked IPs.
 */
export async function blocklistMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = extractIpAddress(req);
  
  const isBlocked = await IpFilterService.isIpBlocked(ip);
  if (isBlocked) {
    logger.warn({ ip, path: req.path }, 'Blocked request from blocked IP');
    
    // Log to audit logs for monitoring
    await AuditLogService.log({
      userId: 'system',
      action: 'BLOCKED_IP_REQUEST',
      resourceType: 'security',
      resourceId: ip,
      ipAddress: ip,
      metadata: { path: req.path, method: req.method },
    }).catch(err => logger.error({ err }, 'AuditLog error in blocklistMiddleware'));
    
    // Return Forbidden with no body as per requirement
    return res.status(403).end();
  }
  
  next();
}

/**
 * Admin routes allowlist middleware.
 * Restricts access to admin routes to the allowlist (if non-empty).
 */
export async function adminAllowlistMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = extractIpAddress(req);
  
  const isAllowed = await IpFilterService.isIpAllowed(ip, 'admin');
  if (!isAllowed) {
    logger.warn({ ip, path: req.path }, 'Rejected admin request - IP not in allowlist');
    
    await AuditLogService.log({
      userId: (req as any).user?.id || 'anonymous',
      action: 'ADMIN_ACCESS_DENIED_IP',
      resourceType: 'security',
      resourceId: ip,
      ipAddress: ip,
      metadata: { path: req.path },
    }).catch(err => logger.error({ err }, 'AuditLog error in adminAllowlistMiddleware'));
    
    return res.status(403).end();
  }
  
  next();
}
