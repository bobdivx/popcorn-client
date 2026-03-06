export type LocalProfile = {
  displayName?: string;
  avatarDataUrl?: string; // base64 data URL (ou URL http)
};

const STORAGE_KEY = 'popcorn.profile.v1';
const EVENT_NAME = 'profile-changed';

export function getLocalProfile(): LocalProfile {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LocalProfile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setLocalProfile(next: LocalProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function updateLocalProfile(patch: Partial<LocalProfile>) {
  const prev = getLocalProfile();
  setLocalProfile({ ...prev, ...patch });
}

export function clearLocalProfile() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function onProfileChanged(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = () => handler();
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export function getInitials(input?: string | null): string {
  const value = (input || '').trim();
  if (!value) return 'U';

  // email → avant le @
  const base = value.includes('@') ? value.split('@')[0] : value;
  const cleaned = base.replace(/[^a-zA-Z0-9\s._-]/g, ' ').trim();

  // Si "john.doe" → ["john","doe"]
  const parts = cleaned
    .split(/[\s._-]+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return base.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

