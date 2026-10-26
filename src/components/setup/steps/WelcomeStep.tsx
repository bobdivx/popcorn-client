import { useState, useEffect } from 'preact/hooks';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import type { CloudImportStatus } from '../../../lib/client/cloud-import';
import { useI18n } from '../../../lib/i18n';
import { serverApi } from '../../../lib/client/server-api';

const DISCLAIMER_SECTIONS = [
  { num: '1', title: "Nature de l'Application", content: "Popcornn est un outil technique permettant de se connecter à un serveur distant pour la recherche, le téléchargement et la lecture de contenu multimédia via le protocole BitTorrent. Cette application est fournie \"en l'état\" à des fins éducatives et techniques uniquement." },
  { num: '2', title: "Responsabilité de l'Utilisateur", content: "L'utilisateur est entièrement et exclusivement responsable de tous les contenus qu'il recherche, télécharge, stocke, ou consulte via cette application. Il est de sa seule responsabilité de respecter toutes les lois applicables, les droits de propriété intellectuelle, et de vérifier la légalité de chaque téléchargement." },
  { num: '3', title: "Non-Responsabilité du Développeur", content: "Le développeur décline toute responsabilité concernant le contenu téléchargé, la légalité des actions effectuées, les violations de droits d'auteur, les dommages directs ou indirects, ou la perte de données résultant de l'utilisation de cette application." },
  { num: '4', title: "Protection des Données", content: "Cette application utilise un chiffrement end-to-end pour protéger les données. Le développeur n'a aucun accès aux données personnelles, préférences, ou bibliothèques de contenu. Toutes les communications sont chiffrées et les données sensibles restent sous le contrôle exclusif de l'utilisateur." },
  { num: '5', title: "Avertissement Légal", content: "ATTENTION : Le téléchargement et la consultation de contenu protégé par le droit d'auteur sans autorisation peut constituer une violation de la loi dans de nombreuses juridictions. L'utilisateur est seul responsable de s'assurer que ses actions sont légales dans sa juridiction." },
  { num: '6', title: "Utilisation à Vos Risques", content: "Cette application est fournie \"TEL QUELLE\", sans garantie d'aucune sorte. L'utilisateur utilise cette application à ses propres risques." },
];

interface WelcomeStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: (saveToCloud: boolean) => void;
  onNavigateToStep?: (stepId: string) => void;
}

