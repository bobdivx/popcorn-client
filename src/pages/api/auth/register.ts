import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../lib/db/turso';
import { createRequire } from 'module';
import { randomBytes } from 'crypto';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

// Générer un ID unique (comme dans popcorn)
function generateId(): string {
  return randomBytes(16).toString('hex');
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, password, inviteCode } = await request.json();

    // Validation des données
    if (!email || !password || !inviteCode) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Tous les champs sont requis',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Le mot de passe doit contenir au moins 8 caractères',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

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
    const hashedPassword = await bcrypt.hash(password, 10);

    // Générer un ID unique pour le compte
    const accountId = generateId();
    const now = Date.now();

    // Créer le compte cloud
    await client.execute({
      sql: 'INSERT INTO cloud_accounts (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      args: [accountId, email, hashedPassword, now, now],
    });

    const userId = accountId;

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Erreur lors de la création du compte',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Marquer le code de parrainage comme utilisé
    await client.execute({
      sql: 'UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ?',
      args: [userId, Date.now(), inviteId],
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inscription réussie',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription:', error);
    
    // Message d'erreur plus spécifique
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
