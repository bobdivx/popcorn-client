import { useState, useEffect, useRef } from 'preact/hooks';

interface QualityBadgesProps {
  quality?: {
    resolution?: string | null;
    source?: string | null;
    codec?: string | null;
    audio?: string | null;
    language?: string | null;
    full?: string | null;
  };
  align?: 'left' | 'right';
}

// Style unifié — même glass transparent que gtv-pill-btn
const badge = "inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 glass-panel backdrop-blur-sm text-white/90 text-xs tv:text-sm font-semibold rounded-full border border-white/15";

export function QualityBadges({ quality, align = 'left' }: QualityBadgesProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), 5000);
    return () => {
      clearTimeout(timer);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [quality]);

  useEffect(() => {
    if (quality) setIsVisible(true);
  }, [quality]);

  const handleMouseEnter = () => {
    setIsVisible(true);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      hoverTimeoutRef.current = null;
    }, 2000);
  };

  if (!quality) return null;

  const badges: any[] = [];

  // Résolution
  if (quality.resolution) {
    const res = quality.resolution.toUpperCase();
    if (res === '4K' || res === '2160P' || res === 'UHD' || res.includes('2160')) {
      badges.push(
        <div key="4k" className={badge}>
          <svg className="w-4 h-4 tv:w-5 tv:h-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="font-black tracking-tight">4K UHD</span>
        </div>
      );
    } else if (res === '1080P' || res.includes('1080')) {
      badges.push(
        <div key="1080p" className={badge}>
          <svg className="w-3.5 h-3.5 tv:w-4 tv:h-4 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="16" height="12" rx="1.5"/>
            <path d="M6 8h8M6 12h8"/>
          </svg>
          <span>1080p</span>
        </div>
      );
    } else if (res === '720P' || res.includes('720')) {
      badges.push(
        <div key="720p" className={badge}>
          <span>720p</span>
        </div>
      );
    } else {
      badges.push(
        <div key="resolution" className={badge}>
          <span>{quality.resolution}</span>
        </div>
      );
    }
  }

  // Audio
  if (quality.audio) {
    const audio = quality.audio.toUpperCase();
    if (audio.includes('DOLBY') || audio.includes('ATMOS') || audio === 'DD+' || audio === 'DDP' || audio === 'DDP5' || audio === 'DDP7' || audio === 'AC3') {
      const isAtmos = audio.includes('ATMOS');
      badges.push(
        <div key="dolby" className={badge}>
          <svg className="w-6 h-4 tv:w-7 tv:h-5 shrink-0" viewBox="0 0 28 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2h3.5c2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5H3v2H2V2zm1 7h2.5c1.5 0 2.5-1 2.5-2.5S7 5 5.5 5H3v4z"/>
            <path d="M19 2h3.5c2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5H20v2h-1V2zm1 7h2.5c1.5 0 2.5-1 2.5-2.5S24 5 22.5 5H20v4z"/>
          </svg>
          <span className="font-semibold">{isAtmos ? 'ATMOS' : 'DIGITAL'}</span>
        </div>
      );
    } else if (audio === 'DTS' || audio.includes('DTS')) {
      badges.push(
        <div key="dts" className={badge}>
          <span className="font-black tracking-tighter">DTS</span>
        </div>
      );
    } else if (audio) {
      badges.push(
        <div key="audio" className={badge}>
          <span>{audio}</span>
        </div>
      );
    }
  }

  // Codec vidéo
  if (quality.codec) {
    const codec = quality.codec.toUpperCase();
    if (codec === 'X265' || codec === 'H265' || codec === 'HEVC') {
      badges.push(
        <div key="hevc" className={badge}>
          <span>H.265</span>
        </div>
      );
    } else if (codec === 'AV1') {
      badges.push(
        <div key="av1" className={badge}>
          <span>AV1</span>
        </div>
      );
    } else if (codec === 'X264' || codec === 'H264') {
      badges.push(
        <div key="h264" className={badge}>
          <span>H.264</span>
        </div>
      );
    } else {
      badges.push(
        <div key="codec" className={badge}>
          <span>{codec}</span>
        </div>
      );
    }
  }

  // Source (BluRay, WEB-DL…)
  if (quality.source) {
    badges.push(
      <div key="source" className={badge}>
        <span>{quality.source.toUpperCase().replace('-', ' ')}</span>
      </div>
    );
  }

  // HDR
  if (quality.full && (quality.full.toUpperCase().includes('HDR') || quality.full.toUpperCase().includes('DOLBY VISION'))) {
    badges.push(
      <div key="hdr" className={badge}>
        <span className="font-black tracking-tight">HDR</span>
      </div>
    );
  }

  if (badges.length === 0) return null;

  return (
    <div
      className={`flex items-center gap-2 flex-wrap ${align === 'right' ? 'justify-end' : ''} transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      style={{ pointerEvents: isVisible ? 'auto' : 'none' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {badges}
    </div>
  );
}
