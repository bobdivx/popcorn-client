import { useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CatalogModule } from '../../../lib/client/server-api/modules';
import { Icon, formatSize } from './moduleUi';
import { catalogIconName, type StoreTx } from './ModuleStore';
import type { JobView } from './ProcessModules';
import {
  CATALOG_FILTERS,
  INSTALL_STEPS,
  type CatalogEntryState,
  type CatalogFilter,
  type FieldCheck,
  catalogEntryState,
  filterCatalog,
  filterCounts,
  installErrorText,
  installProgress,
} from './moduleCatalogModel';

/**
 * Corps de la modale « Catalogue de modules » : recherche, filtres, cartes (icône, nom, description,
 * version, taille, état), installation en un clic avec progression en 3 étapes (téléchargement,
 * vérification de la signature, activation) et, en section secondaire, l'ajout d'un module
 * particulier par URL (dépôt GitHub, clé de confiance, jeton pour un dépôt privé).
 *
 * Clavier / télécommande : chaque carte expose un bouton d'action focusable (`data-focusable`) ;
 * flèches entre cartes au clavier (hors TV : la navigation spatiale TV gère déjà les flèches).
 */

export const CATALOG_TEXT = {
  fr: {
    title: 'Catalogue de modules',
    search: 'Rechercher un module',
    searchPlaceholder: 'Rechercher (nom, fonction…)',
    filters: { all: 'Tous', available: 'Disponibles', installed: 'Installés', updates: 'Mises à jour' } as Record<CatalogFilter, string>,
    states: {
      available: 'Disponible',
      installed: 'Installé',
      update: 'À mettre à jour',
      incompatible: 'Incompatible',
    } as Record<CatalogEntryState, string>,
    kindProcess: 'Exécutable',
    kindData: 'Données',
    noMatch: 'Aucun module ne correspond à ta recherche.',
    clear: 'Effacer',
    steps: { download: 'Téléchargement', verify: 'Vérification de la signature', activate: 'Activation' },
    stepDone: 'terminé',
    stepActive: 'en cours',
    dataBusy: 'Téléchargement et vérification de la signature…',
    installedOk: 'Installé et activé',
    retry: 'Réessayer',
    open: 'Installé',
    signedOfficial: 'Signé Popcornn',
    urlTitle: 'Module particulier (URL)',
    urlHint: 'Module absent du catalogue ou privé (ex. ratio) : colle l’URL de son dépôt GitHub, sa clé de confiance et, pour un dépôt privé, un jeton d’accès.',
    refresh: 'Actualiser le catalogue',
    results: (n: number) => `${n} module${n > 1 ? 's' : ''}`,
  },
  en: {
    title: 'Module catalog',
    search: 'Search modules',
    searchPlaceholder: 'Search (name, feature…)',
    filters: { all: 'All', available: 'Available', installed: 'Installed', updates: 'Updates' } as Record<CatalogFilter, string>,
    states: {
      available: 'Available',
      installed: 'Installed',
      update: 'Update available',
      incompatible: 'Incompatible',
    } as Record<CatalogEntryState, string>,
    kindProcess: 'Executable',
    kindData: 'Data',
    noMatch: 'No module matches your search.',
    clear: 'Clear',
    steps: { download: 'Download', verify: 'Signature check', activate: 'Activation' },
    stepDone: 'done',
    stepActive: 'in progress',
    dataBusy: 'Downloading and checking the signature…',
    installedOk: 'Installed and enabled',
    retry: 'Retry',
    open: 'Installed',
    signedOfficial: 'Signed by Popcornn',
    urlTitle: 'Custom module (URL)',
    urlHint: 'Module not in the catalog or private (e.g. ratio): paste its GitHub repository URL, its trust key and, for a private repository, an access token.',
    refresh: 'Refresh catalog',
    results: (n: number) => `${n} module${n > 1 ? 's' : ''}`,
  },
};
export type CatalogTx = (typeof CATALOG_TEXT)['fr'];
export const catalogTx = (language: string): CatalogTx =>
  language === 'en' ? (CATALOG_TEXT.en as unknown as CatalogTx) : CATALOG_TEXT.fr;

