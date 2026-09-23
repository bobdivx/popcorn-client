import { useEffect, useState } from 'preact/hooks';
import { Sparkles } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { isAiEnabled, resetAiReadyCache, setAiEnabled, useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { AiAssist } from '../ai/AiAssist';

const KEY_MASK = '••••••••••••••••';
const MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'];

const FIELD =
  'w-full min-h-[44px] tv:min-h-[56px] rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 tv:px-6 text-sm tv:text-lg text-[var(--ds-text-primary)] focus:outline-none focus:ring-4 focus:ring-violet-500/70';

export default function AiSettingsPanel() {
  const { t } = useI18n();
  const enabled = useAiEnabled();
  const [status, setStatus] = useState('');
  const [picked, setPicked] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [model, setModel] = useState(MODELS[0]);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshStatus = () => {
    if (!isAiEnabled()) {
      setStatus(t('ai.statusOff'));
      return;
    }
    resetAiReadyCache();
    serverApi.aiHealth().then((res) => {
      if (!res.success || !res.data?.ok) {
        setStatus(t('ai.statusUnreachable'));
        return;
      }
      if (res.data.provider === 'gemini') {
        setStatus(t('ai.statusGemini', { model: res.data.model || MODELS[0] }));
      } else if (res.data.model_reachable) {
        setStatus(t('ai.statusOllama', { model: res.data.model || 'Ollama' }));
      } else {
        setStatus(t('ai.statusRules'));
      }
    });
  };

  useEffect(() => {
    let cancelled = false;
    serverApi.aiGetSettings().then((res) => {
      if (cancelled || !res.success || !res.data) return;
      setHasKey(res.data.has_key);
      setApiKey(res.data.has_key ? KEY_MASK : '');
      if (res.data.model && MODELS.includes(res.data.model)) setModel(res.data.model);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [enabled, t]);

  const save = async () => {
    setSaving(true);
    setNotice('');
    const typed = apiKey.trim();
    const sendingKey = typed && typed !== KEY_MASK && !typed.includes('•');
    const res = await serverApi.aiSaveSettings({
      model,
      ...(sendingKey ? { api_key: typed } : {}),
    });
    setSaving(false);
    if (!res.success || !res.data) {
      setNotice(res.message || res.error || t('ai.statusUnreachable'));
      return;
    }
    setHasKey(res.data.has_key);
    setApiKey(res.data.has_key ? KEY_MASK : '');
    setNotice(t('ai.geminiSaved'));
    refreshStatus();
  };

  const remove = async () => {
    setSaving(true);
    setNotice('');
    const res = await serverApi.aiClearSettings();
    setSaving(false);
    if (!res.success) {
      setNotice(res.message || res.error || t('ai.statusUnreachable'));
      return;
    }
    setHasKey(false);
    setApiKey('');
    setNotice(t('ai.geminiRemoved'));
    refreshStatus();
  };

  return (
    <div className="space-y-6">
      <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={enabled}
          onChange={(event) => setAiEnabled((event.target as HTMLInputElement).checked)}
        />
        <span className="font-medium text-[var(--ds-text-primary)]">{t('ai.enabled')}</span>
      </label>
      <p className="text-sm ds-text-secondary">{t('ai.enabledHelp')}</p>

      <div className="space-y-3 rounded-2xl border border-[var(--ds-border)] p-4 tv:p-6">
        <label className="block space-y-2">
          <span className="text-sm tv:text-lg font-semibold text-[var(--ds-text-primary)]">
            {t('ai.geminiKey')}
            {hasKey ? <span className="ml-2 ds-status-badge ds-status-badge--success">{t('ai.geminiKeySaved')}</span> : null}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            data-focusable
            tabIndex={0}
            className={FIELD}
            placeholder={t('ai.geminiKeyPlaceholder')}
            value={apiKey}
            onFocus={() => {
              if (apiKey === KEY_MASK) setApiKey('');
            }}
            onInput={(event) => setApiKey((event.target as HTMLInputElement).value)}
          />
        </label>
        <p className="text-sm ds-text-secondary">{t('ai.geminiKeyHelp')}</p>
        <label className="block space-y-2">
          <span className="text-sm tv:text-lg font-semibold text-[var(--ds-text-primary)]">{t('ai.geminiModel')}</span>
          <select
            data-focusable
            tabIndex={0}
            className={FIELD}
            value={model}
            onChange={(event) => setModel((event.target as HTMLSelectElement).value)}
          >
            {MODELS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-focusable
            tabIndex={0}
            disabled={saving}
            className="inline-flex items-center justify-center min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full bg-white text-black text-sm tv:text-lg font-semibold focus:outline-none focus:ring-4 focus:ring-violet-500/70 disabled:opacity-50"
            onClick={() => void save()}
          >
            {t('ai.geminiSave')}
          </button>
          {hasKey ? (
            <button
              type="button"
              data-focusable
              tabIndex={0}
              disabled={saving}
              className="inline-flex items-center justify-center min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full border border-[var(--ds-border)] text-sm tv:text-lg text-[var(--ds-text-primary)] focus:outline-none focus:ring-4 focus:ring-violet-500/70 disabled:opacity-50"
              onClick={() => void remove()}
            >
              {t('ai.geminiRemove')}
            </button>
          ) : null}
        </div>
        {notice ? <p className="text-sm ds-text-secondary">{notice}</p> : null}
      </div>

      <p className="text-sm ds-text-secondary flex items-center gap-2">
        <Sparkles size={16} />
        {status}
      </p>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--ds-text-primary)]">{t('ai.preview')}</h2>
        <AiAssist mode="explain" summary={t('ai.previewExplain')} />
        <AiAssist
          mode="pick"
          summary={t('ai.previewPick')}
          choices={[
            { id: 'a', label: 'Dune', detail: '2021' },
            { id: 'b', label: 'Dune: Part Two', detail: '2024' },
          ]}
          onChoose={setPicked}
          dismissLabel={t('ai.keep')}
          onDismiss={() => setPicked('')}
        />
        <AiAssist
          mode="confirm"
          summary={picked ? `${t('ai.previewConfirm')} — ${picked}` : t('ai.previewConfirm')}
          primaryLabel={t('ai.confirm')}
          onPrimary={() => setPicked('ok')}
          onDismiss={() => setPicked('')}
        />
      </div>
    </div>
  );
}
