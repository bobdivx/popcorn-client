/**
 * Stub pour le module fs (système de fichiers)
 * Non disponible dans le navigateur, utilisé uniquement comme fallback
 * pour les modules qui tentent de l'importer
 */

export const statSync = () => ({ 
  isFile: () => false, 
  isDirectory: () => false,
  size: 0,
  mtime: new Date(),
});

export const readFileSync = () => {
  throw new Error('readFileSync is not available in browser');
};

export const writeFileSync = () => {
  throw new Error('writeFileSync is not available in browser');
};

export const existsSync = () => false;

export const readdirSync = () => [];

export const mkdirSync = () => {
  throw new Error('mkdirSync is not available in browser');
};

export const unlinkSync = () => {
  throw new Error('unlinkSync is not available in browser');
};

export const rmdirSync = () => {
  throw new Error('rmdirSync is not available in browser');
};

export const createReadStream = () => {
  throw new Error('createReadStream is not available in browser');
};

export const createWriteStream = () => {
  throw new Error('createWriteStream is not available in browser');
};

export default {
  statSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  unlinkSync,
  rmdirSync,
  createReadStream,
  createWriteStream,
};
