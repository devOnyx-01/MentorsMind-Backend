import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Generates a unique requestId per request, attaches it to res.locals
 * and echoes it back in the X-Request-Id response header.
 *
 * Downstream middleware and handlers can read it via res.locals.requestId.
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const requestId = uuidv4();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
