import { createClient } from '@libsql/client';
import { config } from 'dotenv';

// Charger les variables d'environnement depuis .env
config();

let client: ReturnType<typeof createClient> | null = null;

export function getTursoClient() {
  if (client) {
    return client;
  }

  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl || !authToken) {
    throw new Error('TURSO_DATABASE_URL et TURSO_AUTH_TOKEN doivent être définis dans les variables d\'environnement');
  }

  client = createClient({
    url: databaseUrl,
    authToken: authToken,
  });

  return client;
}
