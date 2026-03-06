import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { UserRole } from './roles.js';

// Récupérer le secret JWT de l'utilisateur depuis le stockage local
// Si non trouvé, utiliser le secret d'environnement ou générer un secret temporaire
function getJWTSecret(): string {
  // D'abord, essayer de récupérer le secret stocké depuis localStorage (depuis login/register)
  if (typeof window !== 'undefined') {
    try {
      const storedSecret = localStorage.getItem('jwt_secret');
      if (storedSecret) {
        return storedSecret;
      }
    } catch (error) {
      // localStorage peut ne pas être disponible, continuer
    }
  }
  
  // Ensuite, essayer le secret d'environnement
  const envSecret = import.meta.env.JWT_SECRET;
  if (envSecret) {
    return envSecret;
  }
  
  // En mode production, exiger un secret
  if (import.meta.env.PROD) {
    throw new Error('JWT_SECRET must be defined. Please login or register to get your user-specific JWT secret.');
  }
  
  // En développement, générer un secret aléatoire temporaire
  console.warn('⚠️ JWT_SECRET not found. Generating a temporary secret for development. Please login to get your user-specific secret.');
  return crypto.randomBytes(32).toString('hex');
}
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
  const jwtSecret = getJWTSecret();
  // Normaliser le payload pour utiliser userId ou id
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
  };
  return jwt.sign(normalizedPayload, jwtSecret, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Génère un token d'accès (courte durée)
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'type'>): string {
  const jwtSecret = getJWTSecret();
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'access' as const,
  };
  return jwt.sign(normalizedPayload, jwtSecret, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
  });
}

/**
 * Génère un token de rafraîchissement (longue durée)
 */
export function generateRefreshToken(payload: Omit<JWTPayload, 'type'>): string {
  const jwtSecret = getJWTSecret();
  const normalizedPayload = {
    ...payload,
    userId: payload.userId || payload.id || '',
    type: 'refresh' as const,
  };
  return jwt.sign(normalizedPayload, jwtSecret, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const jwtSecret = getJWTSecret();
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}
