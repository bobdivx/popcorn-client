import { useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';

function parseLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export default function QuotaAdminPanel() {
  const { t } = useI18n();
  const [userId, setUserId] = useState('');
  const [movieLimit, setMovieLimit] = useState('');
  const [movieDays, setMovieDays] = useState('');
  const [tvLimit, setTvLimit] = useState('');
  const [tvDays, setTvDays] = useState('');
  const [usedLabel, setUsedLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const id = userId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await serverApi.getQuotaStats(id);
      if (!res.success || !res.data) {
        setError(res.message || t('quotas.error'));
        return;
      }
      setMovieLimit(res.data.movie.limit == null ? '' : String(res.data.movie.limit));
      setMovieDays(res.data.movie.days == null ? '' : String(res.data.movie.days));
      setTvLimit(res.data.tv.limit == null ? '' : String(res.data.tv.limit));
      setTvDays(res.data.tv.days == null ? '' : String(res.data.tv.days));
      setUsedLabel(
        t('quotas.used')
          .replace('{movies}', String(res.data.movie.used))
          .replace('{series}', String(res.data.tv.used))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('quotas.error'));
    } finally {
      setLoading(false);
    }
  };

  const save = async (e: Event) => {
    e.preventDefault();
    const id = userId.trim();
    if (!id) {
      setError(t('quotas.userRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await serverApi.updateUserQuota(id, {
        movie_quota_limit: parseLimit(movieLimit),
        movie_quota_days: parseLimit(movieDays),
        tv_quota_limit: parseLimit(tvLimit),
        tv_quota_days: parseLimit(tvDays),
      });
      if (!res.success) {
        setError(res.message || t('quotas.error'));
        return;
      }
      setSaved(true);
      if (res.data) {
        setUsedLabel(
          t('quotas.used')
            .replace('{movies}', String(res.data.movie.used))
            .replace('{series}', String(res.data.tv.used))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('quotas.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form class="space-y-4 max-w-xl" onSubmit={save}>
      <p class="text-sm text-gray-400">{t('quotas.hint')}</p>
      <label class="block">
        <span class="text-sm text-gray-300">{t('quotas.userId')}</span>
        <div class="flex gap-2 mt-1">
          <input
            class="input input-bordered w-full"
            value={userId}
            onInput={(e) => setUserId((e.target as HTMLInputElement).value)}
            placeholder={t('quotas.userIdPlaceholder')}
          />
          <button type="button" class="btn btn-ghost" disabled={loading || !userId.trim()} onClick={load}>
            {t('quotas.load')}
          </button>
        </div>
      </label>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-sm text-gray-300">{t('quotas.movieLimit')}</span>
          <input
            class="input input-bordered w-full mt-1"
            inputMode="numeric"
            value={movieLimit}
            onInput={(e) => setMovieLimit((e.target as HTMLInputElement).value)}
            placeholder={t('quotas.unlimited')}
          />
        </label>
        <label class="block">
          <span class="text-sm text-gray-300">{t('quotas.movieDays')}</span>
          <input
            class="input input-bordered w-full mt-1"
            inputMode="numeric"
            value={movieDays}
            onInput={(e) => setMovieDays((e.target as HTMLInputElement).value)}
            placeholder={t('quotas.unlimited')}
          />
        </label>
        <label class="block">
          <span class="text-sm text-gray-300">{t('quotas.tvLimit')}</span>
          <input
            class="input input-bordered w-full mt-1"
            inputMode="numeric"
            value={tvLimit}
            onInput={(e) => setTvLimit((e.target as HTMLInputElement).value)}
            placeholder={t('quotas.unlimited')}
          />
        </label>
        <label class="block">
          <span class="text-sm text-gray-300">{t('quotas.tvDays')}</span>
          <input
            class="input input-bordered w-full mt-1"
            inputMode="numeric"
            value={tvDays}
            onInput={(e) => setTvDays((e.target as HTMLInputElement).value)}
            placeholder={t('quotas.unlimited')}
          />
        </label>
      </div>
      {usedLabel && <p class="text-sm text-gray-400">{usedLabel}</p>}
      {error && <p class="text-sm text-error">{error}</p>}
      {saved && <p class="text-sm text-success">{t('quotas.saved')}</p>}
      <button type="submit" class="btn btn-primary" disabled={loading}>
        {loading ? t('quotas.saving') : t('quotas.save')}
      </button>
    </form>
  );
}