/** Message de validation immédiate sous un champ (couleur et annonce selon le niveau). */
export function FieldHint({ check, id }: { check: FieldCheck; id?: string }) {
  if (!check.text) return null;
  return (
    <span
      id={id}
      class={`mcat-hint mcat-hint--${check.level} text-xs tv:text-base`}
      role={check.level === 'error' ? 'alert' : undefined}
      aria-live="polite"
    >
      {check.level === 'ok' ? '✓ ' : check.level === 'error' ? '✕ ' : check.level === 'warn' ? '! ' : ''}
      {check.text}
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function isTvPlatform(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-tv-platform') === 'true';
}

/** Flèches clavier entre les boutons d'action des cartes (grille), hors TV. */
function onGridKeyDown(e: KeyboardEvent) {
  if (isTvPlatform()) return;
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const grid = e.currentTarget as HTMLElement;
  const targets = Array.from(grid.querySelectorAll<HTMLElement>('[data-mcat-action]:not([disabled])'));
  const i = targets.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  let next = -1;
  if (e.key === 'ArrowRight') next = i + 1;
  else if (e.key === 'ArrowLeft') next = i - 1;
  else {
    const cur = targets[i].getBoundingClientRect();
    const down = e.key === 'ArrowDown';
    let best = Infinity;
    targets.forEach((t, j) => {
      const r = t.getBoundingClientRect();
      const dy = down ? r.top - cur.top : cur.top - r.top;
      if (dy <= 4) return;
      const score = dy * 4 + Math.abs(r.left - cur.left);
      if (score < best) {
        best = score;
        next = j;
      }
    });
  }
  if (next >= 0 && next < targets.length) {
    e.preventDefault();
    targets[next].focus();
    targets[next].scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

export interface ModuleCatalogViewProps {
  modules: CatalogModule[];
  loading: boolean;
  error: string | null;
  stx: StoreTx;
  ctx: CatalogTx;
  /** Opération de modules process suivie par la page (installation / mise à jour). */
  job: JobView | null;
  jobRunning: boolean;
  /** `catalog:<id>` pendant l'appel d'installation (modules de données : pas d'opération suivie). */
  busy: string | null;
  onInstall: (m: CatalogModule) => void;
  onRefresh: () => void;
  /** Bannière d'information / d'erreur de la page. */
  notice?: ComponentChildren;
  /** Formulaires d'ajout par URL (section secondaire repliable). */
  /** Absent en édition « catalogue seul » (Store) : pas d'ajout par URL. */
  urlSection?: ComponentChildren;
  urlOpenInitially?: boolean;
}

export function ModuleCatalogView(props: ModuleCatalogViewProps) {
  const { modules, loading, error, stx, ctx, job, jobRunning, busy, onInstall, onRefresh, notice, urlSection } = props;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');
  const [urlOpen, setUrlOpen] = useState(!!props.urlOpenInitially);
  const urlRef = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => filterCounts(modules), [modules]);
  const shown = useMemo(() => filterCatalog(modules, filter, query), [modules, filter, query]);

  const toggleUrl = () => {
    const next = !urlOpen;
    setUrlOpen(next);
    if (next) {
      setTimeout(() => {
        urlRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        urlRef.current?.querySelector<HTMLElement>('input:not([disabled]), button[role="radio"]')?.focus({ preventScroll: true });
      }, 60);
    }
  };

  return (
    <div class="mcat grid gap-5 tv:gap-7">
      {!urlOpen && notice}
      <div class="mcat-toolbar">
        <label class="mcat-search">
          <span class="sr-only">{ctx.search}</span>
          <Icon name="search" size={18} />
          <input
            type="search"
            data-focusable
            data-mcat-search
            value={query}
            placeholder={ctx.searchPlaceholder}
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
        </label>
        <div class="mcat-chips" role="group" aria-label={ctx.search}>
          {CATALOG_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-focusable
              data-mcat-filter={f}
              aria-pressed={filter === f}
              class={`mcat-chip${filter === f ? ' is-active' : ''}`}
              disabled={f !== 'all' && counts[f] === 0 && filter !== f}
              onClick={() => setFilter(f)}
            >
              {ctx.filters[f]}
              <span class="mcat-chip-count">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && modules.length === 0 && (
        <ul class="mcat-grid" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} class="mcat-card mcat-card--skeleton" />
          ))}
        </ul>
      )}
      {error && modules.length === 0 && (
        <div class="mcat-empty" role="alert">
          <p>{stx.error}</p>
          <button type="button" data-focusable class="mcat-btn mcat-btn--ghost" onClick={onRefresh}>
            <Icon name="sync" />
            {ctx.refresh}
          </button>
        </div>
      )}
      {!loading && !error && modules.length === 0 && <p class="mcat-empty">{stx.empty}</p>}
      {modules.length > 0 && shown.length === 0 && (
        <div class="mcat-empty">
          <p>{ctx.noMatch}</p>
          <button
            type="button"
            data-focusable
            class="mcat-btn mcat-btn--ghost"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            {ctx.clear}
          </button>
        </div>
      )}

      {shown.length > 0 && (
        <ul class="mcat-grid" aria-label={ctx.results(shown.length)} onKeyDown={onGridKeyDown}>
          {shown.map((m, i) => (
            <CatalogCard
              key={m.id}
              m={m}
              index={i}
              stx={stx}
              ctx={ctx}
              job={job && job.moduleId === m.id ? job : null}
              locked={!!busy || jobRunning}
              busy={busy === `catalog:${m.id}`}
              onInstall={onInstall}
            />
          ))}
        </ul>
      )}

      {urlSection && (
        <section class={`mcat-url${urlOpen ? ' is-open' : ''}`} ref={urlRef}>
          <button
            type="button"
            data-focusable
            data-mcat-url-toggle
            class="mcat-url-toggle"
            aria-expanded={urlOpen}
            aria-controls="mcat-url-body"
            onClick={toggleUrl}
          >
            <span class="mcat-url-icon">
              <Icon name="link" size={20} />
            </span>
            <span class="mcat-url-copy">
              <span class="mcat-url-title">{ctx.urlTitle}</span>
              <span class="mcat-url-hint">{ctx.urlHint}</span>
            </span>
            <span class="mcat-url-chevron" aria-hidden="true">
              ›
            </span>
          </button>
          <div id="mcat-url-body" class="mcat-url-body" hidden={!urlOpen}>
            {urlOpen && notice}
            {urlOpen && urlSection}
          </div>
        </section>
      )}
    </div>
  );
}

