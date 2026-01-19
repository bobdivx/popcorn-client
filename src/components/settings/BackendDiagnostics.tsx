import { useEffect, useMemo, useState } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { getBackendUrl } from '../../lib/backend-config';
import { isTauri } from '../../lib/utils/tauri';
import { validateInvitationCloud, getPopcornWebApiUrl } from '../../lib/api/popcorn-web';

type Row = {
  name: string;
  ok: boolean;
  status?: number;
  ms?: number;
  url?: string;
  message?: string;
};

const STORAGE_DIAG_ON_BOOT = 'popcorn_diagnostics_on_boot';
const STORAGE_DIAG_ALT_IP = 'popcorn_diagnostics_alt_ip';

export default function BackendDiagnostics() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string>('');
  const [copyMsg, setCopyMsg] = useState<string>('');
  const [runOnBoot, setRunOnBoot] = useState<boolean>(false);
  const [altBackendUrl, setAltBackendUrl] = useState<string>('http://10.0.2.2:3000');

  const backendUrl = (() => {
    try {
      return getBackendUrl();
    } catch {
      return '';
    }
  })();

  const envInfo = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const android = /Android/i.test(ua);
    const tauri = isTauri();
    let userId: string | null = null;
    try {
      const raw = localStorage.getItem('popcorn_user');
      if (raw) {
        const u = JSON.parse(raw);
        const id = u?.id || u?.user?.id;
        if (typeof id === 'string' && id.trim()) userId = id;
      }
    } catch {
      // ignore
    }

    return {
      ts: new Date().toISOString(),
      href: typeof window !== 'undefined' ? window.location.href : '',
      backendUrl,
      tauri,
      android,
      userId,
      userAgent: ua,
    };
  }, [backendUrl]);

  const setDiagOnBoot = (enabled: boolean) => {
    try {
      localStorage.setItem(STORAGE_DIAG_ON_BOOT, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    setRunOnBoot(enabled);
  };

  const setAltBackendUrlAndSave = (url: string) => {
    setAltBackendUrl(url);
    try {
      localStorage.setItem(STORAGE_DIAG_ALT_IP, url);
    } catch {
      // ignore
    }
  };

  const run = async () => {
    setRunning(true);
    setCopyMsg('');
    try {
      const started = Date.now();
      const out: Row[] = [];

      const timed = async (name: string, fn: () => Promise<any>, url?: string) => {
        const t0 = Date.now();
        try {
          const res = await fn();
          const ms = Date.now() - t0;
          const row: Row = {
            name,
            ok: !!res?.success,
            ms,
            message: res?.message || res?.error,
          };
          if (url) row.url = url;
          if (res?.status) row.status = res.status;
          out.push(row);
        } catch (e) {
          const ms = Date.now() - t0;
          
          // Construire un message d'erreur détaillé
          let errorMessage = '';
          if (e instanceof Error) {
            errorMessage = `${e.name}: ${e.message}`;
            // Pour les erreurs réseau spécifiques, ajouter plus de contexte
            if (e.name === 'TypeError' && e.message.includes('fetch')) {
              if (e.message.includes('Failed to fetch')) {
                errorMessage = `Erreur réseau: Failed to fetch (peut être CORS, DNS, ou connexion refusée)`;
              } else {
                errorMessage = `Erreur réseau (TypeError): ${e.message}`;
              }
            } else if (e.name === 'AbortError') {
              errorMessage = `Timeout: ${e.message}`;
            }
          } else {
            errorMessage = String(e);
          }
          
          const row: Row = {
            name,
            ok: false,
            ms,
            message: errorMessage,
          };
          if (url) row.url = url;
          
          out.push(row);
        }
      };

      // Fonction helper pour tester un endpoint avec une URL backend spécifique
      const testEndpoint = async (baseUrl: string, endpoint: string, method: string = 'GET', body?: any) => {
        const url = `${baseUrl.replace(/\/$/, '')}${endpoint}`;
        const options: RequestInit = {
          method,
          headers: { 'Content-Type': 'application/json' },
        };
        if (body) {
          options.body = JSON.stringify(body);
        }
        
        // En Tauri, utiliser native-fetch si disponible, sinon plugin-http en fallback
        if (isTauri()) {
          const headerPairs: Array<[string, string]> = [];
          Object.entries(options.headers as Record<string, string>).forEach(([k, v]) => {
            headerPairs.push([k, v]);
          });
          
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            
            // #region agent log
            try {
              await invoke('log-message', { 
                message: `[diag-debug] Attempting native-fetch: url=${url}, method=${options.method || 'GET'}` 
              });
            } catch {}
            // #endregion
            
            // Essayer native-fetch d'abord
            try {
              const res: any = await invoke('native-fetch', {
                url,
                method: options.method || 'GET',
                headers: headerPairs,
                body: options.body,
                timeoutMs: 5000,
              } as any);
              
              // #region agent log
              try {
                await invoke('log-message', { 
                  message: `[diag-debug] native-fetch success: status=${res?.status}, ok=${res?.ok}` 
                });
              } catch {}
              // #endregion
              
              return {
                success: res?.ok !== false && (res?.status === 200 || res?.status === 401),
                status: res?.status,
                message: res?.ok === false ? `HTTP ${res?.status}` : null,
              };
            } catch (invokeError: any) {
              // Si native-fetch n'est pas disponible, utiliser plugin-http
              const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
              const errorStr = errorMsg.toLowerCase();
              const errorName = invokeError instanceof Error ? invokeError.name : '';
              
              // #region agent log
              // Log pour débogage
              try {
                const { invoke: logInvoke } = await import('@tauri-apps/api/core');
                await logInvoke('log-message', { 
                  message: `[diag-debug] native-fetch error: name=${errorName}, msg=${errorMsg}, str=${errorStr}, full=${JSON.stringify(invokeError)}` 
                });
              } catch {
                // ignore
              }
              // #endregion
              
              // Détection robuste de l'erreur "command not found"
              const isCommandNotFound = 
                errorStr.includes('not found') || 
                errorStr.includes('command') && (errorStr.includes('native-fetch') || errorStr.includes('not found')) ||
                errorStr.includes('unknown command') ||
                errorName === 'CommandNotFound' ||
                errorName === 'TauriError' && errorStr.includes('not found');
              
              if (isCommandNotFound) {
                // Fallback vers plugin-http
                try {
                  const { invoke: logInvoke } = await import('@tauri-apps/api/core');
                  await logInvoke('log-message', { 
                    message: `[diag-debug] Using plugin-http fallback for ${url}` 
                  });
                } catch {
                  // ignore
                }
                
                const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
                const httpResponse = await httpFetch(url, {
                  method: options.method as any,
                  headers: Object.fromEntries(headerPairs),
                  body: options.body,
                } as any);
                
                const responseBody = httpResponse.text ? await httpResponse.text() : '';
                
                try {
                  const { invoke: logInvoke } = await import('@tauri-apps/api/core');
                  await logInvoke('log-message', { 
                    message: `[diag-debug] plugin-http response: status=${httpResponse.status}, ok=${httpResponse.ok}` 
                  });
                } catch {
                  // ignore
                }
                
                return {
                  success: httpResponse.ok || httpResponse.status === 401,
                  status: httpResponse.status,
                  message: httpResponse.ok ? null : `HTTP ${httpResponse.status}`,
                };
              }
              
              // Si ce n'est pas une erreur "not found", re-lancer l'erreur
              throw invokeError;
            }
          } catch (e) {
            // Erreur générale
            throw e;
          }
        }
        
        // En mode navigateur, utiliser fetch standard
        const response = await fetch(url, options);
        const data = await response.json().catch(() => ({}));
        return {
          success: response.ok || response.status === 401, // 401 = auth manquante mais serveur répond
          status: response.status,
          message: response.ok ? null : `HTTP ${response.status}: ${JSON.stringify(data)}`,
        };
      };

      // Tester avec l'URL configurée
      const backendBase = backendUrl || 'http://127.0.0.1:3000';
      const testWithUrl = async (baseUrl: string, label: string) => {
        await timed(`${label} - health (/api/client/health)`, () => testEndpoint(baseUrl, '/api/client/health'), `${baseUrl}/api/client/health`);
        await timed(`${label} - torrents FILM (/api/torrents/list)`, () => testEndpoint(baseUrl, '/api/torrents/list', 'POST', { category: 'FILM' }), `${baseUrl}/api/torrents/list`);
        await timed(`${label} - torrents SERIES (/api/torrents/list)`, () => testEndpoint(baseUrl, '/api/torrents/list', 'POST', { category: 'SERIES' }), `${baseUrl}/api/torrents/list`);
        await timed(`${label} - library (/library)`, () => testEndpoint(baseUrl, '/library'), `${baseUrl}/library`);
        await timed(`${label} - indexers (/api/client/admin/indexers)`, () => testEndpoint(baseUrl, '/api/client/admin/indexers'), `${baseUrl}/api/client/admin/indexers`);
      };

      // Tester avec l'URL principale
      await testWithUrl(backendBase, `Backend (${backendBase})`);
      
      // Tester avec l'URL alternative si différente
      const altBase = altBackendUrl.trim() || 'http://10.0.2.2:3000';
      if (altBase !== backendBase) {
        await testWithUrl(altBase, `Backend Alt (${altBase})`);
      }
      const popcornWebUrl = (() => {
        try {
          return `${getPopcornWebApiUrl()}/invitations/validate`;
        } catch {
          return 'unknown';
        }
      })();
      
      await timed('popcorn-web (invitations/validate)', async () => {
        // Utiliser validateInvitationCloud qui utilise requestJson
        // En Tauri (Android/Desktop): native-fetch contourne CORS
        // En mode navigateur web: fetch standard (popcorn-web doit autoriser CORS)
        try {
          const apiUrl = getPopcornWebApiUrl();
          const fullUrl = `${apiUrl}/invitations/validate`;
          
          // Tester d'abord avec validateInvitationCloud (utilise requestJson qui gère Tauri)
          const result = await validateInvitationCloud('__ping__');
          
          // Si result existe (même si isValid=false), c'est que l'API a répondu → test OK
          if (result !== null) {
            return { success: true };
          }
          
          // Si result est null, tester directement avec fetch pour diagnostiquer
          // Cela nous dira si c'est CORS, réseau, ou autre chose
          try {
            const testRes = await fetch(fullUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: '__ping__' }),
            });
            
            // Si on arrive ici, pas d'erreur CORS → l'API a répondu
            const data = await testRes.json().catch(() => ({}));
            return { 
              success: testRes.ok,
              message: testRes.ok ? null : `API répond avec erreur ${testRes.status}: ${JSON.stringify(data)}`
            };
          } catch (fetchError) {
            // Erreur fetch (CORS, réseau, timeout, etc.)
            const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
            const isCorsError = errorMsg.includes('Failed to fetch') ||
                               errorMsg.includes('CORS') ||
                               errorMsg.includes('NetworkError') ||
                               (fetchError instanceof TypeError && fetchError.message.includes('fetch'));
            
            if (isCorsError) {
              return {
                success: false,
                message: `CORS bloque l'accès à popcorn-web en mode navigateur. popcorn-web doit configurer CORS pour autoriser les requêtes depuis ${window.location.origin}. En Android, native-fetch contourne CORS donc ça fonctionnera.`
              };
            }
            
            return {
              success: false,
              message: `Erreur réseau: ${errorMsg}`
            };
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          return { 
            success: false,
            message: `Erreur: ${errorMsg}`
          };
        }
      }, popcornWebUrl);

      // Calculer le résumé : popcorn-web peut échouer en mode navigateur (CORS) mais ce n'est pas bloquant
      // En Tauri Android, native-fetch contourne CORS et ça fonctionnera
      const criticalTests = out.filter((r) => !r.name.includes('popcorn-web'));
      const allCriticalOk = criticalTests.every((r) => r.ok);
      const popcornWebTest = out.find((r) => r.name.includes('popcorn-web'));
      
      out.unshift({
        name: `Résumé`,
        ok: allCriticalOk, // popcorn-web n'est pas critique pour le résumé
        ms: Date.now() - started,
        message: allCriticalOk 
          ? (popcornWebTest && !popcornWebTest.ok 
              ? 'OK (popcorn-web non testable en mode navigateur, fonctionnera en Android)'
              : 'OK')
          : 'Au moins un test critique a échoué',
      });

      setRows(out);

      // Collecter les logs de débogage si disponibles (en Tauri)
      let debugLogs: string[] = [];
      try {
        if (isTauri()) {
          // Les logs sont dans logcat, mais on peut essayer de les récupérer
          // Pour l'instant, on note juste qu'on est en Tauri
          debugLogs = ['Logs disponibles via: adb logcat | grep popcorn-debug'];
        }
      } catch {
        // ignore
      }

      const reportObj = {
        kind: 'popcorn-android-diagnostics',
        ...envInfo,
        durationMs: Date.now() - started,
        results: out.map((r) => ({
          name: r.name,
          ok: r.ok,
          ms: r.ms ?? null,
          url: r.url ?? null,
          status: r.status ?? null,
          message: r.message ?? null,
        })),
        debugInfo: {
          note: 'Pour les logs détaillés en Tauri Android, utilisez: adb logcat | grep popcorn-debug',
          tauri: envInfo.tauri,
          android: envInfo.android,
        },
      };
      setReport(JSON.stringify(reportObj, null, 2));

      // En Tauri (Android/Desktop), pousser le rapport dans les logs natifs
      // pour pouvoir le récupérer via adb logcat.
      try {
        if (isTauri()) {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('log-message', { message: `[popcorn-diagnostics]\n${JSON.stringify(reportObj, null, 2)}` });
        }
      } catch {
        // ignore
      }
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    try {
      setRunOnBoot(localStorage.getItem(STORAGE_DIAG_ON_BOOT) === '1');
      const savedAltIp = localStorage.getItem(STORAGE_DIAG_ALT_IP);
      if (savedAltIp) {
        setAltBackendUrl(savedAltIp);
      }
    } catch {
      setRunOnBoot(false);
    }
    run();
  }, []);

  const copyReport = async () => {
    if (!report) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        setCopyMsg('Rapport copié dans le presse-papiers.');
        return;
      }
    } catch {
      // fallback ci-dessous
    }

    try {
      const ta = document.getElementById('diag-report') as HTMLTextAreaElement | null;
      if (ta) {
        ta.focus();
        ta.select();
        document.execCommand('copy');
        setCopyMsg('Rapport copié (fallback).');
      } else {
        setCopyMsg('Impossible de copier automatiquement. Sélectionne le texte et copie manuellement.');
      }
    } catch {
      setCopyMsg('Impossible de copier automatiquement. Sélectionne le texte et copie manuellement.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Diagnostics réseau (Android/Desktop)</h2>
            <p className="text-gray-400 text-sm">
              Vérifie les endpoints utilisés par l’app en build statique.
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Backend configuré: <span className="text-gray-300">{backendUrl || '(non défini)'}</span>
            </p>
            <div className="mt-3 mb-3">
              <a 
                href="/settings/audit" 
                className="text-sm text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
              >
                🔍 Ouvrir la page Audit (teste toutes les méthodes de communication)
              </a>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm text-gray-300">
                  IP alternative à tester (ex: 10.0.2.2:3000 pour émulateur Android)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input input-sm input-bordered flex-1"
                    value={altBackendUrl}
                    onChange={(e) => setAltBackendUrlAndSave((e.currentTarget as HTMLInputElement).value)}
                    placeholder="http://10.0.2.2:3000"
                  />
                </div>
                <p className="text-gray-500 text-xs">
                  Le diagnostic testera les deux URLs: celle configurée et celle-ci.
                </p>
              </div>
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={runOnBoot}
                  onChange={(e) => setDiagOnBoot((e.currentTarget as HTMLInputElement).checked)}
                />
                Lancer cette page automatiquement au démarrage
              </label>
              <p className="text-gray-500 text-xs">
                En pratique: si activé, l’app redirige vers <span className="text-gray-300">/settings/diagnostics</span> au lancement.
              </p>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={running}
            onClick={() => run()}
          >
            {running ? 'Test en cours…' : 'Relancer'}
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th>Test</th>
                <th>Statut</th>
                <th>Durée</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.name}>
                  <td className="font-medium text-white">{r.name}</td>
                  <td className={r.ok ? 'text-green-400' : 'text-red-400'}>
                    {r.ok ? 'OK' : 'KO'}
                  </td>
                  <td className="text-gray-300">{typeof r.ms === 'number' ? `${r.ms} ms` : '-'}</td>
                  <td className="text-gray-400">{r.message || '-'}</td>
                </tr>
              ))}
              {rows === null && (
                <tr>
                  <td className="text-gray-400" colSpan={4}>Chargement…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white">Rapport</h3>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm" onClick={() => copyReport()} disabled={!report}>
              Copier
            </button>
          </div>
        </div>
        {copyMsg && <p className="text-xs text-gray-300">{copyMsg}</p>}
        <textarea
          id="diag-report"
          className="textarea textarea-bordered w-full h-56 font-mono text-xs"
          readOnly
          value={report || 'Génération du rapport…'}
        />
        <p className="text-gray-500 text-xs">
          Astuce: colle ce JSON dans un message, ça me permet de diagnostiquer très vite (DNS/LAN, cleartext, auth, endpoints).
        </p>
      </div>
    </div>
  );
}

