import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { FocusableCard } from '../ui/FocusableCard';
import { PageHeader } from '../page-model/PageHeader';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { loadPlatforms, platformHref, providerLogoUrl, type StreamingPlatform } from '../../lib/platforms';

/** Page « Plateformes » : grille des principaux services de streaming disponibles en France. */
export default function PlatformsGrid() {
  const { language } = useI18n();
  const en = language === 'en';
  const [platforms, setPlatforms] = useState<StreamingPlatform[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadPlatforms(language)
      .then((list) => {
        if (cancelled) return;
        if (list && list.length > 0) setPlatforms(list);
        else {
          setPlatforms([]);
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPlatforms([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return (
    <div className="min-h-screen bg-black text-white relative" data-page="plateformes">
      <PageHeader
        title={en ? 'Platforms' : 'Plateformes'}
        subtitle={
          en
            ? 'Streaming services available in France — pick one to browse its catalogue and exclusives.'
            : 'Les services de streaming disponibles en France — choisissez-en un pour parcourir son catalogue et ses exclusivités.'
        }
      />

      {platforms === null ? (
        <div className="pt-2">
          <TorrentCardsShadowLoader rows={1} />
        </div>
      ) : failed ? (
        <section className="mx-4 sm:mx-6 lg:mx-16 tv:mx-24 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
          <p className="text-lg font-semibold text-white">
            {en ? 'Platforms are unavailable right now.' : 'Les plateformes sont indisponibles pour le moment.'}
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-white/60">
            {en
              ? 'Check that a TMDB key is configured on the server and that you are signed in.'
              : 'Vérifiez qu’une clé TMDB est configurée sur le serveur et que vous êtes connecté.'}
          </p>
        </section>
      ) : (
        <div
          className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 tv:grid-cols-5 gap-3 sm:gap-4 lg:gap-6 tv:gap-8 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pb-10"
          data-platforms-grid
        >
          {platforms.map((p, index) => {
            const logo = providerLogoUrl(p.logo_path, 'w300');
            return (
              <div key={p.slug} data-tv-initial-focus={index === 0 ? true : undefined}>
                <FocusableCard
                  href={platformHref(p.slug)}
                  ariaLabel={p.name}
                  className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 tv:p-6 transition-all duration-200 hover:border-[var(--ed-accent,#f2545b)]/70 hover:bg-white/[0.06] focus:outline-none focus-visible:border-[var(--ed-accent,#f2545b)] focus-visible:ring-2 focus-visible:ring-[var(--ed-accent,#f2545b)]/60"
                >
                  <div className="flex flex-col items-center gap-3 tv:gap-4">
                    <div className="aspect-square w-full max-w-[9rem] tv:max-w-[11rem] overflow-hidden rounded-2xl bg-black/40 shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]">
                      {logo ? (
                        <img src={logo} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-white/80">
                          {p.name}
                        </span>
                      )}
                    </div>
                    <span className="text-sm sm:text-base tv:text-xl font-medium tracking-[0.06em] text-white/85 group-hover:text-white text-center">
                      {p.name}
                    </span>
                  </div>
                </FocusableCard>
              </div>
            );
          })}
        </div>
      )}

      <p className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pb-10 text-[11px] tv:text-sm text-white/35 tracking-wide">
        <a href="https://www.justwatch.com/fr" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 hover:underline" tabIndex={-1}>
          {en ? 'Availability data: JustWatch' : 'Données de disponibilité : JustWatch'}
        </a>
      </p>
    </div>
  );
}
