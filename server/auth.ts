import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
export { encryptToken, decryptToken } from './utils/encryption';

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  throw new Error('CRITICAL: JWT_SECRET or SESSION_SECRET environment variable must be set. Server cannot start without a secure signing key.');
}
const JWT_EXPIRES_IN = '7d';

export interface JWTPayload {
  userId: number;
  email: string;
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role?: string;
    tenantId?: number | null;
    invitedBy?: number | null;
  };
}

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const generateToken = (userId: number, email: string, tokenVersion: number = 0): string => {
  return jwt.sign(
    { userId, email, tokenVersion } as JWTPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

export const verifyToken = (token: string): JWTPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    return null;
  }
};

export const generateRandomToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const authenticateUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = req.cookies?.auth_token || 
                  (authHeader && !authHeader.startsWith('Bearer sk_prod_') ? authHeader.replace('Bearer ', '') : undefined);

    if (authHeader && authHeader.startsWith('Bearer sk_prod_')) {
      try {
        const { authenticateAPIKey } = await import('./middleware/apiKeyAuth');
        return authenticateAPIKey(req, res, async () => {
          if (req.apiKey) {
            const [apiKeyUser] = await db.select({ role: users.role, email: users.email, tenantId: users.tenantId, invitedBy: users.invitedBy })
              .from(users)
              .where(eq(users.id, req.apiKey!.userId))
              .limit(1);
            if (apiKeyUser) {
              req.user = {
                id: req.apiKey!.userId,
                email: apiKeyUser.email,
                role: apiKeyUser.role || 'user',
                tenantId: apiKeyUser.tenantId,
                invitedBy: apiKeyUser.invitedBy,
              };
            }
            const { enforceAPIKeyRateLimit } = await import('./middleware/apiKeyRateLimiter');
            return enforceAPIKeyRateLimit(req, res, next);
          }
          res.status(401).json({ error: 'Authentication required' });
        });
      } catch (apiKeyError) {
        console.error('API key auth error:', apiKeyError);
        res.status(401).json({ error: 'Authentication failed' });
        return;
      }
    }
    
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    
    const [user] = await db.select({ role: users.role, tokenVersion: users.tokenVersion, tenantId: users.tenantId, invitedBy: users.invitedBy })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const tokenVer = decoded.tokenVersion ?? 0;
    if (tokenVer !== user.tokenVersion) {
      res.status(401).json({ error: 'Token has been invalidated. Please log in again.' });
      return;
    }
    
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: user.role || 'user',
      tenantId: user.tenantId,
      invitedBy: user.invitedBy,
    };
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const token = req.cookies?.auth_token || 
                req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      const [user] = await db.select({ role: users.role, tokenVersion: users.tokenVersion, tenantId: users.tenantId, invitedBy: users.invitedBy })
        .from(users)
        .where(eq(users.id, decoded.userId))
        .limit(1);
      if (user && (decoded.tokenVersion ?? 0) === user.tokenVersion) {
        req.user = { id: decoded.userId, email: decoded.email, role: user.role || 'user', tenantId: user.tenantId, invitedBy: user.invitedBy };
      }
    }
  }
  
  next();
};

export const setAuthCookie = (res: Response, token: string): void => {
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'strict'
  });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie('auth_token');
};
