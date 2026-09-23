import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { aiReady, useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { AiAssist } from './AiAssist';

interface UploadAiHintProps {
  fileName?: string | null;
  title?: string | null;
}

export function UploadAiHint({ fileName, title }: UploadAiHintProps) {
  const { language } = useI18n();
  const enabled = useAiEnabled();
  const [summary, setSummary] = useState('');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!enabled || (!fileName && !title)) {
      setSummary('');
      setDetail('');
      return;
    }
    let cancelled = false;
    aiReady().then(async (ready) => {
      if (!ready || cancelled) return;
      const res = await serverApi.aiUpload({
        locale: language === 'en' ? 'en' : 'fr',
        file_name: fileName || undefined,
        title: title || undefined,
      });
      if (cancelled || !res.success || !res.data) return;
      const parts = [res.data.quality, res.data.language, res.data.category].filter(Boolean);
      setSummary(res.data.summary);
      setDetail([parts.join(' · '), res.data.description].filter(Boolean).join(' — '));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, fileName, language, title]);

  if (!summary) return null;
  return <AiAssist mode="explain" summary={detail ? `${summary} ${detail}` : summary} />;
}
