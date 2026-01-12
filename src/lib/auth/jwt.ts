import jwt from 'jsonwebtoken';
import type { UserRole } from './roles.js';

const JWT_SECRET = import.meta.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const JWT_ACCESS_EXPIRES_IN = import.meta.env.JWT_ACCESS_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = import.meta.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId?: string;
  id?: string;
  username: string;
  isAdmin?: boolean;
  role?: UserRole;
  type?: 'access' | 'refresh';
}

export function generateToken(payload: JWTPayload): string {
  // Normaliser le payload pour utiliser userId ou id
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
  };
  return jwt.sign(normalizedPayload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Génère un token d'accès (courte durée)
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'type'>): string {
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'access' as const,
  };
  return jwt.sign(normalizedPayload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
}

/**
 * Génère un token de rafraîchissement (longue durée)
 */
export function generateRefreshToken(payload: Omit<JWTPayload, 'type'>): string {
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'refresh' as const,
  };
  return jwt.sign(normalizedPayload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
