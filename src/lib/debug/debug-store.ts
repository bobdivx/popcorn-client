/**
 * Store global de debug — activable via Settings > Diagnostics.
 * Désactivé par défaut. Les logs sont accumulés en mémoire et affichés
 * dans le DebugPanel flottant (disponible sur toutes les pages).
 */

const STORAGE_KEY = 'popcorn_debug_enabled';
const MAX_LINES = 200;

export interface DebugLine {
  ts: string;
  msg: string;
}

type Listener = (lines: DebugLine[], enabled: boolean) => void;

class DebugStore {
  private lines: DebugLine[] = [];
  private listeners = new Set<Listener>();
  private lastMsg = '';

  isEnabled(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }

  enable() {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    this.notify();
  }

  disable() {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    this.lines = [];
    this.notify();
  }

  log(msg: string) {
    // Toujours logger dans la console
    console.log('[DBG]', msg);
    if (!this.isEnabled()) return;
    // Dédupliquer les messages consécutifs identiques
    if (msg === this.lastMsg) return;
    this.lastMsg = msg;
    const ts = new Date().toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.lines = [...this.lines.slice(-(MAX_LINES - 1)), { ts, msg }];
    this.notify();
  }

  getLines(): DebugLine[] { return this.lines; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.lines, this.isEnabled());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) l(this.lines, this.isEnabled());
  }
}

export const debugStore = new DebugStore();

/** Raccourci : log uniquement si debug activé (+ toujours dans console) */
export function dbgLog(msg: string) {
  debugStore.log(msg);
}
