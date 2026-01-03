import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  // Si requireAuth retourne une Response, c'est une erreur
  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const client = getTursoClient();

    // Récupérer les informations de synchronisation
    const accountResult = await client.execute({
      sql: 'SELECT last_sync_at, created_at, updated_at FROM cloud_accounts WHERE id = ?',
      args: [userId],
    });

    if (accountResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AccountNotFound',
          message: 'Compte non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const account = accountResult.rows[0];
    const lastSyncAt = account.last_sync_at as number | null;

    // Compter les indexers
    const indexersCountResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM cloud_indexers WHERE account_id = ?',
      args: [userId],
    });
    const indexersCount = indexersCountResult.rows[0].count as number;

    // Compter les settings
    const settingsCountResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM cloud_user_settings WHERE account_id = ?',
      args: [userId],
    });
    const settingsCount = settingsCountResult.rows[0].count as number;

    // Vérifier si la config backend existe
    const backendConfigResult = await client.execute({
      sql: 'SELECT COUNT(*) as count FROM cloud_backend_config WHERE account_id = ?',
      args: [userId],
    });
    const hasBackendConfig = (backendConfigResult.rows[0].count as number) > 0;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          last_sync_at: lastSyncAt,
          account_created_at: account.created_at,
          account_updated_at: account.updated_at,
          indexers_count: indexersCount,
          settings_count: settingsCount,
          has_backend_config: hasBackendConfig,
          status: lastSyncAt ? 'synced' : 'never_synced',
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
    console.error('[Sync Status] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération du statut de synchronisation',
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