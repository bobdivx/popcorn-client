import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { aiReady } from '../../lib/ai/prefs';
import { useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../lib/utils/library-display-config';
import type { MediaDetailPageProps } from '../torrents/MediaDetailPage/types';
import { AiAssist } from './AiAssist';

interface ReleaseHintProps {
  variants: MediaDetailPageProps['torrent'][];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

export function ReleaseHint({ variants, selectedId, onSelect }: ReleaseHintProps) {
  const { t, language } = useI18n();
  const enabled = useAiEnabled();
  const [summary, setSummary] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || variants.length === 0) {
      setSummary('');
      setPickedId(null);
      return;
    }
    let cancelled = false;
    const display = getLibraryDisplayConfig();
    aiReady().then(async (ready) => {
      if (!ready || cancelled) return;
      const res = await serverApi.aiRelease({
        locale: language === 'en' ? 'en' : 'fr',
        preferred_quality: display.preferredQuality || undefined,
        languages: display.mediaLanguages,
        variants: variants.slice(0, 12).map((variant) => ({
          id: variant.id,
          name: variant.name,
          resolution: variant.quality?.resolution || variant.format || null,
          language: variant.language || variant.quality?.language || null,
          codec: variant.codec || variant.quality?.codec || null,
          source: variant.quality?.source || null,
          seed_count: variant.seedCount || 0,
        })),
      });
      if (cancelled || !res.success || !res.data?.summary) return;
      setSummary(res.data.summary);
      setPickedId(res.data.id || null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, language, selectedId, variants]);

  if (!summary) return null;
  const different = pickedId && selectedId && pickedId !== selectedId;
  if (!different) {
    return <AiAssist mode="explain" summary={summary} />;
  }
  return (
    <AiAssist
      mode="confirm"
      summary={summary}
      primaryLabel={t('ai.useThis')}
      onPrimary={() => {
        if (pickedId) onSelect(pickedId);
      }}
      onDismiss={() => setPickedId(selectedId || null)}
    />
  );
}
