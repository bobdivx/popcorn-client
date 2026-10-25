import type { ServerCapabilities } from '../../../lib/capabilities';
import type { InstalledModule, ProcessModule } from '../../../lib/client/server-api/modules';
import type { HubStatus } from '../hub/HubTile';
import { isRouteBlockedInStoreBuild } from '../../../lib/distribution';
import { C, FactList, Icon, type IconName, primaryBtn, primaryStyle, secondaryBtn, secondaryStyle, tileIcon } from './moduleUi';

/**
 * Fonctions du serveur, une tuile par capacité annoncée par GET /api/client/capabilities
 * (`features`) ou fournie par un module installé (`provides`). La liste vient du serveur :
 * le client ne connaît que les libellés / icônes / pages de réglages des clés connues,
 * une clé inconnue s'affiche avec une tuile générique.
 */

type Lang = 'fr' | 'en';
type Label = { name: string; desc: string };
/** Lien secondaire de la modale (réglage voisin propre à la même fonction). */
type ExtraLink = { href: string; fr: string; en: string };

type FeatureMeta = {
  icon: IconName;
  fr: Label;
  en: Label;
  /**
   * Page (ou section, via `?sub=`) des réglages de CETTE fonction. Absente : la fonction n'a pas de
   * réglage côté client (la modale le dit). Mapping documenté dans docs/SETTINGS_MODULES.md.
   */
  href?: string;
  /** Réglages voisins de la même fonction, affichés en boutons secondaires. */
  links?: ExtraLink[];
  /** Feature Cargo optionnelle dont dépend la capacité (absente du binaire → « Non installé »). */
  compiled?: string;
  /** Fonction torrent : absente des builds sans torrent (TORRENT_FEATURES_ENABLED). */
  torrent?: boolean;
};

