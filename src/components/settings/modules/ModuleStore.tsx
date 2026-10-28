import { useEffect, useRef, useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import type { CatalogModule, ModuleCatalog } from '../../../lib/client/server-api/modules';
import { isRouteUnsupported } from '../../../lib/module-errors';
import { IS_STORE_BUILD, STORE_MODULES_ENABLED } from '../../../lib/distribution';
import type { ServerCapabilities } from '../../../lib/capabilities';
import type { HubStatus } from '../hub/HubTile';
import { type IconName, type Notice, errorMessage, tileIcon } from './moduleUi';

/**
 * Catalogue officiel des modules (« store ») de Paramètres > Modules.
 *
 * - Le serveur télécharge le catalogue signé par la clé officielle Popcornn (intégrée au serveur),
 *   le vérifie, et l'expose à l'administrateur (`GET /api/client/admin/modules/catalog`).
 * - « Installer » = `POST …/catalog/{id}/install` : le serveur télécharge la release signée,
 *   vérifie SHA-256 + minisign, installe puis démarre le module. Le suivi réutilise les opérations
 *   des modules process (`useProcessModules().startJob`).
 * - La tuile « + » ouvre ce catalogue (modules non installés / mises à jour) ; « Ajouter depuis
 *   GitHub (URL) » ouvre l'ajout par URL. Les indexers n'y figurent jamais (URL uniquement).
 * - Serveur ancien (route 404 / 405, ou `modules.catalog: false`) : section masquée, l'installation
 *   par URL reste disponible.
 */

export const STORE_TEXT = {
  fr: {
    title: 'Ajouter un module',
    intro: 'Modules officiels Popcornn, signés et vérifiés par ton serveur avant installation.',
    fromGithub: 'Ajouter depuis GitHub (URL)',
    githubHint: 'Module particulier (indexers…) absent du catalogue : colle l’URL de son dépôt GitHub.',
    allInstalled: 'Tous les modules officiels sont déjà installés.',
    backToCatalog: 'Catalogue officiel',
    install: 'Installer',
    update: 'Mettre à jour',
    start: 'Activer',
    installing: 'Installation…',
    notInstalled: 'Non installé',
    active: 'Actif',
    disabled: 'Désactivé',
    installed: 'Installé',
    failed: 'En échec',
    incompatible: 'Incompatible',
    updateAvailable: (v: string) => `Mise à jour ${v}`,
    empty: 'Aucun module disponible dans le catalogue pour l’instant.',
    error: 'Catalogue officiel indisponible pour le moment. L’installation par URL reste possible.',
    started: (name: string) => `${name} est déjà installé : module démarré.`,
    jobStarted: (name: string) => `Installation de ${name} lancée.`,
  },
  en: {
    title: 'Add a module',
    intro: 'Official Popcornn modules, signed and verified by your server before installation.',
    fromGithub: 'Add from GitHub (URL)',
    githubHint: 'Special module (indexers…) not in the catalog: paste the URL of its GitHub repository.',
    allInstalled: 'All official modules are already installed.',
    backToCatalog: 'Official catalog',
    install: 'Install',
    update: 'Update',
    start: 'Enable',
    installing: 'Installing…',
    notInstalled: 'Not installed',
    active: 'Active',
    disabled: 'Disabled',
    installed: 'Installed',
    failed: 'Failed',
    incompatible: 'Incompatible',
    updateAvailable: (v: string) => `Update ${v}`,
    empty: 'No module available in the catalog yet.',
    error: 'Official catalog unavailable right now. Installing by URL still works.',
    started: (name: string) => `${name} is already installed: module started.`,
    jobStarted: (name: string) => `Installing ${name}.`,
  },
};

export type StoreTx = (typeof STORE_TEXT)['fr'];

export function storeTx(language: string): StoreTx {
  return language === 'en' ? (STORE_TEXT.en as unknown as StoreTx) : STORE_TEXT.fr;
}

/** Les indexers ne passent jamais par le catalogue (défense en profondeur, le serveur les retire déjà). */
export function isCatalogHidden(m: Pick<CatalogModule, 'id' | 'category' | 'scopes'>): boolean {
  const id = (m.id || '').toLowerCase();
  const cat = (m.category || '').toLowerCase();
  return id.includes('indexer') || cat.includes('indexer') || (m.scopes || []).some((s) => s === 'indexers');
}

export type CatalogAction = 'install' | 'update' | 'start' | null;

export interface CatalogTileState {
  status: HubStatus | undefined;
  label: string;
  action: CatalogAction;
}

/** État d'une tuile du catalogue : pastille, libellé et action proposée. */
export function catalogTileState(m: CatalogModule, tx: StoreTx): CatalogTileState {
  if (!m.installed || m.status === 'not_installed') {
    if (!m.compatible) return { status: 'error', label: tx.incompatible, action: null };
    return { status: undefined, label: tx.notInstalled, action: 'install' };
  }
  const update = m.update_available && m.compatible ? 'update' : null;
  if (m.state === 'failed') return { status: 'error', label: tx.failed, action: update ?? 'start' };
  if (m.status === 'disabled' || m.enabled === false) {
    return { status: 'disabled', label: tx.disabled, action: update ?? 'start' };
  }
  if (m.status === 'active') {
    if (m.state === 'starting' || m.state === 'degraded') return { status: 'limited', label: tx.active, action: update };
    return { status: 'connected', label: tx.active, action: update };
  }
  return { status: 'limited', label: tx.installed, action: update };
}

const ICONS: Record<string, IconName> = {
  download: 'download',
  downloads: 'download',
  torrent: 'magnet',
  magnet: 'magnet',
  sharing: 'users',
  share: 'users',
  users: 'users',
  car: 'car',
  'car-mode': 'car',
  tv: 'tv',
  stream: 'stream',
  sync: 'sync',
  film: 'film',
  folder: 'folder',
  convert: 'convert',
  compass: 'compass',
  sparkle: 'sparkle',
  list: 'list',
};

/** Icône SVG locale d'un module du catalogue (jamais d'image distante). */
export function catalogIconName(m: Pick<CatalogModule, 'icon' | 'category'>): IconName {
  return ICONS[(m.icon || '').toLowerCase()] ?? ICONS[(m.category || '').toLowerCase()] ?? 'module';
}

export const catalogTileIcon = (m: Pick<CatalogModule, 'icon' | 'category'>) => tileIcon(catalogIconName(m));

/**
 * Catalogue pour la page. `supported` passe à false (section masquée) en version store, sur un
 * serveur sans modules process / sans catalogue, ou si la route répond 404 / 405.
 * `reloadKey` change après chaque modification des modules process → relecture (cache serveur).
 */
export function useModuleCatalog(
  caps: ServerCapabilities | null,
  processSupported: boolean,
  reloadKey: unknown,
) {
  const knownOff = !!caps && (caps.modules.processHost === false || caps.modules.catalog === false);
  const enabled = (!IS_STORE_BUILD || STORE_MODULES_ENABLED) && processSupported && !knownOff;
  const [hidden, setHidden] = useState(false);
  const [catalog, setCatalog] = useState<ModuleCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = async (refresh = false) => {
    if (!enabled || hidden) return;
    setLoading(true);
    const res = await serverApi.getModuleCatalog(refresh);
    if (!alive.current) return;
    setLoading(false);
    if (res.success && res.data) {
      const modules = Array.isArray(res.data.modules) ? res.data.modules.filter((m) => !isCatalogHidden(m)) : [];
      setCatalog({ ...res.data, modules });
      setError(null);
    } else if (isRouteUnsupported(res)) {
      setHidden(true);
    } else {
      setError(res.message || res.error || 'error');
    }
  };

  useEffect(() => {
    void load(false);
  }, [enabled, reloadKey]);

  return {
    supported: enabled && !hidden,
    catalog,
    error,
    loading,
    /** Relecture immédiate (le serveur ignore son cache). */
    refresh: () => load(true),
    reload: () => load(false),
  };
}

export type ModuleCatalogState = ReturnType<typeof useModuleCatalog>;

/** Lance l'installation (ou le démarrage / la mise à jour) d'un module du catalogue. */
export async function installFromCatalog(
  m: CatalogModule,
  deps: {
    stx: StoreTx;
    errTx: Parameters<typeof errorMessage>[1];
    setNotice: (n: Notice) => void;
    startJob: (jobId: string, moduleId: string) => void;
    afterChange: () => Promise<void> | void;
  },
): Promise<void> {
  const res = await serverApi.installCatalogModule(m.id);
  if (res.success && res.data) {
    if (res.data.job_id) {
      deps.startJob(res.data.job_id, res.data.module_id || m.id);
      deps.setNotice({ kind: 'ok', text: deps.stx.jobStarted(m.name) });
    } else {
      deps.setNotice({ kind: 'ok', text: deps.stx.started(m.name) });
      await deps.afterChange();
    }
  } else {
    deps.setNotice({ kind: 'error', text: errorMessage(res, deps.errTx) });
  }
}
