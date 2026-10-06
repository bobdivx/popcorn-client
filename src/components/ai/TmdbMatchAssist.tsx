import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { clientApi } from '../../lib/client/api';
import { aiReady, useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import type { AiTmdbChoice } from '../../lib/client/server-api/ai';
import { AiAssist } from './AiAssist';

interface TmdbMatchAssistProps {
  infoHash?: string | null;
  title: string;
  confidence?: string | null;
  currentTmdbId?: number | null;
  mediaType?: string | null;
}

export function TmdbMatchAssist({
  infoHash,
  title,
  confidence,
  currentTmdbId,
  mediaType,
}: TmdbMatchAssistProps) {
  const { t, language } = useI18n();
  const enabled = useAiEnabled();
  const [summary, setSummary] = useState('');
  const [choices, setChoices] = useState<AiTmdbChoice[]>([]);
  const [posters, setPosters] = useState<Record<number, string>>({});
  const [hidden, setHidden] = useState(false);
  const [saved, setSaved] = useState(false);

  const level = (confidence || '').toLowerCase();
  const doubtful = level === 'low' || level === 'medium';

  useEffect(() => {
    if (!enabled || !doubtful || !infoHash || title.trim().length < 2) {
      setSummary('');
      setChoices([]);
      return;
    }
    let cancelled = false;
    aiReady().then(async (ready) => {
      if (!ready || cancelled) return;
      const lang = language === 'en' ? 'en-US' : 'fr-FR';
      const found = await serverApi.searchTmdb({
        q: title,
        type: mediaType === 'tv' ? 'tv' : mediaType === 'movie' ? 'movie' : 'all',
        language: lang,
        page: 1,
      });
      if (cancelled || !found.success || !found.data) return;
      const candidates = found.data.slice(0, 6).map((item) => ({
        id: item.tmdbId,
        type: item.type,
        title: item.title,
        year: item.year ? String(item.year) : null,
      }));
      const posterMap: Record<number, string> = {};
      for (const item of found.data) {
        if (item.poster) posterMap[item.tmdbId] = item.poster;
      }
      const ranked = await serverApi.aiTmdbMatch({
        locale: language === 'en' ? 'en' : 'fr',
        query: title,
        current_tmdb_id: currentTmdbId ?? null,
        candidates,
      });
      if (cancelled || !ranked.success || !ranked.data?.choices?.length) return;
      setPosters(posterMap);
      setChoices(ranked.data.choices);
      setSummary(ranked.data.summary);
    });
    return () => {
      cancelled = true;
    };
  }, [confidence, currentTmdbId, doubtful, enabled, infoHash, language, mediaType, title]);

  if (hidden || saved || !summary || choices.length === 0) return null;

  const apply = async (id: string) => {
    const choice = choices.find((item) => String(item.id) === id);
    if (!choice || !infoHash) return;
    const kind = choice.type === 'tv' ? 'tv' : 'movie';
    try {
      await clientApi.setDownloadTmdbOverride(infoHash, choice.id, kind);
      setSaved(true);
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      setSummary(t('ai.requestEmpty'));
    }
  };

  return (
    <AiAssist
      mode="pick"
      summary={summary}
      choices={choices.map((choice) => ({
        id: String(choice.id),
        label: choice.title,
        detail: choice.year || undefined,
        imageUrl: posters[choice.id] || null,
      }))}
      onChoose={(id) => void apply(id)}
      dismissLabel={t('ai.keep')}
      onDismiss={() => setHidden(true)}
    />
  );
}
