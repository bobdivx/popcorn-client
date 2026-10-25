import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { useServerCapabilities } from '../../../lib/capabilities';
import { CAR_MODULE_FEATURES, isCarModuleAvailable } from '../../../lib/distribution';
import { canAccess } from '../../../lib/permissions';

/**
 * Pages voiture (/car, /car/lab, /car/probe) : module activable `car_lab`.
 * Capacité à `false` → administrateur redirigé vers Paramètres › Modules (message « nécessite le
 * module Voiture »), autre utilisateur : message sur place + retour à l'accueil.
 * Capacité vraie ou inconnue (serveur ancien) → page affichée (comportement historique).
 * Ces pages n'utilisent pas Layout.astro : la redirection de la barre de navigation ne s'y applique pas.
 */
export default function CarModuleGate({ children }: { children: ComponentChildren }) {
  const caps = useServerCapabilities();
  const available = isCarModuleAvailable();

  useEffect(() => {
    if (available || typeof window === 'undefined') return;
    let admin = false;
    try {
      admin = canAccess('settings.server' as any);
    } catch {
      admin = false;
    }
    if (admin) window.location.replace(`/settings/modules/?missing=${encodeURIComponent(CAR_MODULE_FEATURES[0])}`);
  }, [available, caps]);

  if (available) return <>{children}</>;
  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center bg-black text-white" role="status">
      <div className="max-w-md flex flex-col items-center gap-4">
        <h1 className="text-2xl font-bold">Module Voiture désactivé</h1>
        <p className="text-white/70">
          Cette page nécessite le module Voiture, qui n’est pas actif sur ce serveur. Un administrateur peut l’activer dans
          Paramètres › Modules.
        </p>
        <a
          href="/dashboard"
          className="inline-flex items-center rounded-full bg-white/10 border border-white/20 px-5 py-2.5 font-semibold hover:bg-white/15"
          tabIndex={0}
          data-focusable
          data-tv-initial-focus
        >
          Retour à l’accueil
        </a>
      </div>
    </div>
  );
}
