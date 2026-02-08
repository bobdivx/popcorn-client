import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { sendAdEvent } from '../../../../lib/api/popcorn-web';
import type { AdsConfig } from '../../../../lib/api/popcorn-web';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface PrerollPlayerProps {
  config: AdsConfig;
  onEnded: () => void;
  onSkip?: () => void;
}

let imaSdkPromise: Promise<void> | null = null;

function loadImaSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no-window'));
  if ((window as any).google?.ima) return Promise.resolve();
  if (imaSdkPromise) return imaSdkPromise;
  imaSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('ima-load-failed'));
    document.head.appendChild(script);
  });
  return imaSdkPromise;
}

export default function PrerollPlayer({ config, onEnded, onSkip }: PrerollPlayerProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adsLoaderRef = useRef<any>(null);
  const adsManagerRef = useRef<any>(null);
  const adsRequestRef = useRef<any>(null);
  const eventSentRef = useRef<{ impression: boolean; skip: boolean; complete: boolean }>({
    impression: false,
    skip: false,
    complete: false,
  });
  const [canSkip, setCanSkip] = useState(config.skipDelaySeconds <= 0);
  const [remaining, setRemaining] = useState(config.skipDelaySeconds);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [adError, setAdError] = useState(false);
  const [videoStalled, setVideoStalled] = useState(false);
  const hasPlayedRef = useRef(false);

  const showSkip = config.showSkip;
  const showCountdown = config.showCountdown && !canSkip;
  const adId = config.adId ?? null;
  // Sur WebOS/TV : forcer muted pour que l'autoplay fonctionne (sinon écran noir)
  const effectiveMuted = isTVPlatform() ? true : (config.muted ?? false);

  const clickUrl = useMemo(() => {
    const url = config.clickUrl;
    if (!url) return null;
    try {
      return new URL(url);
    } catch {
      return null;
    }
  }, [config.clickUrl]);

  useEffect(() => {
    if (adId && !eventSentRef.current.impression) {
      eventSentRef.current.impression = true;
      sendAdEvent(adId, 'impression');
    }
    if (!showSkip) return;
    if (config.skipDelaySeconds <= 0) {
      setCanSkip(true);
      setRemaining(0);
      return;
    }
    setCanSkip(false);
    setRemaining(config.skipDelaySeconds);
    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0) setCanSkip(true);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [config.skipDelaySeconds, showSkip]);

  useEffect(() => {
    const max = config.maxDurationSeconds;
    if (!max || max <= 0) return;
    const timeout = window.setTimeout(() => handleComplete(), max * 1000);
    return () => window.clearTimeout(timeout);
  }, [config.maxDurationSeconds]);

  // Détection écran noir : si la vidéo ne démarre pas après 5s (WebOS/autoplay bloqué), proposer de passer
  useEffect(() => {
    if (config.type !== 'video' || !config.videoUrl) return;
    hasPlayedRef.current = false;
    const timer = window.setTimeout(() => {
      if (!hasPlayedRef.current) setVideoStalled(true);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [config.type, config.videoUrl]);

  useEffect(() => {
    if (config.type !== 'google' || !config.googleAdTagUrl) return;
    let cancelled = false;

    const startAds = async () => {
      try {
        await loadImaSdk();
        if (cancelled) return;
        const googleIma = (window as any).google?.ima;
        if (!googleIma) throw new Error('ima-missing');
        const adContainer = adContainerRef.current;
        const video = videoRef.current;
        if (!adContainer || !video) throw new Error('ima-missing-elements');

        // WebOS/TV : le container peut avoir 0 dimensions au premier rendu, utiliser la fenêtre
        const w = adContainer.offsetWidth || window.innerWidth || 1920;
        const h = adContainer.offsetHeight || window.innerHeight || 1080;

        const displayContainer = new googleIma.AdDisplayContainer(adContainer, video);
        const adsLoader = new googleIma.AdsLoader(displayContainer);
        adsLoaderRef.current = adsLoader;

        const onAdError = (e: any) => {
          console.warn('[Preroll] IMA error', e);
          setAdError(true);
          try {
            adsManagerRef.current?.destroy();
          } catch {}
          onEnded();
        };

        adsLoader.addEventListener(googleIma.AdErrorEvent.Type.AD_ERROR, onAdError);
        adsLoader.addEventListener(
          googleIma.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
          (evt: any) => {
            try {
              const adsManager = evt.getAdsManager(video);
              adsManagerRef.current = adsManager;
              adsManager.addEventListener(googleIma.AdErrorEvent.Type.AD_ERROR, onAdError);
              adsManager.addEventListener(googleIma.AdEvent.Type.ALL_ADS_COMPLETED, handleComplete);
              adsManager.addEventListener(googleIma.AdEvent.Type.CONTENT_RESUME_REQUESTED, handleComplete);
              adsManager.init(
                adContainer.offsetWidth || window.innerWidth || 1920,
                adContainer.offsetHeight || window.innerHeight || 1080,
                googleIma.ViewMode.NORMAL
              );
              adsManager.start();
            } catch (e) {
              console.warn('[Preroll] IMA start failed', e);
              setAdError(true);
              onEnded();
            }
          }
        );

        const request = new googleIma.AdsRequest();
        request.adTagUrl = config.googleAdTagUrl;
        request.linearAdSlotWidth = w;
        request.linearAdSlotHeight = h;
        request.nonLinearAdSlotWidth = w;
        request.nonLinearAdSlotHeight = Math.floor(h / 3);
        adsRequestRef.current = request;

        try {
          displayContainer.initialize();
        } catch {
          setNeedsUserStart(true);
          return;
        }

        adsLoader.requestAds(request);
      } catch (e) {
        console.warn('[Preroll] IMA init failed', e);
        setAdError(true);
        onEnded();
      }
    };

    startAds();
    return () => {
      cancelled = true;
      try {
        adsManagerRef.current?.destroy();
      } catch {}
      adsManagerRef.current = null;
      adsLoaderRef.current = null;
      adsRequestRef.current = null;
    };
  }, [config.type, config.googleAdTagUrl, onEnded]);

  const handleSkip = () => {
    if (adId && !eventSentRef.current.skip) {
      eventSentRef.current.skip = true;
      sendAdEvent(adId, 'skip');
    }
    onSkip?.();
    onEnded();
  };

  const handleComplete = () => {
    if (adId && !eventSentRef.current.complete && !eventSentRef.current.skip) {
      eventSentRef.current.complete = true;
      sendAdEvent(adId, 'complete');
    }
    onEnded();
  };

  const handleClick = () => {
    if (config.type === 'google') return;
    if (clickUrl) {
      window.open(clickUrl.toString(), '_blank', 'noopener,noreferrer');
    }
  };

  const renderSkip = () => {
    if (!showSkip) return null;
    return (
      <button
        type="button"
        disabled={!canSkip}
        onClick={(e) => {
          e.stopPropagation();
          handleSkip();
        }}
        class={`pointer-events-auto px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
          canSkip ? 'bg-white text-black border-white' : 'bg-white/10 text-white/70 border-white/20'
        }`}
      >
        {t('ads.skip')}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      class="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={handleClick}
    >
      <div class="absolute top-4 left-4 text-xs uppercase tracking-widest text-white/70 bg-black/60 px-2 py-1 rounded">
        {t('ads.adLabel')}
      </div>
      <div class="absolute top-4 right-4 z-10">
        {showCountdown && (
          <div class="text-xs text-white/80 bg-black/60 px-2 py-1 rounded mr-2 inline-block">
            {t('ads.skipIn', { seconds: remaining })}
          </div>
        )}
        {renderSkip()}
      </div>

      {config.type === 'image' && config.imageUrl && (
        <img
          src={config.imageUrl}
          alt={t('ads.adLabel')}
          class="w-full h-full object-cover"
          draggable={false}
          onLoad={() => {
            if (adId && !eventSentRef.current.impression) {
              eventSentRef.current.impression = true;
              sendAdEvent(adId, 'impression');
            }
          }}
        />
      )}

      {config.type === 'video' && config.videoUrl && (
        <>
          <video
            ref={videoRef}
            src={config.videoUrl}
            class="w-full h-full min-w-full min-h-full object-cover"
            autoPlay
            playsInline
            muted={effectiveMuted}
            onEnded={handleComplete}
            onError={() => onEnded()}
            onPlaying={() => {
              hasPlayedRef.current = true;
              setVideoStalled(false);
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
          />
          {videoStalled && (
            <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4">
              <p class="text-white/90 text-sm">{t('ads.unavailable')}</p>
              <button
                type="button"
                class="px-4 py-2 rounded-lg bg-white text-black font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onEnded();
                }}
              >
                {t('ads.skip')}
              </button>
            </div>
          )}
        </>
      )}

      {config.type === 'google' && (
        <div class="relative w-full h-full min-w-full min-h-full" style={{ width: '100vw', height: '100vh' }}>
          <video ref={videoRef} class="w-full h-full object-cover" muted={effectiveMuted} playsInline />
          <div ref={adContainerRef} class="absolute inset-0 w-full h-full" style={{ width: '100%', height: '100%' }} />
          {needsUserStart && !adError && (
            <div class="absolute inset-0 flex items-center justify-center bg-black/70">
              <button
                type="button"
                class="px-4 py-2 rounded-lg bg-white text-black font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  setNeedsUserStart(false);
                  const adContainer = adContainerRef.current;
                  const googleIma = (window as any).google?.ima;
                  if (adContainer && googleIma && adsLoaderRef.current && adsRequestRef.current) {
                    const displayContainer = new googleIma.AdDisplayContainer(adContainer, videoRef.current);
                    displayContainer.initialize();
                    adsLoaderRef.current.requestAds(adsRequestRef.current);
                  } else {
                    onEnded();
                  }
                }}
              >
                {t('ads.start')}
              </button>
            </div>
          )}
          {adError && (
            <div class="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm">
              {t('ads.unavailable')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
