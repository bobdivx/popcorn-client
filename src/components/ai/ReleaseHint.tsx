import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
  /**
   * `card` (défaut) : affiche le bloc « Version selon vos préférences ».
   * `none` : applique silencieusement la version préférée sans UI (fiche épurée).
   */
  ui?: 'card' | 'none';
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

type ReleaseCacheEntry = { summary: string; id: string | null };
const releaseCache = new Map<string, ReleaseCacheEntry>();

/**
 * Applique silencieusement la meilleure version selon les préférences utilisateur.
 * Pas de confirmation : l’utilisateur change de qualité/langue via les sélecteurs si besoin.
 * UI optionnelle (`ui="card"`) pour la modal Info — la fiche détail reste épurée.
 */
export function ReleaseHint({ variants, selectedId, onSelect, ui = 'card' }: ReleaseHintProps) {
  const { t, language } = useI18n();
  const enabled = useAiEnabled();
  const [summary, setSummary] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const appliedForVariantsRef = useRef<string>('');
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const variantsKey = useMemo(
    () => variants.map((v) => v.id).join('|'),
    [variants],
  );
  const cacheKey = `${language}|${variantsKey}`;

  useEffect(() => {
    if (!enabled || variants.length === 0) {
      setSummary('');
      setPickedId(null);
      return;
    }
    const cached = releaseCache.get(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setPickedId(cached.id);
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
      const entry: ReleaseCacheEntry = {
        summary: res.data.summary,
        id: res.data.id || null,
      };
      releaseCache.set(cacheKey, entry);
      setSummary(entry.summary);
      setPickedId(entry.id);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, enabled, language, variants]);

  // Auto-appliquer la version recommandée une fois par jeu de variantes (sans demander).
  useEffect(() => {
    if (!pickedId || variants.length === 0) return;
    const applyKey = `${variantsKey}::${pickedId}`;
    if (appliedForVariantsRef.current === applyKey) return;
    if (selectedId === pickedId) {
      appliedForVariantsRef.current = applyKey;
      return;
    }
    const exists = variants.some((v) => v.id === pickedId);
    if (!exists) return;
    appliedForVariantsRef.current = applyKey;
    onSelectRef.current(pickedId);
  }, [pickedId, selectedId, variants, variantsKey]);

  const activeVariant = useMemo(() => {
    const id = selectedId || pickedId;
    return id ? variants.find((v) => v.id === id) : undefined;
  }, [selectedId, pickedId, variants]);

  const facts = useMemo(() => buildFacts(activeVariant, t), [activeVariant, t]);

  if (ui === 'none') return null;
  if (!summary && facts.length === 0) return null;

  return (
    <AiAssist
      mode="explain"
      title={t('ai.releaseTitle')}
      summary={facts.length > 0 ? t('ai.releaseExplain') : summary}
      facts={facts}
    />
  );
}
