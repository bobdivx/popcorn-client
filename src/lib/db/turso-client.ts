import { createClient } from '@libsql/client';

type Client = ReturnType<typeof createClient>;

export interface TursoCredentials {
  databaseUrl: string;
  authToken: string;
}

let tursoClient: Client | null = null;
let currentCredentials: TursoCredentials | null = null;

/**
 * Initialise le client Turso avec des credentials
 */
export function initTursoClient(credentials: TursoCredentials): Client {
  tursoClient = createClient({
    url: credentials.databaseUrl,
    authToken: credentials.authToken,
  });
  
  currentCredentials = credentials;
  
  return tursoClient;
}

/**
 * Obtient le client Turso actuel
 */
export function getTursoClient(): Client | null {
  return tursoClient;
}

/**
 * Vérifie si le client Turso est initialisé
 */
export function isTursoConnected(): boolean {
  return tursoClient !== null;
}

/**
 * Déconnecte le client Turso
 */
export function disconnectTursoClient(): void {
  tursoClient = null;
  currentCredentials = null;
}
