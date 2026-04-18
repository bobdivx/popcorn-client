import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { ArrowLeft, Check, CircleX, Settings2, Trash2 } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';

const TRACKERS = ['C411', 'TORR9', 'GF', 'G3MINI', 'PTP', 'BLU'] as const;
const SAVED_MASK = '********';
const TRACKER_SELECTION_STORAGE_KEY = 'upload.assistant.selectedTrackers.v1';
const TRACKER_REMOVED_STORAGE_KEY = 'upload.assistant.removedTrackers.v1';

function readStoredTrackerList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string => typeof v === 'string' && TRACKERS.includes(v as (typeof TRACKERS)[number])
    );
  } catch {
    return [];
  }
}

function writeStoredTrackerList(key: string, value: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(new Set(value))));
  } catch {
    // Ignore localStorage errors.
  }
}

function mapIndexerNameToTracker(name: string): (typeof TRACKERS)[number] | null {
  const normalized = name.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes('C411')) return 'C411';
  if (normalized.includes('TORR9')) return 'TORR9';
  if (normalized.includes('G3MINI')) return 'G3MINI';
  if (normalized.includes('PTP')) return 'PTP';
  if (normalized.includes('BLU')) return 'BLU';
  if (normalized === 'GF' || normalized.includes(' GF')) return 'GF';
  return null;
}

