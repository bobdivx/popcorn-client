import { useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { aiReady, useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';
import { AiAssist } from './AiAssist';

interface FoundTitle {
  tmdbId: number;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  year?: string;
}

export function RequestAssist({ onCreated }: { onCreated?: () => void }) {
  const { t, language } = useI18n();
  const enabled = useAiEnabled();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'movie' | 'tv' | ''>('');
  const [french, setFrench] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState('');
  const [season, setSeason] = useState<number | null>(null);
  const [found, setFound] = useState<FoundTitle | null>(null);
  const [note, setNote] = useState('');

  if (!enabled) return null;

  const understand = async () => {
    const phrase = text.trim();
    if (phrase.length < 2) return;
    setBusy(true);
    setNote('');
    setFound(null);
    setSummary('');
    const ready = await aiReady();
    if (!ready) {
      setBusy(false);
      setNote(t('ai.statusUnreachable'));
      return;
    }
    const locale = language === 'en' ? 'en' : 'fr';
    const parsed = await serverApi.aiParseRequest({
      locale,
      text: phrase,
      media_type: kind || undefined,
      language: french ? 'fr' : undefined,
    });
    if (!parsed.success || !parsed.data?.title_query) {
      setBusy(false);
      setNote(t('ai.requestEmpty'));
      return;
    }
    const search = await serverApi.searchTmdb({
      q: parsed.data.title_query,
      type: parsed.data.media_type === 'tv' ? 'tv' : 'movie',
      language: language === 'en' ? 'en-US' : 'fr-FR',
      page: 1,
    });
    const first = search.success ? search.data?.[0] : undefined;
    setBusy(false);
    if (!first?.tmdbId) {
      setNote(t('ai.requestEmpty'));
      return;
    }
    setSeason(parsed.data.season ?? null);
    setSummary(parsed.data.summary);
    setFound({
      tmdbId: first.tmdbId,
      title: first.title,
      type: first.type === 'tv' ? 'tv' : 'movie',
      poster: first.poster,
      year: first.year ? String(first.year) : undefined,
    });
  };

  const confirm = async () => {
    if (!found) return;
    setBusy(true);
    const posterPath = found.poster?.includes('/t/p/')
      ? found.poster.slice(found.poster.indexOf('/t/p/') + 5).replace(/^[^/]+/, '')
      : undefined;
    const res = await serverApi.createMediaRequest({
      tmdb_id: found.tmdbId,
      media_type: found.type,
      season_numbers: season ? [season] : undefined,
      title: found.title,
      poster_path: posterPath,
    });
    setBusy(false);
    if (!res.success) {
      setNote(res.message || res.error || t('ai.requestEmpty'));
      return;
    }
    setFound(null);
    setSummary('');
    setText('');
    setNote(t('ai.requestSent'));
    onCreated?.();
  };

  const chip = (active: boolean) =>
    `min-h-[44px] tv:min-h-[56px] px-4 tv:px-6 rounded-full border text-sm tv:text-lg focus:outline-none focus:ring-4 focus:ring-violet-500/70 ${
      active ? 'bg-white text-black border-white' : 'bg-white/10 text-white border-white/15'
    }`;

  return (
    <div className="mb-4 space-y-3">
      <p className="text-sm tv:text-xl text-white/80">{t('ai.requestTitle')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-focusable tabIndex={0} className={chip(kind === 'movie')} onClick={() => setKind(kind === 'movie' ? '' : 'movie')}>
          {t('ai.searchMovie')}
        </button>
        <button type="button" data-focusable tabIndex={0} className={chip(kind === 'tv')} onClick={() => setKind(kind === 'tv' ? '' : 'tv')}>
          {t('ai.searchSeries')}
        </button>
        <button type="button" data-focusable tabIndex={0} className={chip(french)} onClick={() => setFrench((value) => !value)}>
          {t('ai.searchFrench')}
        </button>
      </div>
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void understand();
        }}
      >
        <input
          value={text}
          data-focusable
          tabIndex={0}
          placeholder={t('ai.requestPlaceholder')}
          onInput={(event) => setText((event.target as HTMLInputElement).value)}
          className="flex-1 min-h-[44px] tv:min-h-[56px] rounded-full border border-white/15 bg-white/5 px-5 tv:px-7 text-base tv:text-xl text-white placeholder:text-white/40 outline-none focus:border-violet-400"
        />
        <button type="submit" data-focusable tabIndex={0} className="min-h-[44px] tv:min-h-[56px] px-5 rounded-full bg-white text-black font-semibold text-sm tv:text-lg">
          {t('ai.requestUnderstand')}
        </button>
      </form>
      {note ? <p className="text-sm tv:text-lg text-white/70">{note}</p> : null}
      {found && summary ? (
        <AiAssist
          mode="confirm"
          busy={busy}
          summary={summary}
          choices={[{
            id: String(found.tmdbId),
            label: found.title,
            detail: found.year,
            imageUrl: found.poster,
          }]}
          primaryLabel={t('ai.confirm')}
          onPrimary={() => void confirm()}
          onDismiss={() => {
            setFound(null);
            setSummary('');
          }}
        />
      ) : null}
    </div>
  );
}
