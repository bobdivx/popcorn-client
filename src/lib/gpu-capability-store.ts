/**
 * Capacité GPU du backend (NVDEC / NVENC), alimentée par le health check
 * et éventuellement raffinée par le statut HLS de lecture.
 */

export interface GpuCapability {
  known: boolean;
  gpu_available: boolean;
  encoding_hwaccel: string | null;
  cuda_decode_available: boolean;
}

type Listener = (state: GpuCapability) => void;

const initial: GpuCapability = {
  known: false,
  gpu_available: false,
  encoding_hwaccel: null,
  cuda_decode_available: false,
};

let state: GpuCapability = { ...initial };
const listeners = new Set<Listener>();

function notify() {
  const snapshot = { ...state };
  listeners.forEach((l) => l(snapshot));
}

export function getGpuCapability(): GpuCapability {
  return { ...state };
}

export function subscribeGpuCapability(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function setGpuCapability(partial: Partial<Omit<GpuCapability, 'known'>> & { known?: boolean }) {
  state = {
    known: partial.known ?? true,
    gpu_available: partial.gpu_available ?? state.gpu_available,
    encoding_hwaccel:
      partial.encoding_hwaccel !== undefined ? partial.encoding_hwaccel : state.encoding_hwaccel,
    cuda_decode_available: partial.cuda_decode_available ?? state.cuda_decode_available,
  };
  notify();
}

export function resetGpuCapability() {
  state = { ...initial };
  notify();
}

export type GpuKind = 'nvenc' | 'nvdec' | 'vaapi' | 'qsv' | 'cpu' | 'unknown';

export function gpuKind(cap: Pick<GpuCapability, 'encoding_hwaccel' | 'cuda_decode_available' | 'gpu_available' | 'known'>): GpuKind {
  if (!cap.known && !cap.gpu_available && !cap.cuda_decode_available && !cap.encoding_hwaccel) {
    return 'unknown';
  }
  const hw = (cap.encoding_hwaccel || '').toLowerCase();
  if (hw === 'cuda') return 'nvenc';
  if (hw === 'vaapi') return 'vaapi';
  if (hw === 'qsv') return 'qsv';
  if (cap.cuda_decode_available) return 'nvdec';
  if (cap.gpu_available) return 'nvdec';
  return 'cpu';
}
