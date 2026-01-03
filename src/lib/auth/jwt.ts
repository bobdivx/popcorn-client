import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export interface JWTPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh';
}

/**
 * Génère un token JWT d'accès
 */
export function generateAccessToken(userId: string, email: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: 'access',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Génère un token JWT de rafraîchissement
 */
export function generateRefreshToken(userId: string, email: string): string {
  const payload: JWTPayload = {
    userId,
    email,
    type: 'refresh',
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  });
}

/**
 * Vérifie et décode un token JWT
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Token invalide');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expiré');
    }
    throw new Error('Erreur de vérification du token');
  }
}

/**
 * Extrait le token depuis l'en-tête Authorization
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}