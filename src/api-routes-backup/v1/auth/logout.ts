export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * API de déconnexion pour le client
 * Le client doit supprimer les tokens localement
 */
export const POST: APIRoute = async ({ request }) => {
  // Vérifier l'authentification (optionnel, pour logging)
  const authHeader = request.headers.get('Authorization');
  
  // Pour le logout, on accepte même sans token (le client peut avoir déjà supprimé les tokens)
  // On retourne simplement un succès
  
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Déconnexion réussie',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
