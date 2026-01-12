export const prerender = false;

import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../../lib/db/turso-client.js';
import { getDb } from '../../../../lib/db/client.js';
import { hashPassword } from '../../../../lib/auth/password.js';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { generateId } from '../../../../lib/utils/uuid.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  inviteCode: z.string().min(1, 'Code d\'invitation requis'),
});

/**
 * API d'inscription pour le client
 * Retourne accessToken et refreshToken (pas de cookies)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { email, password, inviteCode } = validation.data;

    // Essayer d'abord Turso, puis fallback sur la base locale
    const tursoClient = getTursoClient();
    let db;
    let useTurso = false;
    
    if (tursoClient) {
      db = tursoClient;
      useTurso = true;
    } else {
      db = getDb();
    }

    // Vérifier le code d'invitation
    // Pour l'instant, utiliser la table invitations de la base locale
    // (les invitations cloud seront gérées plus tard si nécessaire)
    const inviteResult = await db.execute({
      sql: 'SELECT * FROM invitations WHERE code = ? AND used_by IS NULL',
      args: [inviteCode],
    });

    if (inviteResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidInviteCode',
          message: 'Code d\'invitation invalide ou déjà utilisé',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const invitation = inviteResult.rows[0];

    // Vérifier si l'email existe déjà
    const accountTable = useTurso ? 'cloud_accounts' : 'users';
    const userCheck = await db.execute({
      sql: `SELECT id FROM ${accountTable} WHERE email = ?`,
      args: [email],
    });

    if (userCheck.rows.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'EmailExists',
          message: 'Cet email est déjà utilisé',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Créer le compte
    const userId = generateId();
    const passwordHash = await hashPassword(password);
    const now = Date.now();

    await db.execute({
      sql: useTurso
        ? `INSERT INTO cloud_accounts (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
        : `INSERT INTO users (id, email, password_hash, created_at, is_admin, role) VALUES (?, ?, ?, ?, ?, ?)`,
      args: useTurso
        ? [userId, email, passwordHash, now]
        : [userId, email, passwordHash, now, 0, 'guest'],
    });

    // Marquer l'invitation comme utilisée
    await db.execute({
      sql: 'UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ?',
      args: [userId, now, invitation.id as string],
    });

    // Générer les tokens
    const accessToken = generateAccessToken({
      userId: userId,
      username: email,
    });
    
    const refreshToken = generateRefreshToken({
      userId: userId,
      username: email,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: userId,
            email: email,
          },
          accessToken,
          refreshToken,
        },
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    
    let errorMessage = 'Une erreur est survenue lors de l\'inscription';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: errorMessage,
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
