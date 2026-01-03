import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../lib/db/turso';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email et mot de passe requis',
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

    // Récupérer le compte cloud
    const userResult = await client.execute({
      sql: 'SELECT id, email, password_hash FROM cloud_accounts WHERE email = ?',
      args: [email],
    });

    if (userResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email ou mot de passe incorrect',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const user = userResult.rows[0];
    const passwordHash = user.password_hash as string;

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Email ou mot de passe incorrect',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // TODO: Créer une session JWT ou cookie sécurisé
    // Pour l'instant, on retourne juste un succès
    // cookies.set('session', 'token-here', { httpOnly: true, secure: true, sameSite: 'strict' });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Connexion réussie',
        user: {
          id: user.id,
          email: user.email,
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
    console.error('Erreur lors de la connexion:', error);
    
    // Message d'erreur plus spécifique
    let errorMessage = 'Une erreur est survenue lors de la connexion';
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