export default function UploadTrackersManagerPanel() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [configuredTrackers, setConfiguredTrackers] = useState<string[]>([]);
  const [defaultEnabledTrackers, setDefaultEnabledTrackers] = useState<string[]>([]);
  const [removedTrackers, setRemovedTrackers] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [passkey, setPasskey] = useState('');
  const [announceUrl, setAnnounceUrl] = useState('');
  const [hasApiKeySaved, setHasApiKeySaved] = useState(false);
  const [hasPasskeySaved, setHasPasskeySaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const [indexersRes, c411Res] = await Promise.all([
      serverApi.getIndexers(),
      serverApi.getC411UploadCookies(),
    ]);

    const configured = new Set<string>();
    if (indexersRes.success && Array.isArray(indexersRes.data)) {
      for (const idx of indexersRes.data) {
        if (!idx?.isEnabled || !idx.name) continue;
        const mapped = mapIndexerNameToTracker(idx.name);
        if (mapped) configured.add(mapped);
      }
    }

    if (c411Res.success && c411Res.data) {
      if (c411Res.data.has_api_key) {
        setHasApiKeySaved(true);
        setApiKey(SAVED_MASK);
      } else {
        setHasApiKeySaved(false);
        setApiKey('');
      }
      if (c411Res.data.has_passkey) {
        setHasPasskeySaved(true);
        setPasskey(SAVED_MASK);
      } else {
        setHasPasskeySaved(false);
        setPasskey('');
      }
      setAnnounceUrl((c411Res.data.announce_url || '').trim());
      if (
        c411Res.data.has_api_key ||
        c411Res.data.has_passkey ||
        Boolean((c411Res.data.announce_url || '').trim())
      ) {
        configured.add('C411');
      }
    }

    const removed = readStoredTrackerList(TRACKER_REMOVED_STORAGE_KEY);
    const defaults = readStoredTrackerList(TRACKER_SELECTION_STORAGE_KEY);
    setConfiguredTrackers(Array.from(configured));
    setRemovedTrackers(removed);
    setDefaultEnabledTrackers(defaults.filter((tracker) => configured.has(tracker) && !removed.includes(tracker)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trackerRows = useMemo(
    () =>
      TRACKERS.map((tracker) => {
        const configured = configuredTrackers.includes(tracker);
        const removed = removedTrackers.includes(tracker);
        const enabledByDefault = defaultEnabledTrackers.includes(tracker) && !removed;
        return { tracker, configured, removed, enabledByDefault };
      }),
    [configuredTrackers, removedTrackers, defaultEnabledTrackers]
  );

  const setDefaultState = (tracker: string, enabled: boolean) => {
    setDefaultEnabledTrackers((prev) => {
      const next = enabled ? Array.from(new Set([...prev, tracker])) : prev.filter((t) => t !== tracker);
      writeStoredTrackerList(TRACKER_SELECTION_STORAGE_KEY, next);
      return next;
    });
  };

  const removeFromWizard = (tracker: string) => {
    setRemovedTrackers((prev) => {
      const next = Array.from(new Set([...prev, tracker]));
      writeStoredTrackerList(TRACKER_REMOVED_STORAGE_KEY, next);
      return next;
    });
    setDefaultState(tracker, false);
  };

  const restoreInWizard = (tracker: string) => {
    setRemovedTrackers((prev) => {
      const next = prev.filter((t) => t !== tracker);
      writeStoredTrackerList(TRACKER_REMOVED_STORAGE_KEY, next);
      return next;
    });
  };

  const saveC411 = async () => {
    const hasApiKey = apiKey.trim() && apiKey.trim() !== SAVED_MASK;
    const hasPasskey = passkey.trim() && passkey.trim() !== SAVED_MASK;
    const hasAnnounce = announceUrl.trim();
    if (!hasApiKey && !hasPasskey && !hasAnnounce && !hasApiKeySaved && !hasPasskeySaved) {
      setMessage({ type: 'error', text: t('settings.uploadTrackerPanel.cookiesOrPasskeyRequired') });
      return;
    }
    setSaving(true);
    setMessage(null);
    const res = await serverApi.putC411UploadCookies({
      ...(hasApiKey ? { api_key: apiKey.trim() } : {}),
      ...(hasPasskey ? { passkey: passkey.trim() } : {}),
      ...(hasAnnounce ? { announce_url: announceUrl.trim() } : {}),
    });
    setSaving(false);
    if (res.success) {
      setMessage({ type: 'success', text: t('settings.uploadTrackerPanel.cookiesSaved') });
      await load();
      return;
    }
    setMessage({ type: 'error', text: res.message ?? res.error ?? t('common.error') });
  };

  return (
    <div className="space-y-6">
      <a
        href="/settings/uploads/"
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t('common.back')}</span>
      </a>

      <div class="sc-frame">
        <div class="sc-frame-header">
          <div class="sc-frame-title">{t('settings.uploadTrackerPanel.manageTrackersTitle')}</div>
        </div>
        <div class="sc-frame-body">
          <p className="text-sm text-base-content/70 mb-4">
            {t('settings.uploadTrackerPanel.manageTrackersDescription')}
          </p>

          <div className="space-y-2">
            {trackerRows.map((row) => (
              <div
                key={row.tracker}
                className="rounded-lg border border-base-300 bg-base-200/40 p-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{row.tracker}</span>
                  {row.configured ? (
                    <span className="badge badge-success badge-sm gap-1">
                      <Check className="w-3 h-3" />
                      {t('settings.uploadTrackerPanel.trackerConfigured')}
                    </span>
                  ) : (
                    <span className="badge badge-ghost badge-sm gap-1">
                      <CircleX className="w-3 h-3" />
                      {t('settings.uploadTrackerPanel.trackerNotConfigured')}
                    </span>
                  )}
                  {row.removed && (
                    <span className="badge badge-warning badge-sm">
                      {t('settings.uploadTrackerPanel.trackerRemovedFromWizard')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.configured && !row.removed && (
                    <button
                      type="button"
                      className={`btn btn-xs ${row.enabledByDefault ? 'btn-success' : 'btn-ghost'}`}
                      onClick={() => setDefaultState(row.tracker, !row.enabledByDefault)}
                    >
                      {row.enabledByDefault
                        ? t('settings.uploadTrackerPanel.disableByDefault')
                        : t('settings.uploadTrackerPanel.enableByDefault')}
                    </button>
                  )}
                  {row.configured && !row.removed && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs gap-1"
                      onClick={() => removeFromWizard(row.tracker)}
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('settings.uploadTrackerPanel.removeFromWizard')}
                    </button>
                  )}
                  {row.removed && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => restoreInWizard(row.tracker)}
                    >
                      {t('settings.uploadTrackerPanel.restoreTracker')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div class="sc-frame">
        <div class="sc-frame-header">
          <div class="sc-frame-title">C411</div>
        </div>
        <div class="sc-frame-body">
          <p className="text-sm text-base-content/70 mb-3">
            {t('settings.uploadTrackerPanel.manageC411Hint')}
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-base-content/60 block mb-1">
                {t('settings.uploadTrackerPanel.wizardC411ApiKeyLabel')}
              </label>
              <input
                type="password"
                className="input input-bordered input-sm w-full max-w-xl font-mono"
                value={apiKey}
                placeholder={t('settings.uploadTrackerPanel.wizardC411ApiKeyPlaceholder')}
                onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
                onFocus={() => apiKey === SAVED_MASK && setApiKey('')}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60 block mb-1">
                {t('settings.uploadTrackerPanel.wizardC411PasskeyLabel')}
              </label>
              <input
                type="password"
                className="input input-bordered input-sm w-full max-w-xl font-mono"
                value={passkey}
                placeholder={t('settings.uploadTrackerPanel.passkeyPlaceholder')}
                onInput={(e) => setPasskey((e.target as HTMLInputElement).value)}
                onFocus={() => passkey === SAVED_MASK && setPasskey('')}
              />
            </div>
            <div>
              <label className="text-xs text-base-content/60 block mb-1">
                {t('settings.uploadTrackerPanel.announceUrl')}
              </label>
              <input
                type="url"
                className="input input-bordered input-sm w-full max-w-xl font-mono"
                value={announceUrl}
                placeholder="https://c411.org/announce/VOTRE_PASSKEY"
                onInput={(e) => setAnnounceUrl((e.target as HTMLInputElement).value)}
              />
            </div>
            <button type="button" className="btn btn-primary btn-sm gap-2" disabled={saving || loading} onClick={() => void saveC411()}>
              <Settings2 className="w-4 h-4" />
              {saving ? t('common.loading') : t('settings.uploadTrackerPanel.saveCookies')}
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-base-content/70">{t('common.loading')}</p>}
      {message && (
        <div
          className={`text-sm p-3 rounded ${
            message.type === 'success' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
