import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export type DbUser = typeof users.$inferSelect;

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: DbUser;
}

const ADMIN_EMAILS = new Set(
  [
    'abdiwalikashka99@gmail.com',
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : []),
  ].map((e) => e.trim().toLowerCase()).filter(Boolean)
);

export async function getOrCreateDbUser(decoded: DecodedIdToken): Promise<DbUser> {
  const email = (decoded.email || '').toLowerCase();
  const isAdminEmail = ADMIN_EMAILS.has(email);
  const fullName = decoded.name || email.split('@')[0] || 'Jamii Member';

  const existing = await db.select().from(users).where(eq(users.uid, decoded.uid)).limit(1);
  if (existing[0]) {
    if (isAdminEmail && existing[0].role !== 'admin') {
      const updated = await db
        .update(users)
        .set({ role: 'admin' })
        .where(eq(users.id, existing[0].id))
        .returning();
      return updated[0];
    }
    return existing[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      uid: decoded.uid,
      email: decoded.email || `${decoded.uid}@jamii.ke`,
      fullName,
      phone: '',
      role: isAdminEmail ? 'admin' : 'customer',
      status: 'active',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: decoded.email || `${decoded.uid}@jamii.ke`,
      },
    })
    .returning();

  return inserted[0];
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing authentication token',
      code: 'MISSING_TOKEN',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized: Missing authentication token',
      code: 'MISSING_TOKEN',
    });
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (error: unknown) {
    const firebaseErr = error as { code?: string; message?: string };
    console.error(
      'Error verifying Firebase ID token:',
      firebaseErr.code || firebaseErr.message || error
    );
    if (firebaseErr.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Unauthorized: Access token expired.',
        code: 'TOKEN_EXPIRED',
      });
    }
    if (firebaseErr.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        error: 'Unauthorized: Session revoked. Please sign in again.',
        code: 'TOKEN_REVOKED',
      });
    }
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired token',
      code: 'INVALID_TOKEN',
    });
  }

  try {
    req.firebaseUser = decodedToken;
    req.dbUser = await getOrCreateDbUser(decodedToken);

    if (req.dbUser.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact JAMII CONNECT support.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }
    next();
  } catch (dbError) {
    console.error('Database error during authentication lookup:', dbError);
    return res.status(503).json({
      error: 'Database service temporarily unavailable. Please try again shortly.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.firebaseUser = decodedToken;
      req.dbUser = await getOrCreateDbUser(decodedToken);
    } catch {
      // Ignore invalid token on public endpoints
    }
  }
  next();
};

export const requireRole = (...allowedRoles: Array<'customer' | 'provider' | 'admin'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.dbUser.role as 'customer' | 'provider' | 'admin')) {
      return res.status(403).json({
        error: `Access denied. This action requires ${allowedRoles.join(' or ')} permissions.`,
      });
    }
    next();
  };
};
