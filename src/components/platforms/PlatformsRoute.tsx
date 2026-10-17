import { useMemo } from 'preact/hooks';
import PlatformsGrid from './PlatformsGrid';
import PlatformPage from './PlatformPage';

function slugFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search).get('p');
  const slug = (p || '').trim().toLowerCase();
  return /^[a-z0-9-]{1,40}$/.test(slug) ? slug : null;
}

/** /plateformes/ → grille ; /plateformes/?p=<slug> → page plateforme (pas de route dynamique : build statique webOS/Tauri). */
export default function PlatformsRoute() {
  const slug = useMemo(() => slugFromLocation(), []);
  return slug ? <PlatformPage slug={slug} /> : <PlatformsGrid />;
}
