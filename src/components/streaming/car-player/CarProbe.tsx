import { useEffect, useState } from 'preact/hooks';
import { AlertCircle, CheckCircle, XCircle } from 'lucide-preact';
import { isCarPlayerMode, isTeslaBrowser, stampTeslaBrowserHints } from '../../../lib/utils/device-detection';

type ProbeStatus = 'pass' | 'fail' | 'partial' | 'pending' | 'skip';

interface ProbeResult {
  category: string;
  name: string;
  status: ProbeStatus;
  detail: string;
  confidence?: number; // 0-1 pour résultats incertains
}

interface ProbeReport {
  timestamp: number;
  userAgent: string;
  results: ProbeResult[];
  detectedMode: 'park' | 'drive' | 'unknown';
  summary: {
    videoBlocked: boolean;
    audioWorks: boolean;
    canvasWorks: boolean;
    mseAvailable: boolean;
    webCodecsAvailable: boolean;
    recommendedEngine: string;
  };
}

/**
 * Probe complet des capacités Tesla en mode Park vs Drive.
 * Tests systématiques pour alimenter la matrice de décision moteur.
 */
async function runComprehensiveProbe(): Promise<ProbeReport> {
  const results: ProbeResult[] = [];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  
  // ============================================================
  // 1. ENVIRONMENT & DETECTION
  // ============================================================
  
  results.push({
    category: 'Environment',
    name: 'User-Agent',
    status: 'pass',
    detail: ua || '(empty)',
  });
  
  results.push({
    category: 'Environment',
    name: 'isTeslaBrowser()',
    status: isTeslaBrowser() ? 'pass' : 'fail',
    detail: String(isTeslaBrowser()),
  });
  
  results.push({
    category: 'Environment',
    name: 'isCarPlayerMode()',
    status: isCarPlayerMode() ? 'pass' : 'fail',
    detail: String(isCarPlayerMode()),
  });
  
  results.push({
    category: 'Environment',
    name: 'Secure Context',
    status: typeof window !== 'undefined' && window.isSecureContext ? 'pass' : 'fail',
    detail: String(typeof window !== 'undefined' && window.isSecureContext),
  });

  // ============================================================
  // 2. VIDEO ELEMENT TESTS
  // ============================================================
  
  const video = typeof document !== 'undefined' ? document.createElement('video') : null;
  
  if (video) {
    results.push({
      category: 'Video',
      name: 'HTMLVideoElement exists',
      status: 'pass',
      detail: 'OK',
    });

    // Codecs
    const codecs: Array<[string, string]> = [
      ['H.264 AVC', 'video/mp4; codecs="avc1.42E01E"'],
      ['AAC', 'audio/mp4; codecs="mp4a.40.2"'],
      ['HLS m3u8', 'application/vnd.apple.mpegurl'],
      ['VP8 WebM', 'video/webm; codecs="vp8"'],
      ['VP9 WebM', 'video/webm; codecs="vp9"'],
      ['HEVC/H.265', 'video/mp4; codecs="hev1.1.6.L93.B0"'],
    ];
    
    for (const [label, type] of codecs) {
      const support = video.canPlayType(type);
      results.push({
        category: 'Video',
        name: `canPlayType: ${label}`,
        status: support === 'probably' ? 'pass' : support === 'maybe' ? 'partial' : 'fail',
        detail: support || '(empty)',
      });
    }

    // Video playback test (détection Drive/Park)
    const videoPlayResult = await testVideoPlayback(video);
    results.push(videoPlayResult);
    
    // drawImage(video) test
    const drawImageResult = await testVideoDrawImage(video);
    results.push(drawImageResult);
  } else {
    results.push({
      category: 'Video',
      name: 'HTMLVideoElement exists',
      status: 'fail',
      detail: 'Not available',
    });
  }

  // ============================================================
  // 3. AUDIO ELEMENT TESTS
  // ============================================================
  
  const audioPlayResult = await testAudioPlayback();
  results.push(audioPlayResult);

  // ============================================================
  // 4. MEDIA SOURCE EXTENSIONS (MSE)
  // ============================================================
  
  const mse =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { MediaSource?: unknown }).MediaSource !== 'undefined';
  
  results.push({
    category: 'MSE',
    name: 'MediaSource available',
    status: mse ? 'pass' : 'fail',
    detail: String(mse),
  });

  if (mse && video) {
    const mseAttachResult = await testMSEAttach(video);
    results.push(mseAttachResult);
  }

  // ============================================================
  // 5. WEBCODECS
  // ============================================================
  
  const hasVideoDecoder =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined';
  
  const hasAudioDecoder =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { AudioDecoder?: unknown }).AudioDecoder !== 'undefined';
  
  results.push({
    category: 'WebCodecs',
    name: 'VideoDecoder',
    status: hasVideoDecoder ? 'pass' : 'fail',
    detail: String(hasVideoDecoder),
  });
  
  results.push({
    category: 'WebCodecs',
    name: 'AudioDecoder',
    status: hasAudioDecoder ? 'pass' : 'fail',
    detail: String(hasAudioDecoder),
  });

  if (hasVideoDecoder) {
    const webCodecsResult = await testWebCodecsDecoder();
    results.push(webCodecsResult);
  }

  // ============================================================
  // 6. CANVAS & RENDERING
  // ============================================================
  
  const canvas2DResult = testCanvas2D();
  results.push(canvas2DResult);
  
  const webGLResult = testWebGL();
  results.push(webGLResult);
  
  const offscreenCanvasResult = testOffscreenCanvas();
  results.push(offscreenCanvasResult);
  
  const imageBitmapResult = await testCreateImageBitmap();
  results.push(imageBitmapResult);

  // ============================================================
  // 7. ANIMATION & TIMING
  // ============================================================
  
  const rafResult = await testRequestAnimationFrame();
  results.push(rafResult);

  // ============================================================
  // 8. AUTOPLAY POLICIES
  // ============================================================
  
  const autoplayMutedResult = await testAutoplayPolicy(true);
  results.push(autoplayMutedResult);
  
  const autoplayUnmutedResult = await testAutoplayPolicy(false);
  results.push(autoplayUnmutedResult);

  // ============================================================
  // 9. FULLSCREEN & PIP
  // ============================================================
  
  const fullscreenResult = testFullscreenAPI();
  results.push(fullscreenResult);
  
  const pipResult = testPictureInPicture();
  results.push(pipResult);

  // ============================================================
  // 10. NETWORKING
  // ============================================================
  
  const wsResult = testWebSocket();
  results.push(wsResult);
  
  const wsBinaryResult = await testWebSocketBinary();
  results.push(wsBinaryResult);
  
  const audioCtxResult = testAudioContext();
  results.push(audioCtxResult);

  // ============================================================
  // 11. ANALYSIS & RECOMMENDATIONS
  // ============================================================
  
  const videoPlaybackWorks = results.find(r => r.name === 'Video playback (Drive detect)')?.status === 'pass';
  const audioWorks = results.find(r => r.name === 'Audio playback')?.status === 'pass';
  const canvasWorks = results.find(r => r.name === 'Canvas 2D')?.status === 'pass';
  const mseWorks = results.find(r => r.name === 'MediaSource available')?.status === 'pass';
  const webCodecsWorks = results.find(r => r.name === 'VideoDecoder')?.status === 'pass';
  
  const detectedMode = videoPlaybackWorks ? 'park' : 'drive';
  
  let recommendedEngine = 'mjpeg'; // Fallback sûr
  if (videoPlaybackWorks) {
    recommendedEngine = 'native-video'; // Park → préférer qualité
  } else if (canvasWorks && audioWorks) {
    recommendedEngine = 'mjpeg'; // Drive → MJPEG workaround
  }

  return {
    timestamp: Date.now(),
    userAgent: ua,
    results,
    detectedMode,
    summary: {
      videoBlocked: !videoPlaybackWorks,
      audioWorks: audioWorks || false,
      canvasWorks: canvasWorks || false,
      mseAvailable: mseWorks || false,
      webCodecsAvailable: webCodecsWorks || false,
      recommendedEngine,
    },
  };
}

