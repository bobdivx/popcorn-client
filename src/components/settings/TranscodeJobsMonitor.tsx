import { Activity, Cpu, HardDrive, Trash2, AlertCircle } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { TranscodeJobsResponse, TranscodeJob } from '../../lib/client/server-api';
import { useConfirmDialog } from '../ui/useConfirmDialog';

const POLL_INTERVAL_MS = 5_000; // 5 secondes pour un monitoring réactif

interface TranscodeJobsMonitorProps {
  embedded?: boolean;
}

export default function TranscodeJobsMonitor({ embedded = false }: TranscodeJobsMonitorProps) {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<TranscodeJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [killingJobId, setKillingJobId] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchJobs = async (force = false) => {
    if (paused && !force) return;
    try {
      // Utiliser getTranscodeStatus (endpoint préféré qui contient jobs + resources + warning)
      const res = await serverApi.getTranscodeStatus();
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.message || t('settingsMenu.maintenance.transcodeJobs.loadError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.maintenance.transcodeJobs.loadError'));
    } finally {
      setLoading(false);
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
    fetchJobs();
    intervalRef.current = setInterval(fetchJobs, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused]);

  const handleKillJob = async (job: TranscodeJob) => {
    if (killingJobId) return;
    
    const confirmed = await confirm({
      title: t('settingsMenu.maintenance.transcodeJobs.killJob'),
      message: t('settingsMenu.maintenance.transcodeJobs.killJobConfirm'),
      danger: true,
    });

    if (!confirmed) return;

    setKillingJobId(job.id);
    try {
      const res = await serverApi.killTranscodeJob(job.id);
      if (res.success) {
        // Rafraîchir immédiatement
        await fetchJobs(true);
      } else {
        setError(res.message || t('settingsMenu.maintenance.transcodeJobs.killJobError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.maintenance.transcodeJobs.killJobError'));
    } finally {
      setKillingJobId(null);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatJobType = (type: string): string => {
    const key = `settingsMenu.maintenance.transcodeJobs.type${type}` as any;
    return t(key) || type;
  };

  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const wrap = (content: import('preact').ComponentChildren) =>
    embedded ? (
      <div className="min-w-0">{content}</div>
    ) : (
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Activity className="w-5 h-5 text-primary-400" />
          {t('settingsMenu.maintenance.transcodeJobs.title')}
        </h3>
        {content}
      </section>
    );

  if (loading && !data) {
    return wrap(<p className="text-sm ds-text-secondary">{t('common.loading')}</p>);
  }

  if (error && !data) {
    return wrap(
      <>
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          type="button"
          onClick={() => fetchJobs(true)}
          className="btn btn-primary"
          data-focusable
          tabIndex={0}
        >
          {t('common.retry')}
        </button>
      </>
    );
  }

  const jobs = data?.jobs || [];
  const resources = data?.resources;

  return wrap(
    <>
      <p className="text-sm ds-text-secondary mb-4">
        {t('settingsMenu.maintenance.transcodeJobs.description')}
      </p>

      {/* Contrôles */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="btn btn-sm btn-ghost"
          data-focusable
          tabIndex={0}
        >
          {paused ? t('common.resume') : t('common.pause')}
        </button>
        <button
          type="button"
          onClick={() => fetchJobs(true)}
          className="btn btn-sm btn-ghost"
          data-focusable
          tabIndex={0}
        >
          {t('settingsMenu.maintenance.transcodeJobs.refresh')}
        </button>
        <span className="text-xs text-gray-400">
          {t('settingsMenu.maintenance.transcodeJobs.jobsCount', { count: jobs.length })}
        </span>
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {/* Ressources système */}
      {resources && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 mb-4">
          <p className="text-sm font-semibold text-white mb-2">
            {t('settingsMenu.maintenance.transcodeJobs.resourcesTitle')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {resources.load_avg_1min != null && (
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {t('settingsMenu.maintenance.transcodeJobs.loadAvg')}:{' '}
                  <strong className="text-white">{resources.load_avg_1min.toFixed(2)}</strong>
                </span>
              </div>
            )}
            {resources.cpu_percent != null && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {t('settingsMenu.maintenance.transcodeJobs.cpuUsage')}:{' '}
                  <strong className="text-white">{resources.cpu_percent.toFixed(1)} %</strong>
                </span>
              </div>
            )}
            {resources.memory_used_mb != null && resources.memory_total_mb != null && (
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {t('settingsMenu.maintenance.transcodeJobs.memoryUsage')}:{' '}
                  <strong className="text-white">
                    {resources.memory_used_mb.toFixed(0)} / {resources.memory_total_mb.toFixed(0)} Mo
                  </strong>
                </span>
              </div>
            )}
            {resources.gpu_available != null && (
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <span className="text-gray-300">
                  {t('settingsMenu.maintenance.transcodeJobs.gpuStatus')}:{' '}
                  <strong className={resources.gpu_available ? 'text-green-400' : 'text-amber-400'}>
                    {resources.gpu_available ? t('common.available') : t('settingsMenu.maintenance.resources.gpuNotAvailable')}
                  </strong>
                </span>
              </div>
            )}
          </div>
          {resources.heavy_transcode_warning && (
            <div className="mt-3 p-2 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-300 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200">
                {t('settingsMenu.maintenance.transcodeWarning.details')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Liste des jobs */}
      {jobs.length === 0 ? (
        <p className="text-sm ds-text-secondary italic">
          {t('settingsMenu.maintenance.transcodeJobs.noJobs')}
        </p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className={`rounded-lg border p-3 transition-colors ${
                job.is_cpu_intensive
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white truncate text-sm" title={job.file_name}>
                    {job.file_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                    <span>
                      <strong className="text-gray-300">{t('settingsMenu.maintenance.transcodeJobs.jobType')}:</strong>{' '}
                      {formatJobType(job.job_type)}
                    </span>
                    <span>
                      <strong className="text-gray-300">{t('settingsMenu.maintenance.transcodeJobs.encoder')}:</strong>{' '}
                      {job.encoder}
                    </span>
                    <span>
                      <strong className="text-gray-300">{t('settingsMenu.maintenance.transcodeJobs.duration')}:</strong>{' '}
                      {formatDuration(job.duration_seconds)}
                    </span>
                    <span>
                      <strong className="text-gray-300">{t('settingsMenu.maintenance.transcodeJobs.started')}:</strong>{' '}
                      {formatTimestamp(job.started_at)}
                    </span>
                  </div>
                  {job.is_cpu_intensive && (
                    <span className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 text-xs font-medium">
                      <AlertCircle className="w-3 h-3" />
                      {t('settingsMenu.maintenance.transcodeJobs.cpuIntensive')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleKillJob(job)}
                  disabled={killingJobId === job.id}
                  className="btn btn-sm btn-ghost text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  aria-label={t('settingsMenu.maintenance.transcodeJobs.killJob')}
                  data-focusable
                  tabIndex={0}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </>
  );
}
