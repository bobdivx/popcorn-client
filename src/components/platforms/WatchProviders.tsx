import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import {
  loadTitleWatchProviders,
  platformHref,
  providerLogoUrl,
  type TitleWatchProviders,
} from '../../lib/platforms';
import type { WatchProviderOffer } from '../../lib/client/server-api/platforms';
import { isRouteBlockedInStoreBuild } from '../../lib/distribution';

interface WatchProvidersProps {
  tmdbId?: number | null;
  mediaType?: string | null;
  className?: string;
}

function dedupe(offers: WatchProviderOffer[], exclude: Set<number>): WatchProviderOffer[] {
  const out: WatchProviderOffer[] = [];
  for (const o of offers) {
    if (exclude.has(o.provider_id)) continue;
    exclude.add(o.provider_id);
    out.push(o);
  }
  return out;
}

/**
 * « Où regarder » (France) : abonnements en premier (logos cliquables → page plateforme),
 * location / achat en plus petit. Données JustWatch via TMDB (attribution obligatoire).
 */
export default function WatchProviders({ tmdbId, mediaType, className = '' }: WatchProvidersProps) {
  const { language } = useI18n();
  const en = language === 'en';
  const [data, setData] = useState<TitleWatchProviders | null>(null);

  const type = mediaType === 'tv' ? 'tv' : mediaType === 'movie' ? 'movie' : null;
  const id = typeof tmdbId === 'number' && Number.isFinite(tmdbId) && tmdbId > 0 ? tmdbId : null;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!type || !id) return undefined;
    loadTitleWatchProviders(type, id)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  if (!data) return null;

  const seen = new Set<number>();
  const subscription = dedupe([...(data.flatrate || []), ...(data.free || []), ...(data.ads || [])], seen);
  const rentBuy = dedupe([...(data.rent || []), ...(data.buy || [])], seen).slice(0, 8);
  if (subscription.length === 0 && rentBuy.length === 0) return null;

  return (
    <section
      className={`ed-watch-providers mt-5 sm:mt-6 max-w-3xl ${className}`}
      aria-label={en ? 'Where to watch' : 'Où regarder'}
      data-watch-providers
    >
      {subscription.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <p className="ed-kicker text-[11px] sm:text-xs tv:text-base uppercase tracking-[0.22em] text-white/60">
            {en ? 'Streaming in France' : 'En streaming en France'}
          </p>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 tv:gap-4">
            {subscription.map((o) => {
              const logo = providerLogoUrl(o.logo_path, 'w92');
              const inner = logo ? (
                <img
                  src={logo}
                  alt={o.provider_name}
                  loading="lazy"
                  className="w-10 h-10 sm:w-11 sm:h-11 tv:w-14 tv:h-14 rounded-xl object-cover"
                />
              ) : (
                <span className="px-3 text-xs text-white/80">{o.provider_name}</span>
              );
              const base =
                'inline-flex items-center justify-center rounded-xl border border-white/15 bg-black/30 p-0.5 transition-all duration-200';
              // Page plateforme absente en mode bibliothèque seule : logo non cliquable.
              return o.platform_slug && !isRouteBlockedInStoreBuild('/plateformes') ? (
                <a
                  key={o.provider_id}
                  href={platformHref(o.platform_slug)}
                  title={o.provider_name}
                  aria-label={o.provider_name}
                  className={`${base} hover:border-[var(--ed-accent,#f2545b)] focus:outline-none focus-visible:border-[var(--ed-accent,#f2545b)] focus-visible:ring-2 focus-visible:ring-[var(--ed-accent,#f2545b)]/60 ds-focus-glow`}
                  tabIndex={0}
                  data-focusable
                >
                  {inner}
                </a>
              ) : (
                <span key={o.provider_id} title={o.provider_name} className={base}>
                  {inner}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {rentBuy.length > 0 ? (
        <div className={`flex flex-wrap items-center gap-2 ${subscription.length > 0 ? 'mt-3' : ''}`}>
          <span className="text-[11px] sm:text-xs tv:text-sm text-white/45 mr-1">
            {en ? 'Rent or buy' : 'Location / achat'}
          </span>
          {rentBuy.map((o) => {
            const logo = providerLogoUrl(o.logo_path, 'w45');
            return logo ? (
              <img
                key={o.provider_id}
                src={logo}
                alt={o.provider_name}
                title={o.provider_name}
                loading="lazy"
                className="w-6 h-6 sm:w-7 sm:h-7 tv:w-9 tv:h-9 rounded-md object-cover opacity-80"
              />
            ) : null;
          })}
        </div>
      ) : null}

      <p className="mt-2.5 text-[10px] sm:text-[11px] tv:text-sm text-white/35 tracking-wide">
        <a
          href="https://www.justwatch.com/fr"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white/60 underline-offset-2 hover:underline"
          tabIndex={-1}
        >
          {en ? 'Data: JustWatch' : 'Données JustWatch'}
        </a>
      </p>
    </section>
  );
}
