import type { ClientTorrentStats } from '../../../../../lib/client/types';
import type { PlayStatus } from '../../types';

export interface UseTorrentPlayerOptions {
  torrent: {
    id: string;
    infoHash: string | null;
    name: string;
    _externalLink?: string;
    _externalMagnetUri?: string | null;
  };
  isExternal: boolean;
  hasInfoHash: boolean;
  hasMagnetLink: boolean;
  canStream: boolean;
  isAvailableLocally: boolean;
  setIsAvailableLocally: (value: boolean) => void;
  loadVideoFiles: (infoHash: string) => Promise<any[]>;
  videoFiles: any[];
  selectedFile: any;
  setVideoFiles: (files: any[]) => void;
  setSelectedFile: (file: any) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setShowInfo: (show: boolean) => void;
  addDebugLog: (type: 'info' | 'success' | 'error' | 'warning', message: string, data?: any) => void;
}

export interface PollingContext {
  setPlayStatus: (status: PlayStatus) => void;
  setTorrentStats: (stats: ClientTorrentStats | null) => void;
  setProgressMessage: (message: string) => void;
  setErrorMessage: (message: string | null) => void;
  stopProgressPolling: () => void;
  setIsPlaying: (playing: boolean) => void;
  setShowInfo: (show: boolean) => void;
  setVideoFiles: (files: any[]) => void;
  setSelectedFile: (file: any) => void;
  setIsAvailableLocally: (value: boolean) => void;
  addDebugLog: (type: 'info' | 'success' | 'error' | 'warning', message: string, data?: any) => void;
  playStatus: PlayStatus;
  isPlaying: boolean;
  videoFiles: any[];
  selectedFile: any;
  torrent: { name: string };
  loadVideoFiles: (infoHash: string) => Promise<any[]>;
  progressPollIntervalRef: { current: number | null };
  queuedStartTimeRef: { current: number | null };
  lastQueuedLogTimeRef: { current: number | null };
  lastResumeAttemptRef: { current: number | null };
}

export interface PlayHandlerContext {
  torrent: {
    id: string;
    infoHash: string | null;
    name: string;
    _externalLink?: string;
    _externalMagnetUri?: string | null;
  };
  isExternal: boolean;
  hasInfoHash: boolean;
  hasMagnetLink: boolean;
  isAvailableLocally: boolean;
  loadVideoFiles: (infoHash: string) => Promise<any[]>;
  videoFiles: any[];
  selectedFile: any;
  setVideoFiles: (files: any[]) => void;
  setSelectedFile: (file: any) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  setShowInfo: (show: boolean) => void;
  setPlayStatus: (status: PlayStatus) => void;
  setProgressMessage: (message: string) => void;
  setErrorMessage: (message: string | null) => void;
  setTorrentStats: (stats: ClientTorrentStats | null) => void;
  stopProgressPolling: () => void;
  addDebugLog: (type: 'info' | 'success' | 'error' | 'warning', message: string, data?: any) => void;
  progressPollIntervalRef: { current: number | null };
  pollTorrentProgress: (infoHash: string) => Promise<void>;
}
