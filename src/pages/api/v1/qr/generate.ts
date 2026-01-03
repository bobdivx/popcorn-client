import type { APIRoute } from 'astro';
import { randomBytes } from 'crypto';

// Stockage temporaire des tokens QR pour la connexion (en production, utiliser Redis ou une DB)
const qrLoginTokens = new Map<string, { expiresAt: number; verified: boolean; accountId?: string; email?: string }>();

// Nettoyer les tokens expirés toutes les minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of qrLoginTokens.entries()) {
    if (data.expiresAt < now) {
      qrLoginTokens.delete(token);
    }
  }
}, 60000);

function generateId(): string {
  return randomBytes(16).toString('hex');
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    // Générer un token temporaire (expire dans 5 minutes)
    const token = generateId();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    qrLoginTokens.set(token, {
      expiresAt,
      verified: false,
    });

    // Déterminer l'URL de base
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    const protocol = request.headers.get('x-forwarded-proto') || (origin ? new URL(origin).protocol : 'https');
    const baseUrl = origin || `${protocol}//${host}`;

    // URL complète pour soumettre le QR code (l'appareil mobile appellera cette URL)
    const submitUrl = `${baseUrl}/api/v1/qr/submit`;

    // Le QR code contient l'URL complète avec le token en paramètre
    // L'appareil mobile scannera ce QR code et appellera cette URL avec ses credentials
    const qrData = JSON.stringify({
      type: 'popcorn-cloud-login-request',
      token,
      expiresAt,
      submitUrl,
      baseUrl,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          token,
          qrData,
          expiresAt,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[QR Generate] Erreur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la génération du QR code',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};

/**
 * Vérifie et récupère les données d'un token QR de connexion
 */
export function verifyQRLoginToken(token: string): boolean {
  const data = qrLoginTokens.get(token);
  
  if (!data) {
    return false;
  }
  
  if (data.expiresAt < Date.now()) {
    qrLoginTokens.delete(token);
    return false;
  }
  
  return true;
}

/**
 * Marque un token comme vérifié et retourne les données du compte
 */
export function markQRLoginTokenAsVerified(token: string, accountId: string, email: string): { accountId: string; email: string } | null {
  const data = qrLoginTokens.get(token);
  
  if (!data || data.verified) {
    return null;
  }
  
  if (data.expiresAt < Date.now()) {
    qrLoginTokens.delete(token);
    return null;
  }
  
  data.verified = true;
  data.accountId = accountId;
  data.email = email;
  
  return {
    accountId,
    email,
  };
}

/**
 * Récupère les données d'un token vérifié (one-time use)
 */
export function getVerifiedQRLoginToken(token: string): { accountId: string; email: string } | null {
  const data = qrLoginTokens.get(token);
  
  if (!data || !data.verified) {
    return null;
  }
  
  if (data.expiresAt < Date.now()) {
    qrLoginTokens.delete(token);
    return null;
  }
  
  // Supprimer le token après utilisation (one-time use)
  const accountId = data.accountId!;
  const email = data.email!;
  qrLoginTokens.delete(token);
  
  return {
    accountId,
    email,
  };
}