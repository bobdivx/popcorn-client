import type { CatalogModule, ProcessJobEvent } from '../../../lib/client/server-api/modules';

/**
 * Logique pure du « Catalogue de modules » (Paramètres > Modules > Ajouter un module) :
 * état d'une carte, filtres / recherche, étapes d'installation et validation immédiate des champs
 * de l'ajout par URL. Sans JSX ni appel réseau : testée par `moduleCatalogModel.test.ts`.
 */

export type CatalogEntryState = 'available' | 'installed' | 'update' | 'incompatible';
export type CatalogFilter = 'all' | 'available' | 'installed' | 'updates';
export const CATALOG_FILTERS: CatalogFilter[] = ['all', 'available', 'installed', 'updates'];

type EntryFields = Pick<CatalogModule, 'installed' | 'status' | 'compatible' | 'update_available'>;

/** État affiché sur la carte : Installé / Disponible / À mettre à jour (ou Incompatible). */
export function catalogEntryState(m: EntryFields): CatalogEntryState {
  const installed = m.installed === true && m.status !== 'not_installed';
  if (installed) return m.update_available && m.compatible ? 'update' : 'installed';
  return m.compatible === false ? 'incompatible' : 'available';
}

export function matchesFilter(m: EntryFields, filter: CatalogFilter): boolean {
  const s = catalogEntryState(m);
  switch (filter) {
    case 'available':
      return s === 'available' || s === 'incompatible';
    case 'installed':
      return s === 'installed' || s === 'update';
    case 'updates':
      return s === 'update';
    default:
      return true;
  }
}

/** Minuscules sans accents (« définitions » trouve « definitions »). */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

type SearchFields = Pick<CatalogModule, 'id' | 'name' | 'description' | 'category'>;

/** Recherche : tous les mots doivent apparaître dans le nom, la description, l'id ou la catégorie. */
export function matchesSearch(m: SearchFields, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldText(`${m.name} ${m.description || ''} ${m.id} ${m.category || ''}`);
  return words.every((w) => hay.includes(w));
}

const ORDER: Record<CatalogEntryState, number> = { update: 0, available: 1, installed: 2, incompatible: 3 };

/** Modules filtrés et triés : mises à jour, puis disponibles, installés, incompatibles ; par nom. */
export function filterCatalog<T extends EntryFields & SearchFields>(modules: T[], filter: CatalogFilter, query: string): T[] {
  return modules
    .filter((m) => matchesFilter(m, filter) && matchesSearch(m, query))
    .sort((a, b) => ORDER[catalogEntryState(a)] - ORDER[catalogEntryState(b)] || a.name.localeCompare(b.name));
}

export function filterCounts(modules: EntryFields[]): Record<CatalogFilter, number> {
  const out: Record<CatalogFilter, number> = { all: 0, available: 0, installed: 0, updates: 0 };
  for (const m of modules) for (const f of CATALOG_FILTERS) if (matchesFilter(m, f)) out[f]++;
  return out;
}

/* ---------------------------------------------------------------------------------------------- */
/* Progression d'installation : 3 étapes lisibles (téléchargement, signature, activation).          */
/* ---------------------------------------------------------------------------------------------- */

export type InstallStepKey = 'download' | 'verify' | 'activate';
export type InstallStepState = 'pending' | 'active' | 'done' | 'error';
export const INSTALL_STEPS: InstallStepKey[] = ['download', 'verify', 'activate'];

export interface InstallProgress {
  steps: Record<InstallStepKey, InstallStepState>;
  /** Pourcentage du téléchargement (null : inconnu). */
  percent: number | null;
  received: number | null;
  total: number | null;
  /** Étape en cours (ou en échec). */
  current: InstallStepKey;
  finished: boolean;
  failed: boolean;
  error: ProcessJobEvent | null;
}

const STEP_OF: Record<string, InstallStepKey> = {
  downloading: 'download',
  verifying: 'verify',
  installing: 'verify',
  installed: 'activate',
  starting: 'activate',
  running: 'activate',
  done: 'activate',
};

/** Étapes d'une opération d'installation à partir des événements du serveur. */
export function installProgress(events: ProcessJobEvent[], done: boolean): InstallProgress {
  let reached = 0;
  let percent: number | null = null;
  let received: number | null = null;
  let total: number | null = null;
  let error: ProcessJobEvent | null = null;
  let finished = false;
  for (const ev of events) {
    const key = STEP_OF[ev.step];
    if (key) reached = Math.max(reached, INSTALL_STEPS.indexOf(key));
    if (ev.step === 'downloading' && typeof ev.received === 'number') {
      received = ev.received;
      total = typeof ev.total === 'number' && ev.total > 0 ? ev.total : null;
      percent = total ? Math.min(100, Math.round((ev.received / total) * 100)) : null;
    }
    if (ev.step === 'error' || ev.step === 'rollback') error = error ?? ev;
    if (ev.step === 'running' || ev.step === 'done') finished = true;
  }
  if (reached > 0) percent = 100;
  const failed = !!error || (done && !finished);
  if (done && !failed) finished = true;
  const steps = {} as Record<InstallStepKey, InstallStepState>;
  INSTALL_STEPS.forEach((k, i) => {
    if (finished) steps[k] = 'done';
    else if (i < reached) steps[k] = 'done';
    else if (i === reached) steps[k] = failed ? 'error' : 'active';
    else steps[k] = 'pending';
  });
  return { steps, percent, received, total, current: INSTALL_STEPS[reached], finished, failed, error };
}

