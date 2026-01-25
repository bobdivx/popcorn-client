export interface HLSPlayerProps {
  src: string;
  infoHash?: string;
  fileName: string;
  torrentName?: string;
  torrentId?: string;
  filePath?: string;
  startFromBeginning?: boolean;
  onError?: (error: Error) => void;
  onLoadingChange?: (loading: boolean) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    Hls?: any;
  }
}