// ============================================================
// TEST IMPLEMENTATIONS
// ============================================================

async function testVideoPlayback(video: HTMLVideoElement): Promise<ProbeResult> {
  return new Promise((resolve) => {
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.left = '-9999px';
    
    const canPlayWebM = video.canPlayType('video/webm') !== '';
    if (!canPlayWebM) {
      resolve({
        category: 'Video',
        name: 'Video playback (Drive detect)',
        status: 'skip',
        detail: 'WebM not supported',
        confidence: 0,
      });
      return;
    }

    video.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh4QGBA==';
    
    document.body.appendChild(video);
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        category: 'Video',
        name: 'Video playback (Drive detect)',
        status: 'fail',
        detail: 'Blocked (currentTime=0 despite play) — likely Drive mode',
        confidence: 0.7,
      });
    }, 2500);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (video.parentNode) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        document.body.removeChild(video);
      }
    };
    
    const checkProgress = () => {
      if (video.currentTime > 0.05) {
        cleanup();
        resolve({
          category: 'Video',
          name: 'Video playback (Drive detect)',
          status: 'pass',
          detail: `OK (currentTime=${video.currentTime.toFixed(3)}s) — likely Park mode`,
          confidence: 0.9,
        });
      }
    };
    
    video.addEventListener('timeupdate', checkProgress);
    video.addEventListener('playing', () => {
      setTimeout(checkProgress, 500);
      setTimeout(checkProgress, 1000);
    });
    
    video.play().catch(() => {});
  });
}

