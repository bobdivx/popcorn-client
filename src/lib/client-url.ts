/**
 * Obtient l'URL du client Astro
 * 
 * Le client se connecte à son propre serveur Astro (qui expose les routes /api/v1/*)
 * Ces routes font ensuite un proxy vers le backend Rust
 * 
 * Priorité:
 * 1. Variable d'environnement PUBLIC_CLIENT_URL
 * 2. Variable d'environnement PUBLIC_SERVER_URL (pour compatibilité)
 * 3. window.location.origin (en mode client/navigateur - valeur par défaut recommandée)
 * 4. Variable d'environnement PORT (construit l'URL localhost, côté serveur uniquement)
 * 5. Valeur par défaut (localhost:4326, côté serveur uniquement)
 */
export function getClientUrl(): string {
  // 1. En développement local, utiliser PUBLIC_CLIENT_URL si défini
  if (import.meta.env.PUBLIC_CLIENT_URL) {
    return import.meta.env.PUBLIC_CLIENT_URL;
  }
  
  // 2. Pour compatibilité, accepter aussi PUBLIC_SERVER_URL
  if (import.meta.env.PUBLIC_SERVER_URL) {
    return import.meta.env.PUBLIC_SERVER_URL;
  }
  
  // 3. Si on est dans un navigateur, utiliser l'origine actuelle (mode production/client)
  // C'est la valeur par défaut recommandée car elle fonctionne automatiquement
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // 4. Construire depuis le port (développement local, côté serveur uniquement)
  const port = import.meta.env.PORT || import.meta.env.PUBLIC_PORT || 4326;
  return `http://127.0.0.1:${port}`;
}