function CatalogCard({
  m,
  index,
  stx,
  ctx,
  job,
  locked,
  busy,
  onInstall,
}: {
  m: CatalogModule;
  index: number;
  stx: StoreTx;
  ctx: CatalogTx;
  job: JobView | null;
  locked: boolean;
  busy: boolean;
  onInstall: (m: CatalogModule) => void;
}) {
  const state = catalogEntryState(m);
  const disabledModule = state === 'installed' && (m.enabled === false || m.status === 'disabled' || m.state === 'failed');
  const action: 'install' | 'update' | 'start' | null =
    state === 'available' ? 'install' : state === 'update' ? 'update' : disabledModule ? 'start' : null;
  const progress = job ? installProgress(job.events, job.done) : null;
  const working = busy || (!!job && !job.done);
  const failed = !!progress && progress.failed && !!job?.done;
  const succeeded = !!progress && progress.finished && !!job?.done && !failed;
  const version = m.installed_version && m.update_available ? `${m.installed_version} → ${m.version}` : m.installed_version || m.version;
  const kind = (m.kind || 'process') === 'data' ? ctx.kindData : ctx.kindProcess;
  const label = action === 'update' ? stx.update : action === 'start' ? stx.start : failed ? ctx.retry : stx.install;
  const titleId = `mcat-${m.id.replace(/[^\w-]/g, '-')}`;

  return (
    <li
      class={`mcat-card mcat-card--${state}${working ? ' is-working' : ''}${failed ? ' is-failed' : ''}`}
      style={{ '--mcat-i': Math.min(index, 12) } as Record<string, number>}
      aria-labelledby={titleId}
      data-mcat-card={m.id}
    >
      <div class="mcat-card-head">
        <span class="mcat-card-icon" aria-hidden="true">
          <Icon name={catalogIconName(m)} size={26} />
        </span>
        <div class="mcat-card-titles">
          <h3 id={titleId} class="mcat-card-title">
            {m.name}
          </h3>
          <span class={`mcat-badge mcat-badge--${succeeded ? 'installed' : state}`}>
            {succeeded ? ctx.states.installed : ctx.states[state]}
          </span>
        </div>
      </div>
      {m.description && <p class="mcat-card-desc">{m.description}</p>}
      <dl class="mcat-card-meta">
        <div>
          <dt class="sr-only">Version</dt>
          <dd>v{version}</dd>
        </div>
        {typeof m.size === 'number' && m.size > 0 && (
          <div>
            <dt class="sr-only">Taille</dt>
            <dd>{formatSize(m.size)}</dd>
          </div>
        )}
        <div>
          <dt class="sr-only">Type</dt>
          <dd>{kind}</dd>
        </div>
        {m.signed_by_official && (
          <div>
            <dt class="sr-only">Signature</dt>
            <dd class="mcat-signed">
              <Icon name="lock" size={14} /> {ctx.signedOfficial}
            </dd>
          </div>
        )}
      </dl>
      {state === 'incompatible' && m.incompatible_reason && (
        <p class="mcat-card-warn">
          {stx.incompatible} : {m.incompatible_reason}
        </p>
      )}

      {busy && !job && (
        <div class="mcat-progress" role="status" aria-live="polite">
          <div class="mcat-bar mcat-bar--indeterminate">
            <span />
          </div>
          <p class="mcat-progress-label">{ctx.dataBusy}</p>
        </div>
      )}
      {progress && (working || failed || succeeded) && (
        <div class="mcat-progress" role="status" aria-live="polite">
          <ol class="mcat-steps">
            {INSTALL_STEPS.map((k) => {
              const s = progress.steps[k];
              return (
                <li key={k} class={`mcat-step is-${s}`}>
                  <span class="mcat-step-dot" aria-hidden="true">
                    {s === 'done' ? '✓' : s === 'error' ? '✕' : ''}
                  </span>
                  <span class="mcat-step-label">
                    {ctx.steps[k]}
                    <span class="sr-only">
                      {s === 'done' ? ` (${ctx.stepDone})` : s === 'active' ? ` (${ctx.stepActive})` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          {working && progress.current === 'download' && (
            <div class={`mcat-bar${progress.percent === null ? ' mcat-bar--indeterminate' : ''}`}>
              <span style={progress.percent === null ? undefined : { width: `${progress.percent}%` }} />
            </div>
          )}
          {working && progress.current === 'download' && progress.received !== null && (
            <p class="mcat-progress-label">
              {progress.percent !== null ? `${progress.percent} % · ` : ''}
              {formatSize(progress.received)}
              {progress.total ? ` / ${formatSize(progress.total)}` : ''}
            </p>
          )}
          {failed && (
            <p class="mcat-error" role="alert">
              {installErrorText(progress.error, progress.current)}
            </p>
          )}
          {succeeded && <p class="mcat-success">✓ {ctx.installedOk}</p>}
        </div>
      )}

      <div class="mcat-card-actions">
        {(action || failed) && !(succeeded && action === 'install') ? (
          <button
            type="button"
            data-focusable
            data-mcat-action
            data-mcat-install={m.id}
            class={`mcat-btn${action === 'start' ? ' mcat-btn--ghost' : ''}`}
            disabled={locked || working}
            aria-describedby={titleId}
            onClick={() => onInstall(m)}
          >
            <Icon name={action === 'start' ? 'play' : action === 'update' ? 'refresh' : 'download'} />
            {working ? stx.installing : label}
          </button>
        ) : state !== 'incompatible' ? (
          <span class="mcat-installed">
            <span aria-hidden="true">✓</span> {ctx.open}
          </span>
        ) : null}
      </div>
    </li>
  );
}
