import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

/**
 * Hash un mot de passe avec bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare un mot de passe avec un hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}