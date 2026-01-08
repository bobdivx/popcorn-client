/**
 * Stub pour bittorrent-dht (DHT - Distributed Hash Table)
 * Non disponible dans le navigateur, WebTorrent fonctionne sans DHT en mode navigateur
 * Ce stub permet à WebTorrent de s'initialiser sans erreur
 * 
 * Le DHT doit ressembler à un EventEmitter pour que WebTorrent puisse l'utiliser
 */

class DHTClient {
  private _listening: boolean = false;
  private _listeners: Map<string, Function[]> = new Map();
  private _maxListeners: number = 10;

  constructor(opts?: any) {
    // Stub - ne fait rien dans le navigateur
    if (typeof window !== 'undefined') {
      // En mode navigateur, désactiver le DHT
      this._listening = false;
    }
  }

  // Méthodes EventEmitter
  setMaxListeners(n: number) {
    this._maxListeners = n;
    return this;
  }

  getMaxListeners(): number {
    return this._maxListeners;
  }

  on(event: string, handler: Function) {
    // Stub - ignorer les événements dans le navigateur
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    const listeners = this._listeners.get(event)!;
    if (listeners.length < this._maxListeners) {
      listeners.push(handler);
    }
    return this;
  }

  once(event: string, handler: Function) {
    // Stub - ignorer les événements
    const onceHandler = (...args: any[]) => {
      handler(...args);
      this.removeListener(event, onceHandler);
    };
    return this.on(event, onceHandler);
  }

  emit(event: string, ...args: any[]): boolean {
    // Stub - ne rien émettre
    const listeners = this._listeners.get(event);
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(...args);
        } catch (e) {
          // Ignorer les erreurs
        }
      });
    }
    return true;
  }

  removeListener(event: string, handler: Function) {
    // Stub
    const listeners = this._listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(handler);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    return this;
  }

  removeAllListeners(event?: string) {
    // Stub
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }

  listeners(event: string): Function[] {
    return this._listeners.get(event) || [];
  }

  listenerCount(event: string): number {
    return this._listeners.get(event)?.length || 0;
  }

  // Méthodes DHT spécifiques
  listen(port?: number, callback?: (err?: Error, port?: number) => void) {
    // Stub - simuler un échec dans le navigateur
    this._listening = false;
    if (callback) {
      setTimeout(() => callback(new Error('DHT not available in browser')), 0);
    }
    return this;
  }

  destroy(callback?: () => void) {
    // Stub
    this._listening = false;
    this._listeners.clear();
    if (callback) {
      setTimeout(callback, 0);
    }
    return this;
  }

  lookup(infoHash: string, callback?: (err?: Error, peers?: any[]) => void) {
    // Stub - retourner un tableau vide
    if (callback) {
      setTimeout(() => callback(undefined, []), 0);
    }
    return this;
  }

  announce(infoHash: string, port: number, callback?: (err?: Error) => void) {
    // Stub - ne rien faire
    if (callback) {
      setTimeout(() => callback(undefined), 0);
    }
    return this;
  }
}

export const Client = DHTClient;
export default { Client };
