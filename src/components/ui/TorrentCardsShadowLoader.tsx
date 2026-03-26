interface TorrentCardsShadowLoaderProps {
  className?: string;
  count?: number;
  rows?: number;
  showHero?: boolean;
}

export default function TorrentCardsShadowLoader({
  className = '',
  count = 6,
  rows = 3,
  showHero = false,
}: TorrentCardsShadowLoaderProps) {
  return (
    <div className={`w-full ${className}`}>
      {showHero ? (
        <section className="mb-8 sm:mb-10 md:mb-12 tv:mb-16 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16" aria-hidden>
          <div className="relative h-[42vh] sm:h-[48vh] md:h-[52vh] tv:h-[58vh] rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03]">
            <div className="absolute inset-0">
              <div className="skeleton skeleton-wave h-full w-full rounded-2xl" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            </div>
            <div className="absolute left-6 bottom-8 w-52 sm:w-64 md:w-72 h-8 rounded">
              <div className="skeleton skeleton-wave h-full w-full rounded" />
            </div>
          </div>
        </section>
      ) : null}

      {Array.from({ length: rows }).map((_, rowIdx) => (
        <section key={rowIdx} className="mb-8 sm:mb-10 md:mb-12 tv:mb-16" aria-hidden>
          <div className="mb-2 sm:mb-3 tv:mb-4 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
            <div className="h-7 sm:h-8 md:h-9 tv:h-10 w-48 sm:w-56 md:w-64 rounded bg-white/[0.08]" />
          </div>
          <div className="flex gap-1 sm:gap-1.5 md:gap-2 lg:gap-4 xl:gap-6 tv:gap-8 overflow-hidden px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 py-3 tv:py-4">
            {Array.from({ length: count }).map((_, idx) => (
              <div
                key={`${rowIdx}-${idx}`}
                className="shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] py-1 tv:py-2"
              >
                <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-[0_16px_30px_rgba(0,0,0,0.45),0_0_18px_rgba(168,85,247,0.08)]">
                  <div className="absolute inset-0">
                    <div className="skeleton skeleton-wave h-full w-full rounded-xl" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
                  </div>
                </div>
                <div className="mt-3 h-4 w-3/4 rounded">
                  <div className="skeleton skeleton-wave h-full w-full rounded" />
                </div>
                <div className="mt-2 h-3 w-1/3 rounded">
                  <div className="skeleton skeleton-wave h-full w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

