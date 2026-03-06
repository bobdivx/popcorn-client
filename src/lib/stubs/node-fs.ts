/**
 * Stub pour le module fs de Node.js
 * Utilisé uniquement pour éviter les erreurs d'import dans Tauri
 * Les routes API qui utilisent vraiment fs sont exclues du build Tauri
 */

export function existsSync(path: string): boolean {
  // Dans Tauri, utiliser l'API Tauri pour vérifier l'existence
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    // Retourner false par défaut (ne devrait jamais être appelé dans Tauri)
    return false;
  }
  
  // Fallback pour Node.js (ne devrait jamais arriver dans Tauri)
  if (typeof process !== 'undefined' && process.versions?.node) {
    const fs = require('fs');
    return fs.existsSync(path);
  }
  
  return false;
}

export function mkdirSync(path: string, options?: any): void {
  // Dans Tauri, utiliser l'API Tauri pour créer des répertoires
  if (typeof window !== 'undefined' && (window as any).__TAURI__) {
    // Ne rien faire (ne devrait jamais être appelé dans Tauri)
    return;
  }
  
  // Fallback pour Node.js (ne devrait jamais arriver dans Tauri)
  if (typeof process !== 'undefined' && process.versions?.node) {
    const fs = require('fs');
    return fs.mkdirSync(path, options);
  }
}

export default {
  existsSync,
  mkdirSync,
};
