import type { ApiResponse } from '../types.js';

// Variable pour stocker l'URL de base dynamique
let cachedBaseUrl: string | null = null;

/**
 * Obtient l'URL de base du backend depuis serverApi
 */
export async function getBaseUrl(): Promise<string> {
  // Si une URL est définie dans les variables d'environnement, l'utiliser
  if (import.meta.env.PUBLIC_BACKEND_URL) {
    return import.meta.env.PUBLIC_BACKEND_URL;
  }
  
  // Utiliser le cache si disponible
  if (cachedBaseUrl) {
    return cachedBaseUrl;
  }
  
  // Essayer de récupérer depuis serverApi
  try {
    const { serverApi } = await import('../server-api.js');
    const serverUrl = serverApi.getServerUrl();
    if (serverUrl && serverUrl !== 'undefined') {
      cachedBaseUrl = serverUrl;
      return cachedBaseUrl;
    }
  } catch {
    // Ignorer les erreurs
  }
  
  // Fallback vers la valeur par défaut
  // Le backend Rust écoute sur le port 4326 par défaut (même port que le serveur Astro)
  return 'http://127.0.0.1:4326';
}

/**
 * Gère la réponse HTTP et la parse en JSON
 */
export async function handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const contentType = response.headers.get('content-type');
  
  // Si c'est une erreur 404, retourner une réponse avec success: false mais ne pas throw
  // Cela permet au code appelant de gérer le cas "non trouvé" gracieusement
  if (response.status === 404) {
    const text = await response.text();
    let errorData: any = { error: 'Not found' };
    try {
      errorData = JSON.parse(text);
    } catch {
      // Ignorer si ce n'est pas du JSON
    }
    return {
      success: false,
      error: errorData.error || 'Not found',
      data: undefined,
    };
  }
  
  // Vérifier si la réponse est du JSON
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text();
    throw new Error(
      `Réponse non-JSON reçue (${response.status}): ${text.substring(0, 100)}. ` +
      `Assurez-vous que le backend Rust est démarré et accessible.`
    );
  }
  
  const data: ApiResponse<T> = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }
  
  return data;
}

/**
 * Gère les erreurs et retourne un message d'erreur approprié
 */
export function handleError(error: unknown): Error {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return new Error('Le serveur client torrent n\'est pas disponible. Assurez-vous que le backend Rust est en cours d\'exécution.');
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error('Erreur inconnue');
}

/**
 * Extrait l'infoHash depuis un message d'erreur de torrent dupliqué
 */
export function extractInfoHashFromError(errorMsg: string): string | null {
  // Essayer plusieurs patterns pour extraire l'infoHash
  const patterns = [
    /info_hash[:\s]+([a-f0-9]{40})/i,
    /info[:\s]+hash[:\s]+([a-f0-9]{40})/i,
    /avec l'info_hash[:\s]+([a-f0-9]{40})/i,
    /avec l'info_hash\s+([a-f0-9]{40})/i,
    /\(info_hash:\s+([a-f0-9]{40})\)/i,
    /info_hash:\s+([a-f0-9]{40})/i,
    /([a-f0-9]{40})/i,
  ];
  
  for (const pattern of patterns) {
    const match = errorMsg.match(pattern);
    if (match && match[1] && match[1].length === 40) {
      const infoHash = match[1].toLowerCase();
      if (/^[a-f0-9]{40}$/i.test(infoHash)) {
        return infoHash;
      }
    }
  }
  
  return null;
}
