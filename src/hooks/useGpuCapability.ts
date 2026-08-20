import { useEffect, useState } from 'preact/hooks';
import {
  getGpuCapability,
  subscribeGpuCapability,
  type GpuCapability,
} from '../lib/gpu-capability-store';

export function useGpuCapability(): GpuCapability {
  const [cap, setCap] = useState<GpuCapability>(() => getGpuCapability());
  useEffect(() => subscribeGpuCapability(setCap), []);
  return cap;
}
