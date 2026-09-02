type Listener = (activeId: string | null) => void;

let activeId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) {
    listener(activeId);
  }
}

/** Réserve le slot trailer unique (hero ou carte preview). */
export function claimPreviewTrailer(id: string): void {
  if (activeId === id) return;
  activeId = id;
  notify();
}

/** Libère le slot si c'est encore ce demandeur. */
export function releasePreviewTrailer(id: string): void {
  if (activeId !== id) return;
  activeId = null;
  notify();
}

export function getActivePreviewTrailer(): string | null {
  return activeId;
}

export function subscribePreviewTrailer(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
