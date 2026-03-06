/**
 * Stub pour le module path de Node.js
 * Utilisé uniquement pour éviter les erreurs d'import dans Tauri
 * Les routes API qui utilisent vraiment path sont exclues du build Tauri
 * 
 * En mode SSR (Node.js), utilise directement le module path natif
 */

// Cache pour le module path natif (évite les imports répétés)
let nativePathModule: typeof import('path') | null = null;

async function getNativePath(): Promise<typeof import('path')> {
  if (!nativePathModule) {
    nativePathModule = await import('path');
  }
  return nativePathModule;
}

export async function resolveAsync(...paths: string[]): Promise<string> {
  // Dans Tauri (navigateur), utiliser une logique simple de résolution de chemin
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    // Pour Tauri, utiliser des chemins simples
    return paths.join('/').replace(/\/+/g, '/');
  }
  
  // En Node.js (SSR), utiliser le module path natif
  if (typeof process !== 'undefined' && process.versions?.node) {
    const path = await getNativePath();
    return path.resolve(...paths);
  }
  
  return paths.join('/');
}

export function resolve(...paths: string[]): string {
  // Dans Tauri (navigateur), utiliser une logique simple de résolution de chemin
  if (typeof window !== 'undefined' && typeof process === 'undefined') {
    // Pour Tauri, utiliser des chemins simples
    return paths.join('/').replace(/\/+/g, '/');
  }
  
  // En Node.js (SSR), utiliser le module path natif de manière synchrone
  // Note: En ESM, on ne peut pas utiliser require, donc on doit utiliser une résolution manuelle
  // ou faire en sorte que cette fonction soit asynchrone. Pour l'instant, on utilise une résolution simple.
  if (typeof process !== 'undefined' && process.versions?.node) {
    // Utiliser une résolution manuelle qui fonctionne pour la plupart des cas
    // Pour les cas complexes, utiliser resolveAsync()
    let result = paths[0] || '';
    for (let i = 1; i < paths.length; i++) {
      const part = paths[i];
      if (part.startsWith('/') || (process.platform === 'win32' && /^[A-Z]:/i.test(part))) {
        result = part;
      } else {
        result = result ? `${result}/${part}` : part;
      }
    }
    // Normaliser les séparateurs selon la plateforme
    if (process.platform === 'win32') {
      result = result.replace(/\//g, '\\');
    } else {
      result = result.replace(/\\/g, '/');
    }
    return result;
  }
  
  return paths.join('/');
}

export default {
  resolve,
  resolveAsync,
};
