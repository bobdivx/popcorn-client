import { useState, useEffect } from 'preact/hooks';
import { CloudImportManager } from '../../../lib/client/cloud-import';
import type { CloudImportStatus } from '../../../lib/client/cloud-import';
import { useI18n } from '../../../lib/i18n';
import { serverApi } from '../../../lib/client/server-api';

const DISCLAIMER_SECTIONS = [
  { num: '1', title: "Nature de l'Application", content: "Popcorn Client est un outil technique permettant de se connecter à un serveur distant pour la recherche, le téléchargement et la lecture de contenu multimédia via le protocole BitTorrent. Cette application est fournie \"en l'état\" à des fins éducatives et techniques uniquement." },
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
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;margin-bottom:8px;">
      <div style={`width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;${present ? 'background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.2);' : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);'}`}>
        {icon}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.75);">{label}</div>
        {detail && <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{detail}</div>}
      </div>
      {present ? (
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div style="width:7px;height:7px;border-radius:50%;background:#4ade80;" />
          <span style="font-size:11.5px;font-weight:600;color:#4ade80;">Importé</span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              style="margin-left:6px;padding:4px 10px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.2);border-radius:6px;color:#c4b5fd;font-size:11.5px;font-weight:600;cursor:pointer;transition:all 0.15s;"
            >
              Modifier
            </button>
          )}
        </div>
      ) : (
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.2);" />
          <span style="font-size:11.5px;color:rgba(255,255,255,0.3);">Non trouvé</span>
        </div>
      )}
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
        <svg style="width:15px;height:15px;color:rgba(167,139,250,0.8);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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
        <svg style="width:15px;height:15px;color:rgba(167,139,250,0.8);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
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
        <svg style="width:15px;height:15px;color:rgba(167,139,250,0.8);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
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
        <svg style="width:15px;height:15px;color:rgba(167,139,250,0.8);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
        <svg style="width:15px;height:15px;color:rgba(167,139,250,0.8);" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      ),
      present: !!(imported.indexerCategories && Object.keys(imported.indexerCategories).length > 0) || hasBackendIndexerCategories,
      detail: null,
      onEdit: undefined,
    },
  ] : [];

  return (
    <div>
      <style>{`
        .disclaimer-scroll::-webkit-scrollbar { width: 4px; }
        .disclaimer-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 4px; }
        .disclaimer-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,0.3); border-radius: 4px; }
        .disclaimer-section { display: flex; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .disclaimer-section:last-child { border-bottom: none; padding-bottom: 0; }
        .disclaimer-num { width: 22px; height: 22px; border-radius: 50%; background: rgba(124,58,237,0.15); border: 1px solid rgba(124,58,237,0.25); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #a78bfa; flex-shrink: 0; margin-top: 1px; }
        .checkbox-custom { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: all 0.15s; }
        .checkbox-custom.checked { background: #7c3aed; border-color: #7c3aed; box-shadow: 0 0 0 3px rgba(124,58,237,0.2); }
      `}</style>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:24px;font-weight:700;color:#fff;margin:0 0 8px;">{t('wizard.welcome.title')}</h2>
        <p style="font-size:14px;color:rgba(255,255,255,0.4);margin:0;">{t('wizard.welcome.description')}</p>
      </div>

      {/* Bloc Disclaimer (fusionné) */}
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:rgba(255,255,255,0.35);text-transform:uppercase;margin-bottom:10px;">Avertissement</div>
        <div style="position:relative;">
          <div
            class="disclaimer-scroll"
            style="max-height:220px;overflow-y:auto;padding:14px 18px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;"
            onScroll={(e: Event) => {
              const el = e.target as HTMLElement;
              if (el.scrollHeight - el.scrollTop <= el.clientHeight + 40) setDisclaimerScrolledToBottom(true);
            }}
          >
            <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:10px;margin-bottom:12px;">
              <svg style="width:14px;height:14px;color:#fbbf24;flex-shrink:0;margin-top:1px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p style="font-size:12px;color:rgba(251,191,36,0.8);margin:0;line-height:1.5;">Usage personnel légal uniquement. Vous êtes seul responsable de votre utilisation.</p>
            </div>
            {DISCLAIMER_SECTIONS.map((section) => (
              <div key={section.num} class="disclaimer-section">
                <div class="disclaimer-num">{section.num}</div>
                <div>
                  <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);margin-bottom:2px;">{section.title}</div>
                  <p style="font-size:11.5px;color:rgba(255,255,255,0.45);margin:0;line-height:1.5;">{section.content}</p>
                </div>
              </div>
            ))}
          </div>
          {!disclaimerScrolledToBottom && (
            <div style="position:absolute;bottom:0;left:0;right:0;height:36px;background:linear-gradient(to top, rgba(7,7,14,0.9), transparent);border-radius:0 0 12px 12px;pointer-events:none;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;">
              <span style="font-size:10px;color:rgba(167,139,250,0.6);">Défiler pour lire</span>
            </div>
          )}
        </div>
        <label
          style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:12px 14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-top:10px;transition:border-color 0.15s;"
          onClick={() => setDisclaimerAccepted(!disclaimerAccepted)}
        >
          <div class={`checkbox-custom ${disclaimerAccepted ? 'checked' : ''}`}>
            {disclaimerAccepted && (
              <svg style="width:11px;height:11px;color:#fff;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span style="font-size:12px;color:rgba(255,255,255,0.6);line-height:1.5;user-select:none;">J'ai lu et j'accepte les termes ci-dessus. Je suis entièrement responsable de mon utilisation.</span>
        </label>
        <a href="/disclaimer" target="_blank" style="font-size:11px;color:rgba(167,139,250,0.6);text-decoration:none;display:inline-flex;align-items:center;gap:4px;margin-top:6px;" onClick={(e) => e.stopPropagation()}>
          Lire la version complète
          <svg style="width:10px;height:10px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>

      <div style="height:1px;background:rgba(255,255,255,0.06);margin-bottom:20px;" />

      {/* Ce qui sera configuré (si pas d'import) */}
      {importStatus.phase === 'idle' && (
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:12px;">
            À configurer
          </div>
          {[
            { icon: '🔍', text: 'Un indexer pour récupérer les torrents' },
            { icon: '🎬', text: 'Une clé API TMDB pour les métadonnées' },
            { icon: '📁', text: 'L\'emplacement de téléchargement' },
          ].map((item, i) => (
            <div key={i} style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);" class={i === 2 ? 'border-none' : ''}>
              <span style="font-size:16px;">{item.icon}</span>
              <span style="font-size:13.5px;color:rgba(255,255,255,0.55);">{item.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Import en cours */}
      {isImportRunning && (
        <div style="background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.15);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <div style="width:8px;height:8px;border-radius:50%;background:#a78bfa;animation:wizard-pulse 1s ease-in-out infinite;" />
            <span style="font-size:13.5px;font-weight:600;color:#c4b5fd;">{t('wizard.welcome.importTitle')}</span>
          </div>
          <p style="font-size:12.5px;color:rgba(255,255,255,0.45);margin:0 0 10px;">{importStatus.message}</p>
          {importStatus.total > 0 && (
            <div>
              <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:9999px;overflow:hidden;">
                <div style={`height:100%;border-radius:9999px;background:linear-gradient(90deg,#7c3aed,#a78bfa);transition:width 0.3s ease;width:${importProgress}%`} />
              </div>
              <div style="font-size:11.5px;color:rgba(255,255,255,0.3);margin-top:4px;">{importStatus.done} / {importStatus.total}</div>
            </div>
          )}
        </div>
      )}

      {/* Import terminé */}
      {importDone && configItems.length > 0 && (
        <div style="margin-bottom:20px;">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.5px;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px;">
            <svg style="width:12px;height:12px;color:#4ade80;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Configuration importée depuis le cloud
          </div>
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
          {imported?.indexers?.length && !imported.tmdbApiKey && !imported.downloadLocation && !imported.syncSettings && (
            <div style="padding:10px 14px;background:rgba(234,179,8,0.06);border:1px solid rgba(234,179,8,0.15);border-radius:10px;margin-top:8px;">
              <p style="font-size:12.5px;color:rgba(234,179,8,0.8);margin:0;">{t('wizard.welcome.importOnlyIndexersHint')}</p>
            </div>
          )}
        </div>
      )}

      {/* Erreur d'import */}
      {importStatus.phase === 'error' && (
        <div style="padding:12px 14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:10px;margin-bottom:16px;">
          <p style="font-size:13px;color:#fca5a5;margin:0;">{importStatus.error || 'Erreur lors de l\'import cloud'}</p>
        </div>
      )}


      <div style="display:flex;justify-content:flex-end;">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          class="wizard-btn-primary"
          onClick={() => onNext(saveToCloud)}
          disabled={isImportRunning || !disclaimerAccepted}
          style="padding:12px 24px;font-size:14.5px;"
        >
          {isImportRunning ? (
            <>
              <div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:wizard-pulse 0.6s linear infinite;" />
              Import en cours...
            </>
          ) : (
            <>
              Commencer la configuration
              <svg style="width:15px;height:15px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
