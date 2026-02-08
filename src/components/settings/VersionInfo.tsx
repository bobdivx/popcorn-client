import { useState, useEffect } from 'preact/hooks';
import { isTauri } from '../../lib/utils/tauri';
import { useI18n } from '../../lib/i18n/useI18n';
import { checkDockerUpdates, type DockerUpdateCheckResult } from '../../lib/services/docker-update-checker';

interface VersionData {
  client?: {
    version?: string;
    build?: number;
  };
  backend?: {
    version?: string;
    build?: number;
  };
}

export default function VersionInfo() {
  const { t } = useI18n();
  const [versions, setVersions] = useState<VersionData>({});
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>('web');
  const [updateCheck, setUpdateCheck] = useState<DockerUpdateCheckResult | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    const loadVersions = async () => {
      try {
        // Détecter la plateforme
        let detectedPlatform = 'web';
        if (isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const platformResult = await invoke<string>('get-platform').catch(() => null);
            if (platformResult) {
              detectedPlatform = platformResult;
            }
          } catch {
            // Ignore
          }
        }
        setPlatform(detectedPlatform);

        // Ordre de priorité pour récupérer la version client :
        // 1. VERSION.json (copié dans public/ par copy-version.js) - source de vérité après build
        // 2. Tauri get-app-version (pour Android/Desktop) - lit depuis tauri.conf.json synchronisé avec VERSION.json
        // 3. import.meta.env (variables injectées pendant le build) - fallback
        let clientVersionLoaded = false;
        
        // 1. Essayer VERSION.json depuis public/ (disponible après build)
        try {
          const versionResponse = await fetch('/VERSION.json');
          if (versionResponse.ok) {
            const versionData = await versionResponse.json();
            setVersions((prev) => ({
              ...prev,
              client: versionData.client,
            }));
            clientVersionLoaded = true;
          }
        } catch {
          // Ignore, on essaiera les autres méthodes
        }

        // 2. Pour Tauri (Android/Desktop), récupérer depuis la config Tauri
        // Cette version est synchronisée avec VERSION.json pendant le build GitHub Actions
        if (!clientVersionLoaded && isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const tauriVersion = await invoke<string>('get-app-version').catch(() => null);
            if (tauriVersion) {
              // Pour le build number, essayer de récupérer depuis VERSION.json si disponible
              // Sinon, on n'affiche que la version
              let buildNumber: number | undefined = undefined;
              try {
                const versionResponse = await fetch('/VERSION.json');
                if (versionResponse.ok) {
                  const versionData = await versionResponse.json();
                  buildNumber = versionData.client?.build;
                }
              } catch {
                // Ignore
              }
              
              setVersions((prev) => ({
                ...prev,
                client: {
                  version: tauriVersion,
                  build: buildNumber,
                },
              }));
              clientVersionLoaded = true;
            }
          } catch {
            // Ignore
          }
        }

        // 3. Fallback : variables d'environnement injectées pendant le build
        if (!clientVersionLoaded) {
          const envVersion = (import.meta as any).env?.PUBLIC_APP_VERSION;
          const envBuild = (import.meta as any).env?.PUBLIC_APP_VERSION_CODE;
          if (envVersion) {
            setVersions((prev) => ({
              ...prev,
              client: {
                version: envVersion,
                build: envBuild ? parseInt(envBuild, 10) : undefined,
              },
            }));
            clientVersionLoaded = true;
          }
        }

        // Charger la version du backend depuis l'API health
        try {
          const healthResponse = await serverApi.checkServerHealth();
          if (healthResponse.success && healthResponse.data) {
            // L'API health retourne maintenant version et build
            const healthData = healthResponse.data as any;
            if (healthData.version || healthData.build) {
              setVersions((prev) => ({
                ...prev,
                backend: {
                  version: healthData.version,
                  build: healthData.build,
                },
              }));
            }
          }
        } catch {
          // Backend non accessible, ne pas afficher d'erreur
        }
      } catch (error) {
        console.error('Erreur lors du chargement des versions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadVersions();
  }, []);

  // Vérifier les mises à jour Docker (client / backend) une fois les versions chargées
  useEffect(() => {
    if (loading || (!versions.client?.version && !versions.backend?.version)) return;
    let cancelled = false;
    setCheckingUpdates(true);
    checkDockerUpdates(versions)
      .then((result) => {
        if (!cancelled && (result.clientUpdate || result.serverUpdate)) {
          setUpdateCheck(result);
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingUpdates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, versions.client?.version, versions.backend?.version]);

  if (loading) {
    return (
      <div class="space-y-4">
        <h3 class="text-lg font-semibold text-white">Versions</h3>
        <p class="text-sm text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  const hasClientUpdate = updateCheck?.clientUpdate;
  const hasServerUpdate = updateCheck?.serverUpdate;
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

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold text-white">Versions</h3>
      {checkingUpdates && (
        <p class="text-xs text-gray-500">{t('versionInfo.checkingUpdates')}</p>
      )}
      {(hasClientUpdate || hasServerUpdate) && updateMessage && (
        <div class="alert alert-info shadow-lg text-sm py-3">
          <div>
            <h4 class="font-semibold">{t('versionInfo.updateAvailable')}</h4>
            <p class="text-xs mt-1">{updateMessage}</p>
            <p class="text-xs mt-2 opacity-90">{t('versionInfo.dockerInstructions')}</p>
          </div>
        </div>
      )}
      <div class="space-y-3 text-sm">
        {/* Version Client */}
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Client ({platform})</span>
            {versions.client?.version && (
              <span class="font-mono font-semibold text-white">
                v{versions.client.version}
              </span>
            )}
          </div>
          {!versions.client && (
            <span class="text-xs text-gray-500">Version non disponible</span>
          )}
        </div>

        {/* Version Backend */}
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-gray-400">Backend</span>
            {versions.backend?.version ? (
              <span class="font-mono font-semibold text-white">
                v{versions.backend.version}
              </span>
            ) : (
              <span class="text-xs text-gray-500 italic">Non connecté</span>
            )}
          </div>
        </div>

        {/* Informations supplémentaires */}
        <div class="text-xs text-gray-500 space-y-1 pt-2">
          <p>
            {platform === 'android' && 'Application Android'}
            {platform === 'windows' && 'Application Windows'}
            {platform === 'linux' && 'Application Linux'}
            {platform === 'macos' && 'Application macOS'}
            {platform === 'web' && 'Application Web'}
          </p>
          {versions.backend && (
            <p class="text-green-400">✓ Backend connecté</p>
          )}
          {!versions.backend && (
            <p class="text-yellow-400">⚠ Backend non accessible</p>
          )}
        </div>
      </div>
    </div>
  );
}
