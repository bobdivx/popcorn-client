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

// S'assurer que process est disponible avec nextTick
// end-of-stream et d'autres modules dépendent de process.nextTick
if (typeof window !== 'undefined') {
  if (!(globalThis as any).process) {
    const processPolyfill = {
      env: {},
      browser: true,
      version: 'v16.0.0', // Version simulée
      versions: {},
      nextTick: function(fn: Function, ...args: any[]) {
        // Utiliser setTimeout pour simuler nextTick dans le navigateur
        setTimeout(() => {
          if (typeof fn === 'function') {
            fn(...args);
          }
        }, 0);
      },
    };
    // S'assurer que nextTick.bind fonctionne correctement
    processPolyfill.nextTick.bind = Function.prototype.bind;
    
    (globalThis as any).process = processPolyfill;
    (window as any).process = processPolyfill;
  } else {
    // S'assurer que nextTick existe et a la méthode bind
    const proc = (globalThis as any).process;
    if (!proc.nextTick) {
      proc.nextTick = function(fn: Function, ...args: any[]) {
        setTimeout(() => {
          if (typeof fn === 'function') {
            fn(...args);
          }
        }, 0);
      };
    }
    if (!proc.nextTick.bind) {
      proc.nextTick.bind = Function.prototype.bind;
    }
  }
}

// Stub pour fs (système de fichiers) - non disponible dans le navigateur
// webtorrent ne devrait pas l'utiliser, mais certains modules peuvent l'importer
if (typeof window !== 'undefined') {
  if (!(globalThis as any).fs && !(window as any).fs) {
    const fsStub = {
      statSync: () => ({ isFile: () => false, isDirectory: () => false }),
      readFileSync: () => Buffer.from(''),
      writeFileSync: () => {},
      existsSync: () => false,
      readdirSync: () => [],
      mkdirSync: () => {},
      unlinkSync: () => {},
      rmdirSync: () => {},
      createReadStream: () => null,
      createWriteStream: () => null,
    };
    (globalThis as any).fs = fsStub;
    (window as any).fs = fsStub;
  }
}

// S'assurer que util est disponible avec toutes les méthodes nécessaires
// readable-stream et end-of-stream nécessitent util.inherits et util.inspect
if (typeof window !== 'undefined') {
  // Créer le polyfill util immédiatement, avant que les modules ne soient chargés
  const ensureUtilPolyfill = () => {
    const util = (globalThis as any).util || (window as any).util;
    
    if (!util || !util.inherits || !util.inspect || !util.promisify) {
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
        promisify: function(fn: Function) {
          // Polyfill pour util.promisify (utilisé par end-of-stream)
          if (typeof fn !== 'function') {
            throw new TypeError('The "original" argument must be of type Function');
          }
          return function promisified(this: any, ...args: any[]) {
            return new Promise((resolve, reject) => {
              try {
                fn.call(this, ...args, (err: Error | null, ...results: any[]) => {
                  if (err) {
                    reject(err);
                  } else if (results.length === 1) {
                    resolve(results[0]);
                  } else {
                    resolve(results);
                  }
                });
              } catch (err) {
                reject(err);
              }
            });
          };
        },
        callbackify: function(fn: Function) {
          // Polyfill pour util.callbackify
          if (typeof fn !== 'function') {
            throw new TypeError('The "fn" argument must be of type Function');
          }
          return function callbackified(this: any, ...args: any[]) {
            const callback = args[args.length - 1];
            if (typeof callback !== 'function') {
              throw new TypeError('The last argument must be a function');
            }
            const promiseArgs = args.slice(0, -1);
            Promise.resolve(fn.call(this, ...promiseArgs))
              .then((result) => callback(null, result))
              .catch((err) => callback(err));
          };
        },
        isArray: Array.isArray,
        isBoolean: (val: any) => typeof val === 'boolean',
        isNull: (val: any) => val === null,
        isNullOrUndefined: (val: any) => val === null || val === undefined,
        isNumber: (val: any) => typeof val === 'number' && !isNaN(val),
        isString: (val: any) => typeof val === 'string',
        isSymbol: (val: any) => typeof val === 'symbol',
        isUndefined: (val: any) => typeof val === 'undefined',
        isObject: (val: any) => val !== null && typeof val === 'object' && !Array.isArray(val),
        isFunction: (val: any) => typeof val === 'function',
        isDate: (val: any) => val instanceof Date,
        isRegExp: (val: any) => val instanceof RegExp,
      };

      (globalThis as any).util = utilPolyfill;
      (window as any).util = utilPolyfill;
      return utilPolyfill;
    }
    return util;
  };
  
  // Appeler immédiatement pour s'assurer que util est disponible
  ensureUtilPolyfill();
}

export {};