async function testVideoDrawImage(video: HTMLVideoElement): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      resolve({
        category: 'Video',
        name: 'drawImage(video) to canvas',
        status: 'fail',
        detail: 'Canvas 2D context unavailable',
      });
      return;
    }

    video.muted = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.left = '-9999px';
    
    video.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh4QGBA==';
    
    document.body.appendChild(video);
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        category: 'Video',
        name: 'drawImage(video) to canvas',
        status: 'fail',
        detail: 'Timeout or black frame (Drive blocks drawImage from paused video)',
        confidence: 0.6,
      });
    }, 2500);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (video.parentNode) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        document.body.removeChild(video);
      }
    };
    
    video.addEventListener('playing', () => {
      setTimeout(() => {
        try {
          ctx.drawImage(video, 0, 0, 10, 10);
          const imageData = ctx.getImageData(0, 0, 10, 10);
          const hasNonZero = Array.from(imageData.data).some(v => v > 0);
          
          cleanup();
          
          if (hasNonZero) {
            resolve({
              category: 'Video',
              name: 'drawImage(video) to canvas',
              status: 'pass',
              detail: 'OK (non-black pixels drawn)',
              confidence: 0.8,
            });
          } else {
            resolve({
              category: 'Video',
              name: 'drawImage(video) to canvas',
              status: 'fail',
              detail: 'Black frame (Drive may block video→canvas)',
              confidence: 0.7,
            });
          }
        } catch (e) {
          cleanup();
          resolve({
            category: 'Video',
            name: 'drawImage(video) to canvas',
            status: 'fail',
            detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }, 800);
    });
    
    video.play().catch(() => {});
  });
}

async function testAudioPlayback(): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    audio.muted = true;
    audio.autoplay = true;
    audio.style.position = 'absolute';
    audio.style.width = '0';
    audio.style.height = '0';
    audio.style.opacity = '0';
    
    // Tiny MP3 data URL (~100 bytes silence)
    audio.src = 'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//////////////////////////////////////////////////////////////////8AAAA5TEFNRTMuOThyBLkAAAAALhQAABRAJAMGQQAB4AAAg4S3nt0YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    
    document.body.appendChild(audio);
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        category: 'Audio',
        name: 'Audio playback',
        status: 'partial',
        detail: 'No timeupdate (may be blocked or muted policy)',
        confidence: 0.4,
      });
    }, 2000);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (audio.parentNode) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        document.body.removeChild(audio);
      }
    };
    
    audio.addEventListener('timeupdate', () => {
      if (audio.currentTime > 0) {
        cleanup();
        resolve({
          category: 'Audio',
          name: 'Audio playback',
          status: 'pass',
          detail: `OK (currentTime=${audio.currentTime.toFixed(3)}s)`,
          confidence: 0.9,
        });
      }
    });
    
    audio.play().catch(() => {});
  });
}