const META: Record<string, FeatureMeta> = {
  player: {
    icon: 'film',
    href: '/settings/playback',
    fr: { name: 'Lecteur', desc: 'Lecture des films et séries de la bibliothèque (HLS), reprise et pistes audio / sous-titres.' },
    en: { name: 'Player', desc: 'Plays movies and shows from the library (HLS), with resume and audio / subtitle tracks.' },
  },
  library: {
    icon: 'folder',
    href: '/settings/library',
    fr: { name: 'Bibliothèque', desc: 'Indexation des médias du serveur, fiches et métadonnées.' },
    en: { name: 'Library', desc: 'Indexes the server media, with detail pages and metadata.' },
  },
  library_sources: {
    icon: 'link',
    href: '/settings/library-sources',
    fr: { name: 'Sources de bibliothèque', desc: 'Dossiers locaux, partages NAS et autres sources de médias.' },
    en: { name: 'Library sources', desc: 'Local folders, NAS shares and other media sources.' },
  },
  jellyfin: {
    // Pas de page Jellyfin dans le client (pointait à tort vers « Dossiers externes ») :
    // la connexion se règle dans le module qui fournit la fonction.
    icon: 'server',
    fr: { name: 'Jellyfin', desc: 'Import et lecture de la bibliothèque d’un serveur Jellyfin.' },
    en: { name: 'Jellyfin', desc: 'Imports and plays the library of a Jellyfin server.' },
  },
  discover: {
    icon: 'compass',
    // Clé et langue TMDB (page du cœur, présente dans tous les builds) ; rangées en lien secondaire.
    href: '/settings/tmdb',
    links: [{ href: '/settings/discover-sliders', fr: 'Rangées de découverte', en: 'Discover rows' }],
    fr: { name: 'Découverte', desc: 'Pages de découverte TMDB : tendances, sorties, recommandations.' },
    en: { name: 'Discover', desc: 'TMDB discovery pages: trending, new releases, recommendations.' },
  },
  requests: {
    icon: 'inbox',
    href: '/settings/requests-admin',
    fr: { name: 'Demandes', desc: 'Demandes de films et séries par les utilisateurs, validées par l’administrateur.' },
    en: { name: 'Requests', desc: 'Movie and show requests from users, approved by the administrator.' },
  },
  transcoding: {
    icon: 'convert',
    // Section « Transcodage » de Maintenance (nombre de transcodages simultanés), pas la page Lecture.
    href: '/settings/maintenance?sub=transcodingConfig',
    links: [{ href: '/settings/maintenance?sub=transcodeJobs', fr: 'Transcodages en cours', en: 'Running transcodes' }],
    fr: { name: 'Transcodage', desc: 'Conversion à la volée (ffmpeg) pour les appareils qui ne lisent pas le fichier d’origine.' },
    en: { name: 'Transcoding', desc: 'On-the-fly conversion (ffmpeg) for devices that cannot play the original file.' },
  },
  torrent: {
    icon: 'magnet',
    // Client torrent intégré (débits, port d'écoute, DHT, logs).
    href: '/settings/librqbit',
    links: [{ href: '/settings/downloads', fr: 'Téléchargements', en: 'Downloads' }],
    compiled: 'torrent',
    torrent: true,
    fr: { name: 'Téléchargement torrent', desc: 'Moteur torrent intégré : ajout, suivi et gestion des téléchargements.' },
    en: { name: 'Torrent downloads', desc: 'Built-in torrent engine: add, track and manage downloads.' },
  },
  stream_torrent: {
    icon: 'stream',
    // Réglage « Télécharger en entier (streaming) » de la page Lecture.
    href: '/settings/playback?sub=streamingDownloadFull',
    compiled: 'torrent',
    torrent: true,
    fr: { name: 'Lecture pendant le téléchargement', desc: 'Lecture d’un torrent avant la fin de son téléchargement.' },
    en: { name: 'Stream while downloading', desc: 'Plays a torrent before it has finished downloading.' },
  },
  indexers: {
    icon: 'list',
    href: '/settings/indexers',
    // Liste noire : filtre les résultats des indexers (voir docs/SETTINGS_MODULES.md).
    links: [{ href: '/settings/blacklist', fr: 'Liste noire', en: 'Blacklist' }],
    compiled: 'indexers',
    torrent: true,
    fr: { name: 'Indexers', desc: 'Recherche de contenus sur les indexers configurés.' },
    en: { name: 'Indexers', desc: 'Searches content on the configured indexers.' },
  },
  sync: {
    icon: 'sync',
    // Section « Sync torrents » (planification) du hub Indexers & synchro ; catégories en lien secondaire.
    href: '/settings/content?sub=sync',
    links: [{ href: '/settings/sync', fr: 'Catégories synchronisées', en: 'Synced categories' }],
    compiled: 'indexers',
    torrent: true,
    fr: { name: 'Synchronisation des indexers', desc: 'Synchronisation périodique des catalogues des indexers.' },
    en: { name: 'Indexer sync', desc: 'Periodic sync of the indexer catalogs.' },
  },
  indexer_definitions: {
    icon: 'log',
    href: '/settings/indexer-definitions',
    torrent: true,
    fr: { name: 'Définitions d’indexers', desc: 'Définitions d’indexers fournies par un module.' },
    en: { name: 'Indexer definitions', desc: 'Indexer definitions provided by a module.' },
  },
  sharing: {
    icon: 'users',
    href: '/settings/friends',
    fr: { name: 'Partage', desc: 'Partage de la bibliothèque avec des amis.' },
    en: { name: 'Sharing', desc: 'Shares the library with friends.' },
  },
  friends: {
    icon: 'users',
    href: '/settings/friends',
    fr: { name: 'Amis', desc: 'Amis et bibliothèques partagées.' },
    en: { name: 'Friends', desc: 'Friends and shared libraries.' },
  },
  ai: {
    icon: 'sparkle',
    href: '/settings/ai',
    fr: { name: 'IA', desc: 'Fonctions d’intelligence artificielle (recommandations, assistant).' },
    en: { name: 'AI', desc: 'Artificial intelligence features (recommendations, assistant).' },
  },
  car_lab: {
    icon: 'car',
    href: '/car/lab',
    fr: { name: 'Voiture', desc: 'Module activable : lecteur pour navigateur de voiture (Tesla), labo et diagnostic de lecture.' },
    en: { name: 'Car', desc: 'Optional module: player for in-car browsers (Tesla), playback lab and diagnostics.' },
  },
  webos_deployment: {
    icon: 'tv',
    href: '/settings/webos-deployment',
    fr: { name: 'Déploiement webOS', desc: 'Installation de l’application sur les téléviseurs LG webOS.' },
    en: { name: 'webOS deployment', desc: 'Installs the app on LG webOS TVs.' },
  },
};
META.car = META.car_lab;
META.webos = META.webos_deployment;