/** Message d'erreur clair (français) pour un échec d'installation, selon le code ou le texte du serveur. */
export function installErrorText(ev: ProcessJobEvent | null, step: InstallStepKey): string {
  const raw = `${ev?.code || ''} ${ev?.error || ''}`.toLowerCase();
  if (/signature|minisign|untrusted|key/.test(raw))
    return 'La signature du module est invalide ou la clé n’est pas approuvée : installation annulée, rien n’a été modifié.';
  if (/sha|checksum|hash|digest|integrity/.test(raw))
    return 'Le fichier téléchargé est corrompu (empreinte SHA-256 différente). Réessaie dans quelques instants.';
  if (/platform|arch|unsupported/.test(raw))
    return 'Ce module n’existe pas pour la plateforme de ton serveur.';
  if (/space|disk|enospc/.test(raw)) return 'Espace disque insuffisant sur le serveur.';
  if (/401|403|auth|token|forbidden/.test(raw))
    return 'Accès refusé au dépôt du module : vérifie le jeton (dépôt privé).';
  if (/404|not found/.test(raw)) return 'Release introuvable : le module ou sa version n’existe plus à cette adresse.';
  if (/timeout|timed out|network|connect|dns|download|http/.test(raw) || step === 'download')
    return 'Le téléchargement a échoué : le serveur n’a pas pu joindre GitHub. Vérifie sa connexion et réessaie.';
  if (step === 'verify') return 'La vérification du module a échoué : installation annulée, rien n’a été modifié.';
  if (/start|spawn|exit|crash|health/.test(raw) || step === 'activate')
    return 'Le module est installé mais n’a pas pu démarrer. Consulte son journal depuis la liste des modules.';
  return 'L’installation a échoué. Réessaie dans quelques instants.';
}

/* ---------------------------------------------------------------------------------------------- */
/* Validation immédiate de l'ajout par URL                                                          */
/* ---------------------------------------------------------------------------------------------- */

export type FieldCheck = { level: 'empty' | 'ok' | 'warn' | 'error'; text: string };

const GITHUB_REPO = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/i;
const GITHUB_ANY = /^https:\/\/(?:github\.com|raw\.githubusercontent\.com|objects\.githubusercontent\.com)\//i;

/** URL d'un module : HTTPS obligatoire ; dépôt GitHub reconnu ; release.json / .zip selon le type. */
export function checkModuleUrl(input: string, kind: 'data' | 'process'): FieldCheck {
  const u = input.trim();
  if (!u) return { level: 'empty', text: '' };
  if (/^http:\/\//i.test(u)) return { level: 'error', text: 'Adresse non sécurisée : utilise https://' };
  if (!/^https:\/\//i.test(u)) return { level: 'error', text: 'L’URL doit commencer par https:// (ex. https://github.com/propriétaire/dépôt).' };
  if (/\s/.test(u)) return { level: 'error', text: 'L’URL ne doit pas contenir d’espace.' };
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { level: 'error', text: 'URL invalide.' };
  }
  if (!parsed.hostname.includes('.')) return { level: 'error', text: 'Nom de domaine invalide.' };
  if (GITHUB_REPO.test(u)) {
    return {
      level: 'ok',
      text:
        kind === 'process'
          ? 'Dépôt GitHub reconnu : la dernière release (release.json) sera vérifiée.'
          : 'Dépôt GitHub reconnu : popcorn-module.yaml sera lu à la racine.',
    };
  }
  if (kind === 'process' && /\.json(?:\?.*)?$/i.test(u)) return { level: 'ok', text: 'Fichier release.json reconnu.' };
  if (kind === 'data' && /\.zip(?:\?.*)?$/i.test(u)) return { level: 'ok', text: 'Archive .zip reconnue.' };
  if (GITHUB_ANY.test(u)) return { level: 'ok', text: 'Adresse GitHub reconnue.' };
  return {
    level: 'warn',
    text:
      kind === 'process'
        ? 'Adresse hors GitHub : elle doit pointer vers le release.json du module.'
        : 'Adresse hors GitHub : elle doit pointer vers une archive .zip du module.',
  };
}

/** Clé publique minisign (facultative si l'éditeur est déjà approuvé). */
export function checkTrustKey(input: string): FieldCheck {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^untrusted comment:/i.test(l));
  const k = lines.join('');
  if (!k) return { level: 'empty', text: 'Facultative si l’éditeur est déjà approuvé (clé officielle Popcornn incluse).' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(k)) return { level: 'error', text: 'Clé invalide : caractères base64 uniquement.' };
  if (!k.startsWith('RW')) return { level: 'error', text: 'Ce n’est pas une clé publique minisign (elle commence par « RW »).' };
  if (k.length !== 56) return { level: 'error', text: `Clé incomplète : 56 caractères attendus (${k.length} saisis).` };
  return { level: 'ok', text: 'Clé minisign valide.' };
}

/** Jeton d'accès (dépôts privés, ex. module ratio) : jamais réaffiché, reste sur le serveur. */
export function checkAccessToken(input: string): FieldCheck {
  const t = input.trim();
  if (!t) return { level: 'empty', text: 'Uniquement pour un dépôt privé (ex. module ratio).' };
  if (/\s/.test(input.trim())) return { level: 'error', text: 'Le jeton ne doit pas contenir d’espace.' };
  if (/^(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/.test(t) || /^github_pat_[A-Za-z0-9_]{20,}$/.test(t))
    return { level: 'ok', text: 'Jeton GitHub reconnu (lecture seule suffit).' };
  if (t.length < 20) return { level: 'warn', text: 'Jeton court : vérifie qu’il est complet.' };
  return { level: 'ok', text: 'Jeton renseigné.' };
}
