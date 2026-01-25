import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { isTauri } from '../../lib/utils/tauri';

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
  const [versions, setVersions] = useState<VersionData>({});
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState<string>('web');

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

  if (loading) {
    return (
      <div class="card bg-base-200 shadow-lg">
        <div class="card-body">
          <h2 class="card-title">Versions</h2>
          <p class="text-sm text-gray-400">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="card bg-base-200 shadow-lg">
      <div class="card-body">
        <h2 class="card-title">Versions</h2>
        <div class="space-y-3 text-sm">
          {/* Version Client */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Client ({platform})</span>
              <div class="flex items-center gap-2">
                {versions.client?.version && (
                  <span class="font-mono font-semibold text-white">
                    v{versions.client.version}
                  </span>
                )}
                {versions.client?.build && (
                  <span class="text-xs text-gray-500">
                    (build {versions.client.build})
                  </span>
                )}
              </div>
            </div>
            {!versions.client && (
              <span class="text-xs text-gray-500">Version non disponible</span>
            )}
          </div>

          {/* Version Backend */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Backend</span>
              <div class="flex items-center gap-2">
                {versions.backend?.version ? (
                  <>
                    <span class="font-mono font-semibold text-white">
                      v{versions.backend.version}
                    </span>
                    {versions.backend?.build && (
                      <span class="text-xs text-gray-500">
                        (build {versions.backend.build})
                      </span>
                    )}
                  </>
                ) : (
                  <span class="text-xs text-gray-500 italic">Non connecté</span>
                )}
              </div>
            </div>
          </div>

          {/* Séparateur */}
          {(versions.client || versions.backend) && (
            <div class="divider my-2"></div>
          )}

          {/* Informations supplémentaires */}
          <div class="text-xs text-gray-500 space-y-1">
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
    </div>
  );
}