function ConfigItem({
  label,
  icon,
  present,
  detail,
  onEdit,
}: {
  label: string;
  icon: preact.JSX.Element;
  present: boolean;
  detail?: string | null;
  onEdit?: () => void;
}) {
  return (
    <div class="wz-row">
      <div class={`wz-row__icon${present ? ' is-on' : ''}`}>{icon}</div>
      <div class="wz-row__body">
        <span class="wz-row__title">{label}</span>
        {detail && <span class="wz-row__desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{detail}</span>}
      </div>
      <div class="wz-row__aside">
        {present ? (
          <>
            <span class="wz-badge wz-badge--ok">Importé</span>
            {onEdit && (
              <button type="button" class="wz-btn wz-btn--ghost wz-btn--sm" data-focusable onClick={onEdit}>
                Modifier
              </button>
            )}
          </>
        ) : (
          <span class="wz-badge">Non trouvé</span>
        )}
      </div>
    </div>
  );
}

export function WelcomeStep({ focusedButtonIndex, buttonRefs, onNext, onNavigateToStep }: WelcomeStepProps) {
  const { t } = useI18n();
  const saveToCloud = true; // Toujours synchroniser vers le cloud
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [disclaimerScrolledToBottom, setDisclaimerScrolledToBottom] = useState(false);
  const [importStatus, setImportStatus] = useState<CloudImportStatus>(CloudImportManager.getStatus());
  const [hasBackendTmdb, setHasBackendTmdb] = useState(false);
  const [backendTmdbPreview, setBackendTmdbPreview] = useState<string | null>(null);
  const [hasBackendIndexerCategories, setHasBackendIndexerCategories] = useState(false);


  useEffect(() => {
    return CloudImportManager.subscribe(setImportStatus);
  }, []);

  useEffect(() => {
    let cancelled = false;
    serverApi.getTmdbKey().then((res) => {
      if (cancelled) return;
      setHasBackendTmdb(!!(res.success && res.data?.hasKey));
      setBackendTmdbPreview(res.success && res.data?.apiKey ? res.data.apiKey : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const indexersRes = await serverApi.getIndexers();
        if (!indexersRes.success || !indexersRes.data || cancelled) { setHasBackendIndexerCategories(false); return; }
        for (const idx of indexersRes.data) {
          if (!idx?.id) continue;
          const catsRes = await serverApi.getIndexerCategories(idx.id);
          if (!catsRes.success || !catsRes.data) continue;
          const hasEnabled = Object.values(catsRes.data).some((cfg) => (cfg as any)?.enabled === true);
          if (hasEnabled && !cancelled) { setHasBackendIndexerCategories(true); return; }
        }
        if (!cancelled) setHasBackendIndexerCategories(false);
      } catch { if (!cancelled) setHasBackendIndexerCategories(false); }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const isImportRunning = importStatus.phase === 'running';
  const importDone = importStatus.phase === 'success';
  const importProgress = importStatus.total > 0 ? Math.min(100, Math.round((importStatus.done / importStatus.total) * 100)) : 0;

  const imported = importStatus.importedData;

  const configItems = imported ? [
    {
      key: 'indexers',
      label: t('wizard.welcome.importLabelIndexers'),
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.4} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      present: !!(imported.indexers?.length),
      detail: imported.indexers?.length ? `${imported.indexers.length} indexer${imported.indexers.length > 1 ? 's' : ''} : ${imported.indexers.map((i: any) => i.name).join(', ')}` : null,
      onEdit: onNavigateToStep ? () => onNavigateToStep('indexers') : undefined,
    },
    {
      key: 'tmdb',
      label: t('wizard.welcome.importLabelTmdb'),
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.4} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      ),
      present: !!imported.tmdbApiKey || hasBackendTmdb,
      detail: null,
      onEdit: onNavigateToStep ? () => onNavigateToStep('tmdb') : undefined,
    },
    {
      key: 'downloadLocation',
      label: t('wizard.welcome.importLabelDownloadLocation'),
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.4} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
      present: !!imported.downloadLocation,
      detail: imported.downloadLocation ? imported.downloadLocation : null,
      onEdit: onNavigateToStep ? () => onNavigateToStep('downloadLocation') : undefined,
    },
    {
      key: 'syncSettings',
      label: t('wizard.welcome.importLabelSyncSettings'),
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.4} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      present: !!imported.syncSettings,
      detail: imported.syncSettings ? (imported.syncSettings.syncEnabled ? 'Activée' : 'Désactivée') : null,
      onEdit: onNavigateToStep ? () => onNavigateToStep('sync') : undefined,
    },
    {
      key: 'categories',
      label: t('wizard.welcome.importLabelCategories'),
      icon: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={1.4} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      present: !!(imported.indexerCategories && Object.keys(imported.indexerCategories).length > 0) || hasBackendIndexerCategories,
      detail: null,
      onEdit: undefined,
    },
  ] : [];

  return (
    <div>
      <header class="wz-head">
        <span class="wz-kicker">Popcornn</span>
        <h2 class="wz-title">{t('wizard.welcome.title')}</h2>
        <span class="wz-rule" />
        <p class="wz-lead">{t('wizard.welcome.description')}</p>
      </header>

      {/* Bloc Disclaimer (fusionné) */}
      <section style="margin-bottom:32px;">
        <span class="wz-section-label">Avertissement</span>
        <div style="position:relative;">
          <div
            class="wz-panel wz-scroll"
            style="max-height:240px;padding:20px 22px;"
            onScroll={(e: Event) => {
              const el = e.target as HTMLElement;
              if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) setDisclaimerScrolledToBottom(true);
            }}
          >
            <div class="wz-alert wz-alert--warning" style="margin-bottom:8px;">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5} aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94 2.4 17.25A1.95 1.95 0 0 0 4.06 20.2h15.88a1.95 1.95 0 0 0 1.66-2.95L13.66 3.94a1.95 1.95 0 0 0-3.32 0z" />
              </svg>
              <div class="wz-alert__body">Usage personnel légal uniquement. Vous êtes seul responsable de votre utilisation.</div>
            </div>
            <ol class="wz-list wz-list--lines">
              {DISCLAIMER_SECTIONS.map((section) => (
                <li key={section.num} style="padding:16px 0;">
                  <span class="wz-num">{section.num.length < 2 ? `0${section.num}` : section.num}</span>
                  <div style="flex:1;min-width:0;">
                    <span class="wz-row__title" style="margin-bottom:6px;">{section.title}</span>
                    <p class="wz-text-sm">{section.content}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {!disclaimerScrolledToBottom && (
            <div style="position:absolute;bottom:1px;left:1px;right:1px;height:44px;background:linear-gradient(to top, rgba(12,13,16,0.96), rgba(12,13,16,0));pointer-events:none;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;">
              <span class="wz-section-label" style="margin:0;color:var(--wz-accent);">Défiler pour lire</span>
            </div>
          )}
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={disclaimerAccepted}
          data-focusable
          class={`wz-check${disclaimerAccepted ? ' is-checked' : ''}`}
          style="margin-top:12px;"
          onClick={() => setDisclaimerAccepted(!disclaimerAccepted)}
        >
          <span class="wz-check__box">
            {disclaimerAccepted && (
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={3} aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
          <span style="user-select:none;">J'ai lu et j'accepte les termes ci-dessus. Je suis entièrement responsable de mon utilisation.</span>
        </button>
        <div style="margin-top:14px;">
          <a href="/disclaimer" target="_blank" class="wz-link" onClick={(e) => e.stopPropagation()}>
            Lire la version complète ↗
          </a>
        </div>
      </section>

      {/* Ce qui sera configuré (si pas d'import) */}
      {importStatus.phase === 'idle' && (
        <section style="margin-bottom:8px;">
          <span class="wz-section-label">À configurer</span>
          <ol class="wz-list wz-list--lines" style="border-top:1px solid var(--wz-line);">
            {[
              'Un indexer pour récupérer les torrents (facultatif)',
              'Une clé API TMDB pour les métadonnées',
              'L\'emplacement de téléchargement',
            ].map((text, i) => (
              <li key={i} style="align-items:center;padding:14px 0;">
                <span class="wz-num">{`0${i + 1}`}</span>
                <span class="wz-text">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Import en cours */}
      {isImportRunning && (
        <div class="wz-panel wz-panel--accent" style="margin-bottom:8px;">
          <div class="wz-inline" style="margin-bottom:10px;">
            <span class="ed-spinner ed-spinner--xs" aria-hidden="true" />
            <span class="wz-row__title" style="color:var(--wz-accent);">{t('wizard.welcome.importTitle')}</span>
          </div>
          <p class="wz-text-sm" style="margin-bottom:14px;">{importStatus.message}</p>
          {importStatus.total > 0 && (
            <div>
              <div class="wz-progress">
                <div class="wz-progress__fill" style={`width:${importProgress}%`} />
              </div>
              <div class="wz-version" style="margin-top:8px;">{importStatus.done} / {importStatus.total}</div>
            </div>
          )}
        </div>
      )}

      {/* Import terminé */}
      {importDone && configItems.length > 0 && (
        <section style="margin-bottom:8px;">
          <span class="wz-section-label" style="color:var(--wz-ok);">✓ Configuration importée depuis le cloud</span>
          <div class="wz-rows">
            {configItems.map((item) => (
              <ConfigItem
                key={item.key}
                label={item.label}
                icon={item.icon}
                present={item.present}
                detail={item.detail}
                onEdit={item.onEdit}
              />
            ))}
          </div>
          {imported?.indexers?.length && !imported.tmdbApiKey && !imported.downloadLocation && !imported.syncSettings && (
            <div class="wz-alert wz-alert--warning" style="margin-top:14px;">
              <div class="wz-alert__body">{t('wizard.welcome.importOnlyIndexersHint')}</div>
            </div>
          )}
        </section>
      )}

      {/* Erreur d'import */}
      {importStatus.phase === 'error' && (
        <div class="wz-alert wz-alert--error" role="alert" style="margin-bottom:8px;">
          <div class="wz-alert__body">{importStatus.error || 'Erreur lors de l\'import cloud'}</div>
        </div>
      )}

      <div class="wz-actions wz-actions--end">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          type="button"
          class="wz-btn wz-btn--primary"
          data-focusable
          onClick={() => onNext(saveToCloud)}
          disabled={isImportRunning || !disclaimerAccepted}
        >
          {isImportRunning ? (
            <>
              <span class="ed-spinner ed-spinner--xs" aria-hidden="true" />
              Import en cours...
            </>
          ) : (
            <>
              Commencer la configuration
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5} aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
