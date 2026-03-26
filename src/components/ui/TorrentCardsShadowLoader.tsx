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
        <section className="mb-8 sm:mb-10 md:mb-12 tv:mb-16 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 opacity-0 animate-[fade-in-up_0.6s_ease-out_forwards]" aria-hidden>
          <div className="relative h-[42vh] sm:h-[48vh] md:h-[52vh] tv:h-[58vh] rounded-2xl overflow-hidden border border-white/10 bg-[#141414]">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute left-6 bottom-8 w-52 sm:w-64 md:w-72 h-8 rounded bg-white/5 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
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
                className="shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px] py-1 tv:py-2 opacity-0 animate-[fade-in-up_0.5s_ease-out_forwards]"
                style={{ animationDelay: `${(rowIdx * 100) + (idx * 50)}ms` }}
              >
                <div className="relative aspect-[2/3] lg:aspect-video xl:aspect-[16/9] rounded-xl border border-white/10 bg-[#141414] overflow-hidden shadow-lg">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
                </div>
                <div className="mt-3 h-4 w-3/4 rounded bg-white/5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
                </div>
                <div className="mt-2 h-3 w-1/3 rounded bg-white/5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite_linear] w-[200%] -translate-x-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

