import { useState, useEffect, useRef } from 'preact/hooks';
import { usePlayerConfig } from '../../player-shared/hooks/usePlayerConfig';

interface AudioTrack {
  id: number;
  name: string;
  lang?: string;
  groupId?: string;
  default?: boolean;
}

interface SubtitleTrack {
  id: number;
  name: string;
  lang?: string;
  groupId?: string;
  default?: boolean;
}

interface UseHlsTracksProps {
  videoRef: { current: HTMLVideoElement | null };
  hlsRef: { current: any | null };
  hlsLoaded: boolean;
  src?: string;
}

export function useHlsTracks({ videoRef, hlsRef, hlsLoaded, src }: UseHlsTracksProps) {
  const playerConfig = usePlayerConfig();
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(-1);
  const [currentSubtitleTrack, setCurrentSubtitleTrack] = useState<number>(-1);
  const [showSubtitleSelector, setShowSubtitleSelector] = useState(false);
  const tracksInitializedRef = useRef(false);
  const currentSrcRef = useRef<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    
    if (!video || !hls || !hlsLoaded) return;

    if (src && currentSrcRef.current !== src) {
      tracksInitializedRef.current = false;
      setCurrentAudioTrack(-1);
      setCurrentSubtitleTrack(-1);
      setAudioTracks([]);
      setSubtitleTracks([]);
      currentSrcRef.current = src;
    }

    const updateAudioTracks = () => {
      try {
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const tracks: AudioTrack[] = hls.audioTracks.map((track: any, index: number) => ({
            id: index,
            name: track.name || track.lang || `Audio ${index + 1}`,
            lang: track.lang,
            groupId: track.groupId,
            default: track.default,
          }));
          setAudioTracks(tracks);
          
          if (!tracksInitializedRef.current) {
            let selectedTrack = null;
            if (playerConfig.defaultAudioLanguage && playerConfig.defaultAudioLanguage !== 'auto') {
              selectedTrack = tracks.find(t => t.lang === playerConfig.defaultAudioLanguage);
            }
            if (!selectedTrack) {
              selectedTrack = tracks.find(t => t.default) || tracks[0];
            }
            if (selectedTrack) {
              setCurrentAudioTrack(selectedTrack.id);
              hls.audioTrack = selectedTrack.id;
            }
            tracksInitializedRef.current = true;
          }
        }
      } catch (err) {
        console.warn('Erreur lors de la mise à jour des audio tracks:', err);
      }
    };

    const updateSubtitleTracks = () => {
      try {
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const tracks: SubtitleTrack[] = hls.subtitleTracks.map((track: any, index: number) => ({
            id: index,
            name: track.name || track.lang || `Subtitle ${index + 1}`,
            lang: track.lang,
            groupId: track.groupId,
            default: track.default,
          }));
          setSubtitleTracks(tracks);
          
          if (!tracksInitializedRef.current && playerConfig.autoShowSubtitles) {
            let selectedTrack = null;
            if (playerConfig.defaultSubtitleLanguage && playerConfig.defaultSubtitleLanguage !== 'none') {
              selectedTrack = tracks.find(t => t.lang === playerConfig.defaultSubtitleLanguage);
            }
            if (!selectedTrack) {
              selectedTrack = tracks.find(t => t.default);
            }
            if (selectedTrack) {
              setCurrentSubtitleTrack(selectedTrack.id);
              hls.subtitleTrack = selectedTrack.id;
            }
          }
        }
      } catch (err) {
        console.warn('Erreur lors de la mise à jour des subtitle tracks:', err);
      }
    };

    if (hls.media) {
      hls.on('hlsMediaAttached', () => {
        updateAudioTracks();
        updateSubtitleTracks();
      });

      hls.on('hlsAudioTracksUpdated', updateAudioTracks);
      hls.on('hlsSubtitleTracksUpdated', updateSubtitleTracks);

      updateAudioTracks();
      updateSubtitleTracks();
    }

    return () => {
      if (hls) {
        hls.off('hlsMediaAttached');
        hls.off('hlsAudioTracksUpdated');
        hls.off('hlsSubtitleTracksUpdated');
      }
    };
  }, [videoRef, hlsRef, hlsLoaded, src, playerConfig]);

  const changeAudioTrack = (trackId: number) => {
    const hls = hlsRef.current;
    if (hls && hls.audioTracks && hls.audioTracks[trackId]) {
      hls.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
    }
  };

  const changeSubtitleTrack = (trackId: number) => {
    const hls = hlsRef.current;
    if (hls && hls.subtitleTracks) {
      if (trackId === -1) {
        hls.subtitleTrack = -1;
        setCurrentSubtitleTrack(-1);
      } else if (hls.subtitleTracks[trackId]) {
        hls.subtitleTrack = trackId;
        setCurrentSubtitleTrack(trackId);
      }
    }
  };

  const toggleSubtitleSelector = () => {
    setShowSubtitleSelector(!showSubtitleSelector);
  };

  return {
    audioTracks,
    subtitleTracks,
    currentAudioTrack,
    currentSubtitleTrack,
    showSubtitleSelector,
    changeAudioTrack,
    changeSubtitleTrack,
    toggleSubtitleSelector,
    setShowSubtitleSelector,
  };
}
