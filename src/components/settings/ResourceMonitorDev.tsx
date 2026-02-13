/**
 * Monitor de ressources (CPU / mémoire) en temps réel.
 * S'appuie sur GET /api/media/resources (backend sysinfo).
 */
import { Activity, Cpu, TrendingUp } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { SystemResourcesResponse } from '../../lib/client/server-api/system';

const POLL_INTERVAL_MS = 10_000; // 10 s pour limiter la charge serveur
const MAX_SAMPLES = 60; // ~10 min d'historique

function Sparkline({ values, maxVal, height = 32, color = 'rgb(34 197 94)' }: {
  values: number[];
  maxVal: number;
  height?: number;
  color?: string;
}) {
  if (values.length < 2) return null;
  const width = 200;
  const pad = 2;
  const range = maxVal > 0 ? maxVal : 1;
  const points = values
    .map((v, i) => {
      const x = pad + (i / Math.max(1, values.length - 1)) * (width - 2 * pad);
      const y = height - pad - (v / range) * (height - 2 * pad);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} className="rounded overflow-hidden bg-black/30" aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export default function ResourceMonitorDev() {
  const { t } = useI18n();
  const [data, setData] = useState<SystemResourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyCpu, setHistoryCpu] = useState<number[]>([]);
  const [historyMem, setHistoryMem] = useState<number[]>([]);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchResources = async () => {
    if (paused) return;
    try {
      const res = await serverApi.getSystemResources();
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
        setHistoryCpu((prev) => {
          const next = [...prev, res.data!.process_cpu_usage_percent].slice(-MAX_SAMPLES);
          return next;
        });
        setHistoryMem((prev) => {
          const next = [...prev, res.data!.process_memory_mb].slice(-MAX_SAMPLES);
          return next;
        });
      } else {
        setError(t('settingsMenu.maintenance.resources.unavailableOrOldBackend'));
      }
    } catch {
      setError(t('settingsMenu.maintenance.resources.unavailableOrOldBackend'));
    }
  };

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    fetchResources();
    intervalRef.current = setInterval(fetchResources, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused]);

  const d = data;
  const maxCpu = Math.max(100, ...historyCpu, 1);
  const maxMem = Math.max(1, ...historyMem, 1);
  const sysMemTotal = d?.system_memory_total_mb ?? 0;
  const sysMemUsed = d?.system_memory_used_mb ?? 0;
  const sysMemPct = sysMemTotal > 0 ? (sysMemUsed / sysMemTotal) * 100 : null;

  // Pistes d'amélioration si consommation élevée au repos
  const highCpuIdle = (d?.process_cpu_usage_percent ?? 0) > 30 && historyCpu.length > 10;
  const avgCpu = historyCpu.length ? historyCpu.reduce((a, b) => a + b, 0) / historyCpu.length : 0;
  const highCpuSustained = avgCpu > 20;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-1">
        <TrendingUp className="w-5 h-5 text-amber-400" />
        {t('settingsMenu.maintenance.resourcesMonitorDev.title')}
      </h3>
      <p className="text-xs text-amber-200/80 mb-4">
        {t('settingsMenu.maintenance.resourcesMonitorDev.description')}
      </p>
      {error && (
        <p className="text-sm text-red-400 mb-3">{error}</p>
      )}
      {d && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              <span className="text-gray-300">
                {t('settingsMenu.maintenance.resources.processCpu')}:{' '}
                <strong className="text-white">{d.process_cpu_usage_percent.toFixed(1)} %</strong>
              </span>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="ml-2 text-xs px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
              >
                {paused ? t('settingsMenu.maintenance.resourcesMonitorDev.resume') : t('settingsMenu.maintenance.resourcesMonitorDev.pause')}
              </button>
            </div>
            {historyCpu.length >= 2 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{t('settingsMenu.maintenance.resourcesMonitorDev.cpuHistory')}</span>
                <Sparkline values={historyCpu} maxVal={maxCpu} color="rgb(34 197 94)" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              <span className="text-gray-300">
                {t('settingsMenu.maintenance.resources.processMemory')}:{' '}
                <strong className="text-white">{d.process_memory_mb.toFixed(1)} Mo</strong>
              </span>
            </div>
            {historyMem.length >= 2 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">{t('settingsMenu.maintenance.resourcesMonitorDev.memoryHistory')}</span>
                <Sparkline values={historyMem} maxVal={maxMem} color="rgb(59 130 246)" />
              </div>
            )}
            {sysMemTotal > 0 && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {t('settingsMenu.maintenance.resources.systemMemory')}:{' '}
                  <strong className="text-white">
                    {sysMemUsed.toFixed(0)} / {sysMemTotal.toFixed(0)} Mo
                    {sysMemPct != null ? ` (${sysMemPct.toFixed(0)} %)` : ''}
                  </strong>
                </span>
              </div>
            )}
          </div>
          {(highCpuIdle || highCpuSustained) && (
            <div className="rounded-lg bg-amber-500/20 border border-amber-500/40 p-3 text-sm text-amber-100">
              <p className="font-medium mb-1">{t('settingsMenu.maintenance.resourcesMonitorDev.tipsTitle')}</p>
              <ul className="list-disc list-inside text-amber-200/90 space-y-0.5">
                {highCpuIdle && <li>{t('settingsMenu.maintenance.resourcesMonitorDev.tipSyncInterval')}</li>}
                {highCpuSustained && <li>{t('settingsMenu.maintenance.resourcesMonitorDev.tipLibraryScan')}</li>}
                <li>{t('settingsMenu.maintenance.resourcesMonitorDev.tipStartupScan')}</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
