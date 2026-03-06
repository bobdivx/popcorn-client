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

/**
 * Composant pour afficher les badges de qualité avec logos officiels
 * Les badges sont masqués automatiquement après 5 secondes
 */
export function QualityBadges({ quality, align = 'left' }: QualityBadgesProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hoverTimeoutRef = useRef<number | null>(null);
  
  useEffect(() => {
    // Masquer les badges après 5 secondes
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, 5000); // 5 secondes
    
    return () => {
      clearTimeout(timer);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [quality]); // Réinitialiser le timer si la qualité change
  
  // Réafficher les badges si la qualité change
  useEffect(() => {
    if (quality) {
      setIsVisible(true);
    }
  }, [quality]);
  
  const handleMouseEnter = () => {
    // Réafficher immédiatement au survol
    setIsVisible(true);
    // Annuler le timer de masquage s'il existe
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };
  
  const handleMouseLeave = () => {
    // Masquer après 2 secondes quand on quitte le survol
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      hoverTimeoutRef.current = null;
    }, 2000);
  };
  
  if (!quality) return null;

  const badges: any[] = [];

  // Badge 4K / 2160P / UHD
  if (quality.resolution) {
    const res = quality.resolution.toUpperCase();
    if (res === '4K' || res === '2160P' || res === 'UHD' || res.includes('2160')) {
      badges.push(
        <div key="4k" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-gradient-to-r from-primary-600 to-primary-700 text-white text-xs tv:text-base font-bold rounded-md backdrop-blur-sm shadow-primary border border-primary-500/50 glass-panel">
          {/* Logo 4K stylisé */}
          <svg className="w-5 h-5 tv:w-6 tv:h-6" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="4" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
            <path d="M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span className="font-black tracking-tight">4K UHD</span>
        </div>
      );
    } else if (res === '1080P' || res.includes('1080')) {
      badges.push(
        <div key="1080p" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <svg className="w-4 h-4 tv:w-5 tv:h-5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="16" height="12" rx="1.5"/>
            <path d="M6 8h8M6 12h8"/>
          </svg>
          <span className="font-bold">1080p</span>
        </div>
      );
    } else if (res === '720P' || res.includes('720')) {
      badges.push(
        <div key="720p" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>720p</span>
        </div>
      );
    } else {
      badges.push(
        <div key="resolution" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>{quality.resolution}</span>
        </div>
      );
    }
  }

  // Badge Dolby Digital / Dolby Atmos avec glassmorphic
  if (quality.audio) {
    const audio = quality.audio.toUpperCase();
    if (audio.includes('DOLBY') || audio.includes('ATMOS') || audio === 'DD+' || audio === 'DDP' || audio === 'DDP5' || audio === 'DDP7' || audio === 'AC3') {
      const isAtmos = audio.includes('ATMOS');
      badges.push(
        <div key="dolby" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          {/* Logo Dolby simplifié avec les deux D stylisés - version plus fidèle */}
          <svg className="w-7 h-5" viewBox="0 0 28 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            {/* D gauche - forme plus arrondie */}
            <path d="M2 2h3.5c2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5H3v2H2V2zm1 7h2.5c1.5 0 2.5-1 2.5-2.5S7 5 5.5 5H3v4z"/>
            {/* D droite - forme plus arrondie */}
            <path d="M19 2h3.5c2.5 0 4.5 2 4.5 4.5 0 2.5-2 4.5-4.5 4.5H20v2h-1V2zm1 7h2.5c1.5 0 2.5-1 2.5-2.5S24 5 22.5 5H20v4z"/>
          </svg>
          <span className="ml-0.5 font-semibold">{isAtmos ? 'ATMOS' : 'DIGITAL'}</span>
        </div>
      );
    } else if (audio === 'DTS' || audio.includes('DTS')) {
      badges.push(
        <div key="dts" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span className="font-black tracking-tighter" style={{ fontFamily: 'Arial Black, sans-serif', letterSpacing: '-0.5px' }}>DTS</span>
        </div>
      );
    } else if (audio) {
      badges.push(
        <div key="audio" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>{audio}</span>
        </div>
      );
    }
  }

  // Badge Codec vidéo (H.265 / HEVC / H.264) avec glassmorphic
  if (quality.codec) {
    const codec = quality.codec.toUpperCase();
    if (codec === 'X265' || codec === 'H265' || codec === 'HEVC') {
      badges.push(
        <div key="hevc" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>H.265</span>
        </div>
      );
    } else if (codec === 'AV1') {
      badges.push(
        <div key="av1" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs tv:text-base font-bold rounded-md shadow-primary-lg border border-primary-400/50 glass-panel">
          <span>AV1</span>
        </div>
      );
    } else if (codec === 'X264' || codec === 'H264') {
      badges.push(
        <div key="h264" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>H.264</span>
        </div>
      );
    } else {
      badges.push(
        <div key="codec" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
          <span>{codec}</span>
        </div>
      );
    }
  }

  // Badge Source (BluRay, WEB-DL, etc.) avec glassmorphic
  if (quality.source) {
    const source = quality.source.toUpperCase();
    badges.push(
      <div key="source" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-glass glass-panel text-white text-xs tv:text-base font-bold rounded-md shadow-primary border border-white/20">
        <span>{source.replace('-', ' ')}</span>
      </div>
    );
  }

  // Badge HDR avec effet glow Neon Violet
  if (quality.full && (quality.full.toUpperCase().includes('HDR') || quality.full.toUpperCase().includes('DOLBY'))) {
    badges.push(
      <div key="hdr" className="inline-flex items-center gap-1.5 px-3 py-1.5 tv:px-4 tv:py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs tv:text-base font-bold rounded-md backdrop-blur-sm shadow-primary-lg border border-primary-400/50 glass-panel">
        <span className="font-black tracking-tight">HDR</span>
      </div>
    );
  }

  if (badges.length === 0) return null;

  return (
    <div 
      className={`flex items-center gap-2 flex-wrap ${align === 'right' ? 'justify-end' : ''} transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {badges}
    </div>
  );
}