/** Capacités retirées du produit (toujours `false`) : pas de tuile. */
const RETIRED = new Set(['uploads', 'ratio_tools']);

export const FEATURE_TEXT = {
  fr: {
    section: 'Fonctions intégrées',
    active: 'Actif',
    disabled: 'Désactivé',
    notInstalled: 'Non installé',
    builtin: 'Intégré au serveur',
    moduleBy: (name: string) => `Module · ${name}`,
    state: 'État',
    source: 'Fournie par',
    provides: 'Ce que ça apporte',
    key: 'Capacité',
    version: 'Version',
    openSettings: 'Ouvrir les réglages',
    noSettings: 'Pas de réglage dans l’application pour cette fonction : elle se configure dans le module qui la fournit ou sur le serveur.',
    manageModule: (name: string) => `Gérer le module ${name}`,
    addModule: 'Ajouter un module',
    genericDesc: (key: string) => `Capacité « ${key} » annoncée par le serveur.`,
    disabledHint: 'Présente dans le serveur mais désactivée (dépendance absente ou module inactif).',
    notInstalledHint: 'Absente de ce serveur : elle n’est pas compilée dans le binaire et aucun module installé ne la fournit.',
    hiddenInBuild: 'Non disponible dans cette version de l’application.',
    none: 'Aucune capacité annoncée par le serveur.',
  },
  en: {
    section: 'Built-in features',
    active: 'Active',
    disabled: 'Disabled',
    notInstalled: 'Not installed',
    builtin: 'Built into the server',
    moduleBy: (name: string) => `Module · ${name}`,
    state: 'State',
    source: 'Provided by',
    provides: 'What it does',
    key: 'Capability',
    version: 'Version',
    openSettings: 'Open settings',
    noSettings: 'This feature has no settings in the app: it is configured in the module that provides it or on the server.',
    manageModule: (name: string) => `Manage the ${name} module`,
    addModule: 'Add a module',
    genericDesc: (key: string) => `Capability “${key}” reported by the server.`,
    disabledHint: 'Present on the server but disabled (missing dependency or inactive module).',
    notInstalledHint: 'Not on this server: it is not compiled into the binary and no installed module provides it.',
    hiddenInBuild: 'Not available in this version of the app.',
    none: 'The server reports no capability.',
  },
};
export type FeatureTx = (typeof FEATURE_TEXT)['fr'];
export const featureTx = (language: string): FeatureTx => (language === 'en' ? FEATURE_TEXT.en : FEATURE_TEXT.fr);

export type FeatureState = 'active' | 'disabled' | 'not_installed';

export type FeatureProvider =
  | { type: 'data'; id: string; name: string; version: string; active: boolean }
  | { type: 'process'; id: string; name: string; version: string; active: boolean };

export type ServerFeature = {
  key: string;
  name: string;
  desc: string;
  icon: IconName;
  href?: string;
  /** Réglages voisins (libellé déjà traduit). */
  links: { href: string; label: string }[];
  torrent: boolean;
  /** Annoncée par `features` (intégrée au serveur). */
  builtin: boolean;
  /** Modules installés qui la fournissent (`provides`). */
  providers: FeatureProvider[];
  state: FeatureState;
};

