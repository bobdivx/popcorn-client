import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../../lib/db/turso';
import { hashPassword } from '../../../../lib/auth/password';
import { z } from 'zod';
import { randomBytes } from 'crypto';

export const prerender = false;

// Générer un ID unique
function generateId(): string {
  return randomBytes(16).toString('hex');
}

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  inviteCode: z.string().min(1, 'Code d\'invitation requis'),
});

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

    const client = getTursoClient();

    // Vérifier si le code de parrainage existe et n'a pas été utilisé
    const inviteResult = await client.execute({
      sql: 'SELECT id FROM invitations WHERE code = ? AND used_by IS NULL',
      args: [inviteCode],
    });

    if (inviteResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidInviteCode',
          message: 'Code de parrainage invalide ou déjà utilisé',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const inviteId = inviteResult.rows[0].id as string;

    // Vérifier si l'email existe déjà
    const existingUser = await client.execute({
      sql: 'SELECT id FROM cloud_accounts WHERE email = ?',
      args: [email],
    });

    if (existingUser.rows.length > 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'EmailAlreadyExists',
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

    // Hasher le mot de passe
    const hashedPassword = await hashPassword(password);

    // Générer un ID unique pour le compte
    const accountId = generateId();
    const now = Date.now();

    // Créer le compte cloud
    await client.execute({
      sql: 'INSERT INTO cloud_accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      args: [accountId, email, hashedPassword, now, now],
    });

    // Marquer le code de parrainage comme utilisé
    await client.execute({
      sql: 'UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ?',
      args: [accountId, now, inviteId],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'Inscription réussie',
          userId: accountId,
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
      if (error.message.includes('TURSO_DATABASE_URL') || error.message.includes('TURSO_AUTH_TOKEN')) {
        errorMessage = 'Configuration de la base de données manquante. Veuillez contacter l\'administrateur.';
      } else {
        errorMessage = error.message;
      }
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