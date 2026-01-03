import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../../lib/db/turso';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt';
import { comparePassword } from '../../../../lib/auth/password';
import { z } from 'zod';

export const prerender = false;

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

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

    const { email, password } = validation.data;

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
          error: 'InvalidCredentials',
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
    const userId = user.id as string;

    // Vérifier le mot de passe
    const isPasswordValid = await comparePassword(password, passwordHash);

    if (!isPasswordValid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidCredentials',
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

    // Générer les tokens
    const accessToken = generateAccessToken(userId, email);
    const refreshToken = generateRefreshToken(userId, email);

    // Définir les cookies (optionnel, pour les applications web)
    cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 jours
      path: '/',
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
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de la connexion:', error);
    
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