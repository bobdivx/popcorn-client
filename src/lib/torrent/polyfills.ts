/**
 * Polyfills pour les modules Node.js utilisés par webtorrent
 * Ce fichier doit être importé avant webtorrent
 * Note: Le plugin vite-plugin-node-polyfills devrait gérer la plupart des polyfills,
 * mais ce fichier sert de filet de sécurité pour les cas spécifiques
 */

// Initialiser globalThis
if (typeof window !== 'undefined' && typeof globalThis === 'undefined') {
  (window as any).globalThis = window;
}

// S'assurer que util est disponible avec toutes les méthodes nécessaires
// readable-stream nécessite util.inherits et util.inspect
if (typeof window !== 'undefined') {
  try {
    // Essayer d'importer util depuis le polyfill
    const util = (globalThis as any).util || (window as any).util;
    
    if (!util || !util.inherits || !util.inspect) {
      // Créer un polyfill minimal pour util si nécessaire
      const utilPolyfill = {
        inherits: function(ctor: any, superCtor: any) {
          if (superCtor === null || superCtor === undefined) {
            throw new TypeError('The super constructor must be non-null or non-undefined');
          }
          ctor.super_ = superCtor;
          ctor.prototype = Object.create(superCtor.prototype, {
            constructor: {
              value: ctor,
              enumerable: false,
              writable: true,
              configurable: true,
            },
          });
        },
        inspect: function(obj: any, opts?: any): string {
          try {
            return JSON.stringify(obj, null, 2);
          } catch {
            return String(obj);
          }
        },
        format: function(format: string, ...args: any[]): string {
          return format.replace(/%[sdj%]/g, (match) => {
            if (match === '%%') return '%';
            const arg = args.shift();
            if (arg === undefined) return match;
            if (match === '%s') return String(arg);
            if (match === '%d') return Number(arg).toString();
            if (match === '%j') return JSON.stringify(arg);
            return match;
          });
        },
      };

      (globalThis as any).util = utilPolyfill;
      (window as any).util = utilPolyfill;
    }
  } catch (e) {
    // Ignorer les erreurs, le plugin devrait gérer cela
    console.warn('Could not set up util polyfill:', e);
  }
}

export {};
