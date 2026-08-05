import { useState, useEffect } from 'preact/hooks';
import { isTauri } from '../../lib/utils/tauri';
import { useI18n } from '../../lib/i18n/useI18n';
import { checkDockerUpdates, type DockerUpdateCheckResult } from '../../lib/services/docker-update-checker';
import { serverApi } from '../../lib/client/server-api';
import { notificationService } from '../../lib/services/notification-service';

interface VersionData {
  client?: {
    version?: string;
    build?: number;
    gitSha?: string;
    channel?: string;
  };
  backend?: {
    version?: string;
    build?: number;
    gitSha?: string;
    channel?: string;
  };
}

export default function VersionInfo() {
  const { t } = useI18n();
  const [versions, setVersions] = useState<VersionData>({});
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>('web');
  const [updateCheck, setUpdateCheck] = useState<DockerUpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadVersions = async () => {
      try {
        let detectedPlatform = 'web';
        if (isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const platformResult = await invoke<string>('get-platform').catch(() => null);
            if (platformResult) detectedPlatform = platformResult;
          } catch {
            /* ignore */
          }
        }
        setPlatform(detectedPlatform);

        try {
          const versionResponse = await fetch('/VERSION.json');
          if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            setVersions((prev) => ({
              ...prev,
              client: versionData.client,
            }));
          }
        } catch {
          /* ignore */
        }

        try {
          const healthResponse = await serverApi.checkServerHealth();
          if (healthResponse.success && healthResponse.data) {
            const healthData = healthResponse.data as any;
            if (healthData.version || healthData.build || healthData.git_sha) {
              setVersions((prev) => ({
                ...prev,
                backend: {
                  version: healthData.version,
                  build: healthData.build,
                  gitSha: healthData.git_sha,
                  channel: healthData.channel,
                },
              }));
            }
          }
        } catch {
          /* ignore */
        }
      } catch (error) {
        console.error('Erreur lors du chargement des versions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, []);

  const runUpdateCheck = async () => {
    setCheckingUpdates(true);
    try {
      const result = await checkDockerUpdates(versions);
      setUpdateCheck(result);
      if (result.clientUpdate || result.serverUpdate) {
        const msg =
          result.clientUpdate && result.serverUpdate
            ? t('versionInfo.updateAvailableBoth', {
                clientLatest: result.clientUpdate.latest,
                serverLatest: result.serverUpdate.latest,
              })
            : result.clientUpdate
              ? t('versionInfo.updateAvailableClient', {
                  current: result.clientUpdate.current,
                  latest: result.clientUpdate.latest,
                })
              : t('versionInfo.updateAvailableServer', {
                  current: result.serverUpdate!.current,
                  latest: result.serverUpdate!.latest,
                });
        notificationService.notifyUpdateAvailable(msg);
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    if (loading || (!versions.client?.version && !versions.backend?.version)) return;
    void runUpdateCheck();
  }, [loading, versions.client?.version, versions.backend?.version, versions.backend?.gitSha]);

  const onApplyUpdate = async () => {
    if (!updateCheck?.canUpdateInApp) return;
    if (!confirm(t('versionInfo.updateConfirm'))) return;
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const res = await serverApi.startDockerUpdate();
      if (res.success && res.data) {
        setUpdateMsg(res.data.message || t('versionInfo.updateStarted'));
      } else {
        setUpdateMsg(res.error || t('versionInfo.updateError'));
      }
    } catch (e: any) {
      setUpdateMsg(e?.message || t('versionInfo.updateError'));
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-white">Versions</h3>
        <p class="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  const hasClientUpdate = Boolean(updateCheck?.clientUpdate);
  const hasServerUpdate = Boolean(updateCheck?.serverUpdate);
  const updateMessage =
    hasClientUpdate && hasServerUpdate
      ? t('versionInfo.updateAvailableBoth', {
          clientLatest: updateCheck!.clientUpdate!.latest,
          serverLatest: updateCheck!.serverUpdate!.latest,
        })
      : hasClientUpdate
        ? t('versionInfo.updateAvailableClient', {
            current: updateCheck!.clientUpdate!.current,
            latest: updateCheck!.clientUpdate!.latest,
          })
        : hasServerUpdate
          ? t('versionInfo.updateAvailableServer', {
              current: updateCheck!.serverUpdate!.current,
              latest: updateCheck!.serverUpdate!.latest,
            })
          : null;

  const fmt = (v?: { version?: string; build?: number; gitSha?: string; channel?: string }) => {
    if (!v?.version) return null;
    const build = v.build != null ? `+${v.build}` : '';
    const sha = v.gitSha ? ` · ${v.gitSha.slice(0, 7)}` : '';
    const ch = v.channel ? ` · ${v.channel}` : '';
    return `v${v.version}${build}${sha}${ch}`;
  };

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white">Versions</h3>
      {checkingUpdates && (
        <p class="text-xs text-gray-500">{t('versionInfo.checkingUpdates')}</p>
      )}
      {(hasClientUpdate || hasServerUpdate) && updateMessage && (
        <div class="alert alert-info shadow-lg text-sm py-3">
          <div class="w-full space-y-2">
            <h4 class="font-semibold">{t('versionInfo.updateAvailable')}</h4>
            <p class="text-xs mt-1">{updateMessage}</p>
            {updateCheck?.canUpdateInApp ? (
              <button
                type="button"
                class="btn btn-primary btn-sm mt-2"
                disabled={updating}
                onClick={onApplyUpdate}
                data-focusable
              >
                {updating ? t('versionInfo.updating') : t('versionInfo.updateNow')}
              </button>
            ) : (
              <p class="text-xs mt-2 opacity-90">
                {updateCheck?.updateDisabledReason || t('versionInfo.dockerInstructions')}
              </p>
            )}
            {updateMsg && <p class="text-xs mt-2 text-white/80">{updateMsg}</p>}
          </div>
        </div>
      )}
      {!hasClientUpdate && !hasServerUpdate && !checkingUpdates && (
        <p class="text-xs text-green-400/90">{t('versionInfo.upToDate')}</p>
      )}
      <div class="space-y-3 text-sm">
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-3">
            <span class="text-gray-400">Client ({platform})</span>
            {fmt(versions.client) ? (
              <span class="font-mono font-semibold text-white text-right text-xs sm:text-sm">
                {fmt(versions.client)}
              </span>
            ) : (
              <span class="text-xs text-gray-500">Version non disponible</span>
            )}
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-3">
            <span class="text-gray-400">Backend</span>
            {fmt(versions.backend) ? (
              <span class="font-mono font-semibold text-white text-right text-xs sm:text-sm">
                {fmt(versions.backend)}
              </span>
            ) : (
              <span class="text-xs text-gray-500 italic">Non connecté</span>
            )}
          </div>
        </div>

        <div class="text-xs text-gray-500 space-y-1 pt-2">
          <p>
            {platform === 'android' && 'Application Android'}
            {platform === 'windows' && 'Application Windows'}
            {platform === 'linux' && 'Application Linux'}
            {platform === 'macos' && 'Application macOS'}
            {platform === 'web' && 'Application Web'}
          </p>
          {versions.backend ? (
            <p class="text-green-400">✓ Backend connecté</p>
          ) : (
            <p class="text-yellow-400">⚠ Backend non accessible</p>
          )}
          <button
            type="button"
            class="btn btn-ghost btn-xs mt-1"
            onClick={() => void runUpdateCheck()}
            disabled={checkingUpdates}
          >
            {t('versionInfo.recheck')}
          </button>
        </div>
      </div>
    </div>
  );
}
