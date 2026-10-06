import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { aiReady, useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { AiAssist } from './AiAssist';

const PLAYER_CONFIG_KEY = 'playerConfig';

function applyPlaybackAction(action: string) {
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    const current = stored ? JSON.parse(stored) as Record<string, unknown> : {};
    if (action === 'direct') current.streamingMode = 'direct';
    if (action === 'lower_quality') current.defaultQuality = 'lowest';
    localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function DiagnoseAssist({ message }: { message?: string | null }) {
  const { t, language } = useI18n();
  const enabled = useAiEnabled();
  const [summary, setSummary] = useState('');
  const [action, setAction] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!enabled || !message) {
      setSummary('');
      return;
    }
    let cancelled = false;
    aiReady().then(async (ready) => {
      if (!ready || cancelled) return;
      const res = await serverApi.aiDiagnose({
        locale: language === 'en' ? 'en' : 'fr',
        message,
      });
      if (cancelled || !res.success || !res.data?.summary) return;
      setSummary(res.data.summary);
      setAction(res.data.action || 'retry');
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, language, message]);

  if (!summary) return null;
  const label = action === 'direct'
    ? t('ai.actionDirect')
    : action === 'lower_quality'
      ? t('ai.actionLower')
      : t('ai.actionRetry');

  return (
    <div className="w-full max-w-xl mt-2 text-left">
      <AiAssist
        mode="confirm"
        summary={done ? t('ai.diagnoseDone') : summary}
        primaryLabel={done ? undefined : label}
        onPrimary={done ? undefined : () => {
          applyPlaybackAction(action);
          setDone(true);
        }}
      />
    </div>
  );
}
