import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../lib/db/turso';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({
          valid: false,
          message: 'Code de parrainage requis',
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

    // Vérifier si le code existe et n'a pas été utilisé
    const result = await client.execute({
      sql: 'SELECT id FROM invitations WHERE code = ? AND used_by IS NULL',
      args: [code],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({
          valid: false,
          message: 'Code de parrainage invalide ou déjà utilisé',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        message: 'Code de parrainage valide',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de la validation du code:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        message: 'Une erreur est survenue lors de la validation',
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
