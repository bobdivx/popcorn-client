import { useEffect, useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { aiReady } from '../../lib/ai/prefs';
import { useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { getLibraryDisplayConfig } from '../../lib/utils/library-display-config';
import type { MediaDetailPageProps } from '../torrents/MediaDetailPage/types';
import { mediaLanguageLabel, variantMediaLanguage } from '../torrents/MediaDetailPage/utils/mediaLanguage';
import { AiAssist, type AiFact } from './AiAssist';

interface ReleaseHintProps {
  variants: MediaDetailPageProps['torrent'][];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}

function normalizeResolution(raw?: string | null): string {
  if (!raw) return '';
  const up = raw.toUpperCase();
  if (up.includes('2160') || up === '4K' || up === 'UHD') return '4K';
  if (up.includes('1080')) return '1080p';
  if (up.includes('720')) return '720p';
  if (up.includes('480')) return '480p';
  if (up.includes('REMUX')) return 'Remux';
  return raw;
}

function buildFacts(
  variant: MediaDetailPageProps['torrent'] | undefined,
  t: (k: string, p?: Record<string, string | number>) => string,
): AiFact[] {
  if (!variant) return [];
  const facts: AiFact[] = [];
  const resolution = normalizeResolution(variant.quality?.resolution || variant.format || null);
  if (resolution) {
    facts.push({ label: t('ai.factQuality'), value: resolution });
  }
  const lang = variantMediaLanguage(variant) || variant.language || variant.quality?.language;
  if (lang) {
    facts.push({ label: t('ai.factLanguage'), value: mediaLanguageLabel(lang) });
  }
  const codec = variant.codec || variant.quality?.codec;
  if (codec) {
    facts.push({ label: t('ai.factCodec'), value: String(codec).toUpperCase() });
  }
  const seeds = typeof variant.seedCount === 'number' ? variant.seedCount : 0;
  if (seeds > 0) {
    facts.push({
      label: t('ai.factSources'),
      value: t('ai.factSourcesValue', { count: seeds }),
    });
  }
  return facts;
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

  const pickedVariant = useMemo(
    () => (pickedId ? variants.find((v) => v.id === pickedId) : undefined),
    [pickedId, variants],
  );
  const facts = useMemo(() => buildFacts(pickedVariant, t), [pickedVariant, t]);

  if (!summary && facts.length === 0) return null;

  const different = Boolean(pickedId && selectedId && pickedId !== selectedId);
  const explainSummary =
    facts.length > 0
      ? t('ai.releaseExplain')
      : summary;
  const confirmSummary =
    facts.length > 0
      ? t('ai.releaseConfirm')
      : summary;

  if (!different) {
    return (
      <AiAssist
        mode="explain"
        title={t('ai.releaseTitle')}
        summary={explainSummary}
        facts={facts}
      />
    );
  }

  return (
    <AiAssist
      mode="confirm"
      title={t('ai.releaseTitle')}
      summary={confirmSummary}
      facts={facts}
      primaryLabel={t('ai.useThis')}
      dismissLabel={t('ai.keepCurrent')}
      onPrimary={() => {
        if (pickedId) onSelect(pickedId);
      }}
      onDismiss={() => setPickedId(selectedId || null)}
    />
  );
}