/** Page de réglages proposée dans ce build / avec ce serveur (le `?sub=` est ignoré pour le test). */
function isSettingsHrefAvailable(href: string): boolean {
  return !isRouteBlockedInStoreBuild(href.split(/[?#]/)[0]);
}

/** Libellé lisible d'une clé inconnue (`car_lab` → « Car lab »). */
function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

/** Construit la liste des fonctions à partir des capacités et des modules installés. */
export function buildServerFeatures(
  caps: ServerCapabilities | null,
  dataModules: InstalledModule[] | null,
  processModules: ProcessModule[],
  language: string,
): ServerFeature[] {
  const lang: Lang = language === 'en' ? 'en' : 'fr';
  const tx = featureTx(language);
  const providers = new Map<string, FeatureProvider[]>();
  const addProvider = (key: string, p: FeatureProvider) => {
    if (!key || RETIRED.has(key)) return;
    const list = providers.get(key) ?? [];
    list.push(p);
    providers.set(key, list);
  };
  for (const m of dataModules ?? []) {
    for (const k of m.provides ?? []) {
      addProvider(k, { type: 'data', id: m.id, name: m.name, version: m.version, active: m.active });
    }
  }
  for (const m of processModules) {
    for (const k of m.provides ?? []) {
      addProvider(k, { type: 'process', id: m.id, name: m.id, version: m.version || '', active: m.state === 'running' || m.state === 'degraded' || m.state === 'starting' });
    }
  }
  // Serveur sans liste à jour : les modules résumés dans les capacités servent de repli.
  if (!dataModules) {
    for (const m of caps?.modules.installed ?? []) {
      for (const k of m.provides) addProvider(k, { type: 'data', id: m.id, name: m.name, version: m.version, active: m.active });
    }
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    if (!k || seen.has(k) || RETIRED.has(k)) return;
    seen.add(k);
    keys.push(k);
  };
  for (const [k, v] of Object.entries(caps?.features ?? {})) if (typeof v === 'boolean') push(k);
  for (const k of providers.keys()) push(k);

  const compiled = caps?.compiledFeatures;
  return keys.map((key) => {
    const meta = META[key];
    const label = meta?.[lang];
    const provs = providers.get(key) ?? [];
    const builtin = caps?.features[key] === true;
    let state: FeatureState;
    if (builtin || provs.some((p) => p.active)) state = 'active';
    else if (provs.length > 0) state = 'disabled';
    else if (meta?.compiled) {
      // Feature Cargo optionnelle : absente du binaire → non installée, sinon désactivée.
      const inBinary = compiled ? compiled.includes(meta.compiled) : caps?.edition === 'full' || caps?.legacy === true;
      state = inBinary ? 'disabled' : 'not_installed';
    } else if (!caps || key in (caps.features ?? {})) state = 'disabled';
    else state = 'not_installed';
    return {
      key,
      name: label?.name ?? humanize(key),
      desc: label?.desc ?? tx.genericDesc(key),
      icon: meta?.icon ?? 'module',
      href: meta?.href && isSettingsHrefAvailable(meta.href) ? meta.href : undefined,
      links: (meta?.links ?? [])
        .filter((l) => isSettingsHrefAvailable(l.href))
        .map((l) => ({ href: l.href, label: l[lang] })),
      torrent: meta?.torrent === true,
      builtin,
      providers: provs,
      state,
    };
  });
}

/**
 * Réglages des fonctions qu'un module fournit (pour sa tuile / sa fiche) : seulement les fonctions
 * actives qui ont une page de réglages dans ce build. Les réglages restent ainsi accessibles depuis
 * la tuile du module, pas seulement depuis celle de la fonction.
 */
export function moduleSettingsLinks(
  features: ServerFeature[],
  type: FeatureProvider['type'],
  id: string,
): { key: string; label: string; href: string }[] {
  const out: { key: string; label: string; href: string }[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    if (f.state !== 'active' || !f.providers.some((p) => p.type === type && p.id === id)) continue;
    const add = (href: string, label: string) => {
      if (seen.has(href)) return;
      seen.add(href);
      out.push({ key: `${f.key}:${href}`, label, href });
    };
    if (f.href) add(f.href, f.name);
    for (const l of f.links) add(l.href, l.label);
  }
  return out;
}

export function featureStatus(state: FeatureState): HubStatus {
  return state === 'active' ? 'connected' : state === 'disabled' ? 'limited' : 'disabled';
}

export function featureStatusLabel(state: FeatureState, tx: FeatureTx): string {
  return state === 'active' ? tx.active : state === 'disabled' ? tx.disabled : tx.notInstalled;
}

/** Sous-titre de tuile : intégré au serveur ou module qui la fournit. */
export function featureSource(f: ServerFeature, tx: FeatureTx, serverVersion: string | null): string {
  const p = f.providers.find((x) => x.active) ?? f.providers[0];
  if (p && !f.builtin) return `${tx.moduleBy(p.name)}${p.version ? ` · ${p.version}` : ''}`;
  return serverVersion && f.builtin ? `${tx.builtin} · ${serverVersion}` : tx.builtin;
}

const iconCache = new Map<IconName, ReturnType<typeof tileIcon>>();
export function featureTileIcon(name: IconName) {
  let c = iconCache.get(name);
  if (!c) {
    c = tileIcon(name);
    iconCache.set(name, c);
  }
  return c;
}

/** Contenu de la modale « détail d'une fonction ». */
export function ServerFeatureDetail({
  feature: f,
  tx,
  stateLabel,
  serverVersion,
  torrentEnabled,
  onOpenModule,
  onAddModule,
}: {
  feature: ServerFeature;
  tx: FeatureTx;
  stateLabel: string;
  serverVersion: string | null;
  torrentEnabled: boolean;
  onOpenModule: (p: FeatureProvider) => void;
  onAddModule?: () => void;
}) {
  const hiddenInBuild = f.torrent && !torrentEnabled;
  const stateHint = f.state === 'disabled' ? tx.disabledHint : f.state === 'not_installed' ? tx.notInstalledHint : null;
  const sources: string[] = [];
  if (f.builtin) sources.push(serverVersion ? `${tx.builtin} (${serverVersion})` : tx.builtin);
  for (const p of f.providers) sources.push(`${tx.moduleBy(p.name)}${p.version ? ` · ${p.version}` : ''}`);
  return (
    <div class="grid gap-5 tv:gap-7">
      <p class="text-sm tv:text-lg leading-relaxed" style={{ color: C.ink }}>
        {f.desc}
      </p>
      <FactList
        rows={[
          [tx.state, stateLabel],
          sources.length > 0 && [tx.source, sources.join(', ')],
          [tx.key, f.key, 'font-mono break-all'],
        ]}
      />
      {stateHint && (
        <p class="text-sm tv:text-lg" style={{ color: C.muted }}>
          {stateHint}
        </p>
      )}
      {!f.href && f.links.length === 0 && f.state === 'active' && (
        <p class="text-sm tv:text-lg" style={{ color: C.muted }}>
          {tx.noSettings}
        </p>
      )}
      {hiddenInBuild && (
        <p class="text-sm tv:text-lg" style={{ color: C.muted }}>
          {tx.hiddenInBuild}
        </p>
      )}
      <div class="flex flex-wrap gap-3 tv:gap-4">
        {f.href && f.state === 'active' && !hiddenInBuild && (
          <a href={f.href} data-focusable class={primaryBtn} style={primaryStyle}>
            <Icon name="settings" />
            {tx.openSettings}
          </a>
        )}
        {f.state === 'active' &&
          !hiddenInBuild &&
          f.links.map((l) => (
            <a key={l.href} href={l.href} data-focusable class={secondaryBtn} style={secondaryStyle}>
              <Icon name="settings" />
              {l.label}
            </a>
          ))}
        {f.providers.map((p) => (
          <button
            key={`${p.type}:${p.id}`}
            type="button"
            data-focusable
            class={secondaryBtn}
            style={secondaryStyle}
            onClick={() => onOpenModule(p)}
          >
            <Icon name={p.type === 'process' ? 'chip' : 'module'} />
            {tx.manageModule(p.name)}
          </button>
        ))}
        {f.state === 'not_installed' && f.providers.length === 0 && onAddModule && (
          <button type="button" data-focusable class={secondaryBtn} style={secondaryStyle} onClick={onAddModule}>
            <Icon name="plus" />
            {tx.addModule}
          </button>
        )}
      </div>
    </div>
  );
}
