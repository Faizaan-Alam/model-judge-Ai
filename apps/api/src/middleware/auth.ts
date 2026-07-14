import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { AppError } from "./errorHandler";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export type AuthedRequest = Request & { user: AuthUser; requestId?: string };

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Missing bearer token"));
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser & { sub?: string };
    (req as AuthedRequest).user = {
      id: payload.id || payload.sub || "",
      email: payload.email,
      role: payload.role || "user",
    };
    if (!(req as AuthedRequest).user.id) {
      return next(new AppError(401, "UNAUTHORIZED", "Invalid token payload"));
    }
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtAccessTtl } as jwt.SignOptions
  );
}
