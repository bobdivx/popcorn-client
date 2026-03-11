import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { LibraryMediaEntry } from '../../lib/client/server-api/library';
import type { C411BatchEvent } from '../../lib/client/server-api/upload-tracker';
import { useI18n } from '../../lib/i18n/useI18n';
import { DsCardSection } from '../ui/design-system';
import { Check, Copy, Loader2, XCircle, Upload } from 'lucide-preact';

type BatchItemStatus = 'pending' | 'torrent' | 'upload' | 'success' | 'error';

interface BatchItem {
  media_id: string;
  media_title: string;
  index: number;
  total: number;
  status: BatchItemStatus;
  message?: string;
}

const SAVED_MASK = '********';

interface UploadTrackerPanelProps {
  /** Appelé après que l'utilisateur a configuré C411 (cookies ou passkey enregistrés) */
  onC411Configured?: () => void;
}

export default function UploadTrackerPanel({ onC411Configured }: UploadTrackerPanelProps) {
  const { t } = useI18n();
  const [mediaList, setMediaList] = useState<LibraryMediaEntry[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [announceUrl, setAnnounceUrl] = useState('');
  const [passkey, setPasskey] = useState('');
  const [rawCookie, setRawCookie] = useState('');
  const [c411SessionCookie, setC411SessionCookie] = useState('');
  const [c411CsrfCookie, setC411CsrfCookie] = useState('');
  const [cookiesSaved, setCookiesSaved] = useState(false);
  const [hasPasskeySaved, setHasPasskeySaved] = useState(false);
  const [uploadAssistantPath, setUploadAssistantPath] = useState('');
  const [uploadAssistantEnabled, setUploadAssistantEnabled] = useState(false);
  const [loadingCookies, setLoadingCookies] = useState(true);
  const [savingCookies, setSavingCookies] = useState(false);
  const [creatingTorrent, setCreatingTorrent] = useState(false);
  const [publishToC411, setPublishToC411] = useState(true);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{ success: number; error: number } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const loadCookiesStatus = useCallback(async () => {
    setLoadingCookies(true);
    const res = await serverApi.getC411UploadCookies();
    if (res.success && res.data) {
      setCookiesSaved(res.data.has_session && res.data.has_csrf);
      setHasPasskeySaved(Boolean(res.data.has_passkey));
      if (res.data.announce_url) {
        setAnnounceUrl(res.data.announce_url);
      }
      if (res.data.has_session && res.data.has_csrf) {
        setC411SessionCookie(SAVED_MASK);
        setC411CsrfCookie(SAVED_MASK);
        setRawCookie(SAVED_MASK);
      }
      if (res.data.has_passkey) {
        setPasskey(SAVED_MASK);
      }
      if (res.data.upload_assistant_path != null) {
        setUploadAssistantPath(res.data.upload_assistant_path || '');
      }
      if (res.data.upload_assistant_enabled != null) {
        setUploadAssistantEnabled(Boolean(res.data.upload_assistant_enabled));
      }
    }
    setLoadingCookies(false);
  }, []);

  useEffect(() => {
    loadMedia();
    loadCookiesStatus();
  }, [loadCookiesStatus]);

  // Faire défiler jusqu'au message d'erreur pour qu'il soit visible
  useEffect(() => {
    if (message?.type === 'error' && messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [message]);

  const loadMedia = async () => {
    setLoadingMedia(true);
    setMessage(null);
    const res = await serverApi.getLibraryMedia();
    if (res.success && res.data) {
      setMediaList(res.data);
      if (res.data.length > 0 && !selectedMediaId) {
        setSelectedMediaId(res.data[0].id);
      }
    }
    setLoadingMedia(false);
  };

  const handleSaveCookies = async () => {
    const isFilled = (s: string) => s.trim() !== '' && s.trim() !== SAVED_MASK;
    const hasRaw = isFilled(rawCookie);
    const hasFields = isFilled(c411SessionCookie) && isFilled(c411CsrfCookie);
    const hasPasskeyVal = isFilled(passkey);
    const hasUaPath = uploadAssistantPath.trim() !== '';
    if (!hasRaw && !hasFields && !hasPasskeyVal && !hasUaPath && uploadAssistantEnabled === false) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.cookiesOrPasskeyRequired') });
      return;
    }
    setSavingCookies(true);
    setMessage(null);
    const res = await serverApi.putC411UploadCookies({
      ...(hasRaw ? { raw_cookie: rawCookie.trim() } : {}),
      ...(hasFields ? { session_cookie: c411SessionCookie.trim(), csrf_cookie: c411CsrfCookie.trim() } : {}),
      ...(hasPasskeyVal ? { passkey: passkey.trim() } : {}),
      upload_assistant_path: uploadAssistantPath.trim(),
      upload_assistant_enabled: uploadAssistantEnabled,
    });
    setSavingCookies(false);
    if (res.success) {
      setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.cookiesSaved') });
      setRawCookie(hasRaw || hasFields ? SAVED_MASK : '');
      setC411SessionCookie(hasFields ? SAVED_MASK : '');
      setC411CsrfCookie(hasFields ? SAVED_MASK : '');
      setPasskey(hasPasskeyVal ? SAVED_MASK : '');
      await loadCookiesStatus();
      onC411Configured?.();
    } else {
      setMessage({ type: 'error', text: res.message ?? res.error ?? t('common.error') });
    }
  };

  const handleCreateTorrent = async () => {
    const canCreate = Boolean(announceUrl.trim()) || hasPasskeySaved;
    if (!selectedMediaId.trim() || !canCreate) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.fieldsRequired') });
      return;
    }
    setCreatingTorrent(true);
    setMessage(null);
    setProgressMessage(t('settings.uploadTrackerPanel.creatingTorrentProgress'));
    const mediaTitle = mediaList.find((m) => m.id === selectedMediaId)?.tmdb_title || selectedMediaId;
    console.log('[C411] Création .torrent et publication C411:', { local_media_id: selectedMediaId, media: mediaTitle });
    try {
      const res = await serverApi.createTorrentForLibraryMedia({
        local_media_id: selectedMediaId,
        announce_url: announceUrl.trim() || '',
        publish_to_c411: publishToC411,
      });
      if (res.success) {
        console.log('[C411] .torrent créé avec succès');
        const c411 = (res as { c411Result?: { success: boolean; message: string; torrentUrl?: string } }).c411Result;
        let msg = t('settings.uploadTrackerPanel.successCreate');
        if (c411) {
          if (c411.success) {
            msg = c411.torrentUrl
              ? t('settings.uploadTrackerPanel.successCreateAndC411', { url: c411.torrentUrl })
              : `${msg} ${t('settings.uploadTrackerPanel.sentToC411')} ${c411.message}`;
          } else {
            msg = `${msg} ${t('settings.uploadTrackerPanel.c411UploadFailed')}: ${c411.message}`;
          }
        } else {
          msg = `${msg} ${t('settings.uploadTrackerPanel.notSentToC411')}`;
        }
        setMessage({ type: 'success', text: msg });
      } else {
        console.warn('[C411] Échec création .torrent:', res.message ?? res.error);
        setMessage({ type: 'error', text: res.message ?? t('common.error') });
      }
    } catch (err) {
      console.error('[C411] Erreur création .torrent:', err);
      setMessage({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setCreatingTorrent(false);
      setProgressMessage(null);
    }
  };

  const handlePublishAll = async () => {
    const hasUrl = Boolean(announceUrl.trim()) || hasPasskeySaved;
    const useUa = uploadAssistantEnabled && uploadAssistantPath.trim() !== '';
    if (!hasUrl && !useUa) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.fieldsRequired') });
      return;
    }
    if (!useUa && !cookiesSaved) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.cookiesRequired') });
      return;
    }
    setBatchRunning(true);
    setBatchItems([]);
    setBatchSummary(null);
    setMessage(null);

    const items = new Map<string, BatchItem>();

    const res = await serverApi.publishC411Batch(
      { announce_url: announceUrl.trim() || '' },
      (event: C411BatchEvent) => {
        if (event.type === 'batch_start') {
          setBatchItems([]);
          items.clear();
        } else if (event.type === 'item_start') {
          const it: BatchItem = {
            media_id: event.media_id,
            media_title: event.media_title,
            index: event.index,
            total: event.total,
            status: 'pending',
          };
          items.set(event.media_id, it);
          setBatchItems(Array.from(items.values()).sort((a, b) => a.index - b.index));
        } else if (event.type === 'item_progress') {
          const it = items.get(event.media_id);
          if (it) {
            it.status = event.stage === 'torrent' ? 'torrent' : 'upload';
            setBatchItems(Array.from(items.values()).sort((a, b) => a.index - b.index));
          }
        } else if (event.type === 'item_done') {
          const it = items.get(event.media_id);
          if (it) {
            it.status = event.success ? 'success' : 'error';
            it.message = event.message;
            setBatchItems(Array.from(items.values()).sort((a, b) => a.index - b.index));
          }
        } else if (event.type === 'batch_end') {
          setBatchSummary({ success: event.success_count, error: event.error_count });
        }
      }
    );

    setBatchRunning(false);
    if (!res.success) {
      setMessage({ type: 'error', text: res.message ?? t('settings.uploadTrackerPanel.errorPublish') });
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-base-content/80">
        {t('settings.uploadTrackerPanel.description')}
      </p>

      {/* Prérequis C411 (seed obligatoire, etc.) */}
      <div className="rounded-lg bg-info/10 border border-info/30 p-3 text-sm text-base-content/80">
        <p className="font-medium text-info mb-1">{t('settings.uploadTrackerPanel.c411PrereqsTitle')}</p>
        <p>{t('settings.uploadTrackerPanel.c411PrereqsBody')}</p>
      </div>

      {/* Nommage C411 */}
      <div className="rounded-lg bg-base-200/80 border border-base-300 p-3 text-sm text-base-content/80">
        <p className="font-medium text-base-content mb-1">{t('settings.uploadTrackerPanel.c411NamingTitle')}</p>
        <p>{t('settings.uploadTrackerPanel.c411NamingBody')}</p>
      </div>

      {/* Description & NFO C411 */}
      <div className="rounded-lg bg-base-200/80 border border-base-300 p-3 text-sm text-base-content/80">
        <p className="font-medium text-base-content mb-1">{t('settings.uploadTrackerPanel.c411DescriptionNfoTitle')}</p>
        <p>{t('settings.uploadTrackerPanel.c411DescriptionNfoBody')}</p>
      </div>

      {/* Cookies C411 — format libre + sauvegarde en base */}
      <DsCardSection title={t('settings.uploadTrackerPanel.c411Cookies')}>
        {loadingCookies ? (
          <p className="text-sm text-base-content/70">{t('common.loading')}</p>
        ) : cookiesSaved || hasPasskeySaved ? (
          <p className="text-sm text-success flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            {cookiesSaved && hasPasskeySaved
              ? t('settings.uploadTrackerPanel.cookiesAndPasskeySaved')
              : cookiesSaved
                ? t('settings.uploadTrackerPanel.cookiesSaved')
                : t('settings.uploadTrackerPanel.passkeySaved')}
          </p>
        ) : null}
        {(cookiesSaved || hasPasskeySaved) && (
          <p className="text-xs text-base-content/60 mt-1">
            {t('settings.uploadTrackerPanel.fieldsClearedHint')}
          </p>
        )}
        <p className="text-xs text-base-content/60 mt-1 mb-2">
          {t('settings.uploadTrackerPanel.cookieFormatHint')}
        </p>
        <form
          className="space-y-2 max-w-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            handleSaveCookies();
          }}
        >
          <textarea
            className="textarea textarea-bordered w-full font-mono text-sm min-h-[80px]"
            placeholder={t('settings.uploadTrackerPanel.rawCookiePlaceholder')}
            value={rawCookie}
            onInput={(e) => setRawCookie((e.target as HTMLTextAreaElement).value)}
            onFocus={(e) => { if (rawCookie === SAVED_MASK) setRawCookie(''); }}
          />
          <div className="text-sm text-base-content/60">{t('settings.uploadTrackerPanel.orSeparator')}</div>
          <input
            type="password"
            autoComplete="off"
            className="input input-bordered w-full font-mono text-sm"
            placeholder={t('settings.uploadTrackerPanel.c411SessionPlaceholder')}
            value={c411SessionCookie}
            onInput={(e) => setC411SessionCookie((e.target as HTMLInputElement).value)}
            onFocus={(e) => { if (c411SessionCookie === SAVED_MASK) setC411SessionCookie(''); }}
          />
          <input
            type="password"
            autoComplete="off"
            className="input input-bordered w-full font-mono text-sm"
            placeholder={t('settings.uploadTrackerPanel.c411CsrfPlaceholder')}
            value={c411CsrfCookie}
            onInput={(e) => setC411CsrfCookie((e.target as HTMLInputElement).value)}
            onFocus={(e) => { if (c411CsrfCookie === SAVED_MASK) setC411CsrfCookie(''); }}
          />
          <div className="text-sm text-base-content/60 pt-1">{t('settings.uploadTrackerPanel.passkeyLabel')}</div>
          <input
            type="text"
            className="input input-bordered w-full max-w-md font-mono text-sm"
            placeholder={t('settings.uploadTrackerPanel.passkeyPlaceholder')}
            value={passkey}
            onInput={(e) => setPasskey((e.target as HTMLInputElement).value)}
            onFocus={(e) => { if (passkey === SAVED_MASK) setPasskey(''); }}
          />
          <p className="text-xs text-base-content/60">{t('settings.uploadTrackerPanel.passkeyHint')}</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingCookies || (rawCookie.trim() === '' || rawCookie.trim() === SAVED_MASK) && (c411SessionCookie.trim() === '' || c411SessionCookie.trim() === SAVED_MASK || c411CsrfCookie.trim() === '' || c411CsrfCookie.trim() === SAVED_MASK) && (passkey.trim() === '' || passkey.trim() === SAVED_MASK) && (uploadAssistantPath.trim() === '' && !uploadAssistantEnabled)}
            onClick={handleSaveCookies}
          >
            {savingCookies ? t('common.loading') : t('settings.uploadTrackerPanel.saveCookies')}
          </button>
        </form>
      </DsCardSection>

      <DsCardSection title={t('settings.uploadTrackerPanel.uploadAssistantTitle')}>
        <p className="text-sm text-base-content/70 mb-2">
          {t('settings.uploadTrackerPanel.uploadAssistantTitle')}
        </p>
        <label className="flex items-center gap-2 mb-2 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={uploadAssistantEnabled}
            onChange={(e) => setUploadAssistantEnabled((e.target as HTMLInputElement).checked)}
          />
          <span className="text-sm text-base-content/90">
            {t('settings.uploadTrackerPanel.uploadAssistantEnabledLabel')}
          </span>
        </label>
        <input
          type="text"
          className="input input-bordered w-full max-w-2xl font-mono text-sm"
          placeholder={t('settings.uploadTrackerPanel.uploadAssistantPathPlaceholder')}
          value={uploadAssistantPath}
          onInput={(e) => setUploadAssistantPath((e.target as HTMLInputElement).value)}
        />
        <p className="text-xs text-base-content/60 mt-1">{t('settings.uploadTrackerPanel.uploadAssistantPathHint')}</p>
      </DsCardSection>

      <DsCardSection title={t('settings.uploadTrackerPanel.announceUrl')}>
        {hasPasskeySaved && (
          <p className="text-xs text-base-content/60 mb-2">{t('settings.uploadTrackerPanel.announceUrlFilledByPasskey')}</p>
        )}
        <input
          type="url"
          className="input input-bordered w-full max-w-md font-mono text-sm"
          placeholder="https://c411.org/announce/VOTRE_PASSKEY"
          value={announceUrl}
          onInput={(e) => setAnnounceUrl((e.target as HTMLInputElement).value)}
        />
        {(announceUrl.trim() || hasPasskeySaved) && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-base-content/60">{t('settings.uploadTrackerPanel.trackerUrlHint')}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs gap-1"
              disabled={!announceUrl.trim() || announceUrl === 'https://c411.org/announce/'}
              onClick={async () => {
                const url = announceUrl.trim();
                if (url) {
                  try {
                    await navigator.clipboard.writeText(url);
                    setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.trackerUrlCopied') });
                    setTimeout(() => setMessage(null), 2000);
                  } catch {
                    setMessage({ type: 'error', text: t('common.error') });
                  }
                }
              }}
              title={t('settings.uploadTrackerPanel.copyTrackerUrl')}
            >
              <Copy className="w-3.5 h-3.5" />
              {t('settings.uploadTrackerPanel.copyTrackerUrl')}
            </button>
          </div>
        )}
      </DsCardSection>

      {/* Un média : créer .torrent ou publier */}
      <DsCardSection title={t('settings.uploadTrackerPanel.singleMedia')}>
        {loadingMedia ? (
          <p className="text-sm text-base-content/70">{t('common.loading')}</p>
        ) : mediaList.length === 0 ? (
          <p className="text-sm text-base-content/70">{t('settings.uploadTrackerPanel.noMedia')}</p>
        ) : (
          <select
            className="select select-bordered w-full max-w-md"
            value={selectedMediaId}
            onChange={(e) => setSelectedMediaId((e.target as HTMLSelectElement).value)}
          >
            {mediaList.map((m) => (
              <option key={m.id} value={m.id}>
                {m.tmdb_title || m.file_name} ({m.file_name})
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 mt-2 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm checkbox-primary"
            checked={publishToC411}
            onChange={(e) => setPublishToC411((e.target as HTMLInputElement).checked)}
          />
          <span className="text-sm text-base-content/90">
            {t('settings.uploadTrackerPanel.publishToC411Label')}
          </span>
        </label>
        <div className="flex flex-wrap gap-2 mt-2">
          {progressMessage && (
            <p className="text-sm text-primary/90 w-full flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {progressMessage}
            </p>
          )}
          {progressMessage && (
            <p className="text-xs text-base-content/60 w-full mt-0">
              {t('settings.uploadTrackerPanel.creatingTorrentProgressStepsHint')}
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={creatingTorrent || !selectedMediaId || (!announceUrl.trim() && !hasPasskeySaved) || loadingMedia}
            onClick={handleCreateTorrent}
          >
            {creatingTorrent ? t('common.loading') : t('settings.uploadTrackerPanel.createTorrentAndPublish')}
          </button>
        </div>
      </DsCardSection>

      {/* Traiter tous les médias : créer .torrent + publier, ignorer les déjà créés */}
      <DsCardSection title={t('settings.uploadTrackerPanel.processAllTitle')}>
        <p className="text-sm text-base-content/70 mb-2">
          {t('settings.uploadTrackerPanel.processAllDescription')}
        </p>
        <button
          type="button"
          className="btn btn-accent"
          disabled={batchRunning || (!announceUrl.trim() && !hasPasskeySaved) || (!cookiesSaved && !(uploadAssistantEnabled && uploadAssistantPath.trim())) || loadingMedia || mediaList.length === 0}
          onClick={handlePublishAll}
        >
          {batchRunning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              {t('settings.uploadTrackerPanel.publishingAll')}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 shrink-0" />
              {t('settings.uploadTrackerPanel.processAll')}
            </>
          )}
        </button>

        {batchSummary !== null && !batchRunning && (
          <p className="text-sm mt-2 text-base-content/80">
            {t('settings.uploadTrackerPanel.batchSummary', { success: batchSummary.success, error: batchSummary.error })}
          </p>
        )}

        {batchItems.length > 0 && (
          <ul className="mt-4 space-y-1 max-h-[320px] overflow-y-auto">
            {batchItems.map((item) => (
              <li
                key={item.media_id}
                className="flex items-center gap-2 py-1.5 px-2 rounded bg-base-200/60 animate-in fade-in duration-200"
              >
                {item.status === 'pending' && (
                  <span className="w-5 h-5 rounded-full bg-base-300 animate-pulse" aria-hidden />
                )}
                {item.status === 'torrent' && (
                  <Loader2 className="w-5 h-5 shrink-0 text-primary animate-spin" aria-hidden />
                )}
                {item.status === 'upload' && (
                  <Loader2 className="w-5 h-5 shrink-0 text-secondary animate-spin" aria-hidden />
                )}
                {item.status === 'success' && (
                  <Check className="w-5 h-5 shrink-0 text-success" aria-hidden />
                )}
                {item.status === 'error' && (
                  <XCircle className="w-5 h-5 shrink-0 text-error" aria-hidden />
                )}
                <span className="flex-1 truncate text-sm" title={item.media_title}>
                  {item.media_title}
                </span>
                {item.message && item.status === 'error' && (
                  <span className="text-xs text-error truncate max-w-[200px]" title={item.message}>
                    {item.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DsCardSection>

      {message && (
        <div
          ref={messageRef}
          className={`text-sm p-3 rounded ${message.type === 'success' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}
          role="alert"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
