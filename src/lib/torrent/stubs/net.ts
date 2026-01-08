/**
 * Stub pour le module net (réseau)
 * Non disponible dans le navigateur, utilisé uniquement comme fallback
 * pour les modules qui tentent de l'importer
 */

// Simuler une connexion réseau (stub basique)
class SocketStub {
  constructor() {
    this.destroyed = false;
    this.writable = false;
    this.readable = false;
  }

  connect(...args: any[]) {
    return this;
  }

  write(...args: any[]) {
    return false;
  }

  end(...args: any[]) {
    return this;
  }

  destroy(...args: any[]) {
    this.destroyed = true;
    return this;
  }

  on(event: string, handler: Function) {
    return this;
  }

  once(event: string, handler: Function) {
    return this;
  }

  removeListener(event: string, handler: Function) {
    return this;
  }

  setNoDelay(...args: any[]) {
    return this;
  }

  setKeepAlive(...args: any[]) {
    return this;
  }

  setTimeout(...args: any[]) {
    return this;
  }
}

class ServerStub {
  constructor() {
    this.listening = false;
  }

  listen(...args: any[]) {
    this.listening = true;
    return this;
  }

  close(...args: any[]) {
    this.listening = false;
    return this;
  }

  on(event: string, handler: Function) {
    return this;
  }
}

// Fonction connect stub
export const connect = (options?: any, callback?: Function) => {
  const socket = new SocketStub();
  if (callback) {
    setTimeout(() => callback(null), 0);
  }
  return socket;
};

// Fonction createConnection stub (alias de connect)
export const createConnection = connect;

// Fonction createServer stub
export const createServer = (options?: any, callback?: Function) => {
  const server = new ServerStub();
  if (callback) {
    setTimeout(() => callback(null), 0);
  }
  return server;
};

// Export par défaut
export default {
  connect,
  createConnection,
  createServer,
  Socket: SocketStub,
  Server: ServerStub,
};
