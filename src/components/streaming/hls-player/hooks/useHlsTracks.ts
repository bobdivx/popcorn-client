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

    const mapAudio = (list: any[]): AudioTrack[] =>
      list.map((track: any, index: number) => ({
        id: typeof track.id === 'number' ? track.id : index,
        name: track.name || track.lang || `Audio ${index + 1}`,
        lang: track.lang,
        groupId: track.groupId,
        default: !!track.default,
      }));

    const mapSubs = (list: any[]): SubtitleTrack[] =>
      list.map((track: any, index: number) => ({
        id: typeof track.id === 'number' ? track.id : index,
        name: track.name || track.lang || `Subtitle ${index + 1}`,
        lang: track.lang,
        groupId: track.groupId,
        default: !!track.default,
      }));

    const updateAudioTracks = () => {
      try {
        const raw =
          (hls.audioTracks && hls.audioTracks.length > 0
            ? hls.audioTracks
            : hls.allAudioTracks && hls.allAudioTracks.length > 0
              ? hls.allAudioTracks
              : []) || [];
        if (raw.length === 0) {
          setAudioTracks([]);
          return;
        }
        const tracks = mapAudio(raw);
        setAudioTracks(tracks);

        if (!tracksInitializedRef.current) {
          let selectedTrack: AudioTrack | undefined;
          if (playerConfig.defaultAudioLanguage && playerConfig.defaultAudioLanguage !== 'auto') {
            selectedTrack = tracks.find((t) => t.lang === playerConfig.defaultAudioLanguage);
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find((t) => t.default) || tracks[0];
          }
          if (selectedTrack) {
            setCurrentAudioTrack(selectedTrack.id);
            hls.audioTrack = selectedTrack.id;
          }
          tracksInitializedRef.current = true;
        } else if (typeof hls.audioTrack === 'number' && hls.audioTrack >= 0) {
          setCurrentAudioTrack(hls.audioTrack);
        }
      } catch (err) {
        console.warn('Erreur lors de la mise à jour des audio tracks:', err);
      }
    };

    const updateSubtitleTracks = () => {
      try {
        const raw = (hls.subtitleTracks && hls.subtitleTracks.length > 0
          ? hls.subtitleTracks
          : []) || [];

        // Fallback : textTracks du <video> (WebVTT embarqués).
        if (raw.length === 0 && video.textTracks && video.textTracks.length > 0) {
          const fromVideo: SubtitleTrack[] = [];
          for (let i = 0; i < video.textTracks.length; i++) {
            const tt = video.textTracks[i];
            if (tt.kind !== 'subtitles' && tt.kind !== 'captions') continue;
            fromVideo.push({
              id: i,
              name: tt.label || tt.language || `Subtitle ${i + 1}`,
              lang: tt.language || undefined,
              default: tt.mode === 'showing',
            });
          }
          setSubtitleTracks(fromVideo);
          return;
        }

        if (raw.length === 0) {
          setSubtitleTracks([]);
          return;
        }
        const tracks = mapSubs(raw);
        setSubtitleTracks(tracks);

        if (!tracksInitializedRef.current && playerConfig.autoShowSubtitles) {
          let selectedTrack: SubtitleTrack | undefined;
          if (
            playerConfig.defaultSubtitleLanguage &&
            playerConfig.defaultSubtitleLanguage !== 'none'
          ) {
            selectedTrack = tracks.find((t) => t.lang === playerConfig.defaultSubtitleLanguage);
          }
          if (!selectedTrack) {
            selectedTrack = tracks.find((t) => t.default);
          }
          if (selectedTrack) {
            setCurrentSubtitleTrack(selectedTrack.id);
            hls.subtitleTrack = selectedTrack.id;
          }
        } else if (typeof hls.subtitleTrack === 'number') {
          setCurrentSubtitleTrack(hls.subtitleTrack);
        }
      } catch (err) {
        console.warn('Erreur lors de la mise à jour des subtitle tracks:', err);
      }
    };

    const refresh = () => {
      updateAudioTracks();
      updateSubtitleTracks();
    };

    const Events = window.Hls?.Events;
    const onManifest = () => refresh();
    const onAudioUpdated = () => updateAudioTracks();
    const onSubsUpdated = () => updateSubtitleTracks();
    const onAudioSwitched = () => {
      if (typeof hls.audioTrack === 'number') setCurrentAudioTrack(hls.audioTrack);
    };
    const onSubsSwitched = () => {
      if (typeof hls.subtitleTrack === 'number') setCurrentSubtitleTrack(hls.subtitleTrack);
    };

    if (Events) {
      hls.on(Events.MANIFEST_PARSED, onManifest);
      hls.on(Events.AUDIO_TRACKS_UPDATED, onAudioUpdated);
      hls.on(Events.SUBTITLE_TRACKS_UPDATED, onSubsUpdated);
      hls.on(Events.AUDIO_TRACK_SWITCHED, onAudioSwitched);
      hls.on(Events.SUBTITLE_TRACK_SWITCH, onSubsSwitched);
    } else {
      hls.on('hlsMediaAttached', refresh);
      hls.on('hlsAudioTracksUpdated', onAudioUpdated);
      hls.on('hlsSubtitleTracksUpdated', onSubsUpdated);
    }

    refresh();

    return () => {
      if (!hls) return;
      if (Events) {
        hls.off(Events.MANIFEST_PARSED, onManifest);
        hls.off(Events.AUDIO_TRACKS_UPDATED, onAudioUpdated);
        hls.off(Events.SUBTITLE_TRACKS_UPDATED, onSubsUpdated);
        hls.off(Events.AUDIO_TRACK_SWITCHED, onAudioSwitched);
        hls.off(Events.SUBTITLE_TRACK_SWITCH, onSubsSwitched);
      } else {
        hls.off('hlsMediaAttached', refresh);
        hls.off('hlsAudioTracksUpdated', onAudioUpdated);
        hls.off('hlsSubtitleTracksUpdated', onSubsUpdated);
      }
    };
  }, [videoRef, hlsRef, hlsLoaded, src, playerConfig]);

  const changeAudioTrack = (trackId: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    try {
      hls.audioTrack = trackId;
      setCurrentAudioTrack(trackId);
    } catch (err) {
      console.warn('Impossible de changer la piste audio:', err);
    }
  };

  const changeSubtitleTrack = (trackId: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    if (hls && hls.subtitleTracks && hls.subtitleTracks.length > 0) {
      hls.subtitleTrack = trackId;
      setCurrentSubtitleTrack(trackId);
      return;
    }
    if (video?.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tt = video.textTracks[i];
        if (tt.kind !== 'subtitles' && tt.kind !== 'captions') continue;
        tt.mode = i === trackId ? 'showing' : 'hidden';
      }
      setCurrentSubtitleTrack(trackId);
    }
  };

  const toggleSubtitleSelector = () => {
    setShowSubtitleSelector((v) => !v);
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