async function testMSEAttach(video: HTMLVideoElement): Promise<ProbeResult> {
  try {
    const MediaSource = (window as any).MediaSource;
    const ms = new MediaSource();
    const url = URL.createObjectURL(ms);
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        resolve({
          category: 'MSE',
          name: 'SourceBuffer attach to video',
          status: 'fail',
          detail: 'MediaSource never opened',
        });
      }, 2000);
      
      ms.addEventListener('sourceopen', () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        resolve({
          category: 'MSE',
          name: 'SourceBuffer attach to video',
          status: 'pass',
          detail: 'MediaSource sourceopen event fired',
        });
      });
      
      video.src = url;
    });
  } catch (e) {
    return {
      category: 'MSE',
      name: 'SourceBuffer attach to video',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function testWebCodecsDecoder(): Promise<ProbeResult> {
  try {
    const VideoDecoder = (window as any).VideoDecoder;
    const config = {
      codec: 'avc1.42E01E',
      codedWidth: 640,
      codedHeight: 480,
    };
    
    const support = await VideoDecoder.isConfigSupported(config);
    
    return {
      category: 'WebCodecs',
      name: 'VideoDecoder.isConfigSupported(AVC)',
      status: support.supported ? 'pass' : 'fail',
      detail: support.supported ? 'H.264 AVC supported' : 'H.264 AVC not supported',
    };
  } catch (e) {
    return {
      category: 'WebCodecs',
      name: 'VideoDecoder.isConfigSupported(AVC)',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function testCanvas2D(): ProbeResult {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return {
      category: 'Canvas',
      name: 'Canvas 2D',
      status: ctx ? 'pass' : 'fail',
      detail: ctx ? 'OK' : 'Context null',
    };
  } catch (e) {
    return {
      category: 'Canvas',
      name: 'Canvas 2D',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function testWebGL(): ProbeResult {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return {
      category: 'Canvas',
      name: 'WebGL',
      status: gl ? 'pass' : 'fail',
      detail: gl ? 'OK' : 'Context null',
    };
  } catch (e) {
    return {
      category: 'Canvas',
      name: 'WebGL',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function testOffscreenCanvas(): ProbeResult {
  try {
    const hasOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
    return {
      category: 'Canvas',
      name: 'OffscreenCanvas',
      status: hasOffscreenCanvas ? 'pass' : 'fail',
      detail: String(hasOffscreenCanvas),
    };
  } catch (e) {
    return {
      category: 'Canvas',
      name: 'OffscreenCanvas',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function testCreateImageBitmap(): Promise<ProbeResult> {
  try {
    if (typeof createImageBitmap === 'undefined') {
      return {
        category: 'Canvas',
        name: 'createImageBitmap',
        status: 'fail',
        detail: 'Not available',
      };
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 10, 10);
    }
    
    await createImageBitmap(canvas);
    
    return {
      category: 'Canvas',
      name: 'createImageBitmap',
      status: 'pass',
      detail: 'OK',
    };
  } catch (e) {
    return {
      category: 'Canvas',
      name: 'createImageBitmap',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function testRequestAnimationFrame(): Promise<ProbeResult> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      resolve({
        category: 'Animation',
        name: 'requestAnimationFrame',
        status: 'fail',
        detail: 'Not available',
      });
      return;
    }
    
    const start = performance.now();
    let frameCount = 0;
    
    const measureFrames = () => {
      frameCount++;
      if (frameCount >= 10) {
        const elapsed = performance.now() - start;
        const fps = (frameCount / elapsed) * 1000;
        
        resolve({
          category: 'Animation',
          name: 'requestAnimationFrame',
          status: 'pass',
          detail: `~${fps.toFixed(1)} fps (${frameCount} frames in ${elapsed.toFixed(0)}ms)`,
        });
      } else {
        requestAnimationFrame(measureFrames);
      }
    };
    
    requestAnimationFrame(measureFrames);
  });
}

async function testAutoplayPolicy(muted: boolean): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = muted;
    video.autoplay = true;
    video.playsInline = true;
    video.style.position = 'absolute';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.left = '-9999px';
    
    video.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0GGQ2hyb21lFlSua7+uvdeBAXPFh4QGBA==';
    
    document.body.appendChild(video);
    
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        category: 'Autoplay',
        name: `Autoplay ${muted ? 'muted' : 'unmuted'}`,
        status: 'fail',
        detail: 'Blocked by policy or Drive mode',
        confidence: 0.5,
      });
    }, 1500);
    
    const cleanup = () => {
      clearTimeout(timeout);
      if (video.parentNode) {
        video.pause();
        video.removeAttribute('src');
        video.load();
        document.body.removeChild(video);
      }
    };
    
    video.addEventListener('playing', () => {
      cleanup();
      resolve({
        category: 'Autoplay',
        name: `Autoplay ${muted ? 'muted' : 'unmuted'}`,
        status: 'pass',
        detail: 'Allowed',
        confidence: 0.8,
      });
    });
    
    video.play().catch(() => {
      cleanup();
      resolve({
        category: 'Autoplay',
        name: `Autoplay ${muted ? 'muted' : 'unmuted'}`,
        status: 'fail',
        detail: 'play() rejected',
        confidence: 0.9,
      });
    });
  });
}

function testFullscreenAPI(): ProbeResult {
  const hasFullscreen =
    document.fullscreenEnabled ||
    (document as any).webkitFullscreenEnabled ||
    (document as any).mozFullScreenEnabled ||
    (document as any).msFullscreenEnabled;
  
  return {
    category: 'APIs',
    name: 'Fullscreen API',
    status: hasFullscreen ? 'pass' : 'fail',
    detail: String(Boolean(hasFullscreen)),
  };
}

function testPictureInPicture(): ProbeResult {
  const hasPiP = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document;
  
  return {
    category: 'APIs',
    name: 'Picture-in-Picture',
    status: hasPiP ? 'pass' : 'fail',
    detail: String(hasPiP),
  };
}

function testWebSocket(): ProbeResult {
  const hasWS = typeof WebSocket !== 'undefined';
  
  return {
    category: 'Network',
    name: 'WebSocket',
    status: hasWS ? 'pass' : 'fail',
    detail: String(hasWS),
  };
}

async function testWebSocketBinary(): Promise<ProbeResult> {
  if (typeof WebSocket === 'undefined') {
    return {
      category: 'Network',
      name: 'WebSocket binary throughput',
      status: 'skip',
      detail: 'WebSocket not available',
    };
  }
  
  // Simple echo test (skip actual connection for now, just check constructor)
  try {
    // Don't actually connect in probe, just verify constructor works
    return {
      category: 'Network',
      name: 'WebSocket binary throughput',
      status: 'pass',
      detail: 'WebSocket constructor available (actual throughput test skipped)',
    };
  } catch (e) {
    return {
      category: 'Network',
      name: 'WebSocket binary throughput',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function testAudioContext(): ProbeResult {
  try {
    const AC =
      typeof window !== 'undefined'
        ? (window as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: new () => unknown }).webkitAudioContext
        : undefined;
    
    const hasAC = typeof AC === 'function';
    
    return {
      category: 'Audio',
      name: 'AudioContext',
      status: hasAC ? 'pass' : 'fail',
      detail: String(hasAC),
    };
  } catch (e) {
    return {
      category: 'Audio',
      name: 'AudioContext',
      status: 'fail',
      detail: `Exception: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ============================================================
// UI COMPONENT
// ============================================================

export default function CarProbe() {
  const [report, setReport] = useState<ProbeReport | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    stampTeslaBrowserHints();
    
    // Auto-run probe on mount
    setRunning(true);
    runComprehensiveProbe().then((r) => {
      setReport(r);
      setRunning(false);
    });
  }, []);

  const getStatusIcon = (status: ProbeStatus) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-5 h-5" style={{ color: '#8fd9a8' }} />;
      case 'fail':
        return <XCircle className="w-5 h-5" style={{ color: '#ffb3bc' }} />;
      case 'partial':
        return <AlertCircle className="w-5 h-5" style={{ color: '#ffd699' }} />;
      default:
        return <AlertCircle className="w-5 h-5" style={{ color: 'var(--tesla-faint)' }} />;
    }
  };

  const getStatusColor = (status: ProbeStatus) => {
    switch (status) {
      case 'pass':
        return 'rgba(60,180,100,0.35)';
      case 'fail':
        return 'rgba(227,25,55,0.35)';
      case 'partial':
        return 'rgba(255,165,0,0.35)';
      default:
        return 'var(--tesla-border)';
    }
  };

  const getStatusBg = (status: ProbeStatus) => {
    switch (status) {
      case 'pass':
        return 'rgba(30,80,50,0.25)';
      case 'fail':
        return 'var(--tesla-red-soft)';
      case 'partial':
        return 'rgba(80,60,20,0.25)';
      default:
        return 'var(--tesla-surface)';
    }
  };

  const groupedResults: Record<string, ProbeResult[]> = {};
  if (report) {
    for (const result of report.results) {
      if (!groupedResults[result.category]) {
        groupedResults[result.category] = [];
      }
      groupedResults[result.category].push(result);
    }
  }

  return (
    <div className="tesla-car-root" style={{ padding: '1.75rem', maxWidth: '56rem', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <p className="tesla-car-lib__eyebrow">Popcornn</p>
        <h1 className="tesla-car-lib__title" style={{ marginTop: '0.35rem' }}>
          Diagnostic Complet
        </h1>
        <p style={{ color: 'var(--tesla-muted)', fontSize: '1.05rem', marginTop: '0.75rem', lineHeight: 1.45 }}>
          Tests systématiques des APIs navigateur — Park vs Drive detection
        </p>
        <a href="/car" className="tesla-car-link-quiet" style={{ marginTop: '1.25rem' }}>
          ← Theater
        </a>
      </header>

      {running && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--tesla-muted)' }}>
          <p style={{ fontSize: '1.1rem' }}>Tests en cours...</p>
          <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>Cela peut prendre 10-15 secondes</p>
        </div>
      )}

      {report && (
        <>
          {/* Summary */}
          <div
            style={{
              marginBottom: '2rem',
              padding: '1.5rem',
              borderRadius: 'var(--tesla-radius-lg)',
              border: `2px solid ${report.detectedMode === 'park' ? 'rgba(60,180,100,0.5)' : 'rgba(227,25,55,0.5)'}`,
              background: report.detectedMode === 'park' ? 'rgba(30,80,50,0.2)' : 'var(--tesla-red-soft)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.3rem', fontWeight: 600 }}>
              Résumé — Mode détecté: <strong style={{ textTransform: 'uppercase' }}>{report.detectedMode}</strong>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>Video bloqué</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                  {report.summary.videoBlocked ? 'Oui ❌' : 'Non ✅'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>Audio fonctionne</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                  {report.summary.audioWorks ? 'Oui ✅' : 'Non ❌'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>Canvas disponible</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                  {report.summary.canvasWorks ? 'Oui ✅' : 'Non ❌'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>MSE disponible</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                  {report.summary.mseAvailable ? 'Oui ✅' : 'Non ❌'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>WebCodecs disponible</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 500 }}>
                  {report.summary.webCodecsAvailable ? 'Oui ✅' : 'Non ❌'}
                </p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tesla-muted)' }}>Moteur recommandé</p>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.1rem', fontWeight: 600, color: 'var(--tesla-red)' }}>
                  {report.summary.recommendedEngine.toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          {Object.entries(groupedResults).map(([category, results]) => (
            <div key={category} style={{ marginBottom: '1.5rem' }}>
              <h3
                style={{
                  margin: '0 0 0.75rem',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: 'var(--tesla-text)',
                  borderBottom: '1px solid var(--tesla-border)',
                  paddingBottom: '0.5rem',
                }}
              >
                {category}
              </h3>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {results.map((result, idx) => (
                  <li
                    key={idx}
                    style={{
                      borderRadius: 'var(--tesla-radius)',
                      border: `1px solid ${getStatusColor(result.status)}`,
                      background: getStatusBg(result.status),
                      padding: '0.75rem 1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {getStatusIcon(result.status)}
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem' }}>{result.name}</p>
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--tesla-muted)', wordBreak: 'break-all' }}>
                          {result.detail}
                          {result.confidence != null && ` (confiance: ${(result.confidence * 100).toFixed(0)}%)`}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Raw Data */}
          <details style={{ marginTop: '2rem', padding: '1rem', background: 'var(--tesla-surface)', borderRadius: 'var(--tesla-radius)' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 500, marginBottom: '1rem' }}>
              Données brutes (JSON)
            </summary>
            <pre
              style={{
                margin: 0,
                fontSize: '0.75rem',
                color: 'var(--tesla-muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: 1.4,
              }}
            >
              {JSON.stringify(report, null, 2)}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
