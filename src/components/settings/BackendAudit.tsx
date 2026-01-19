import { useEffect, useMemo, useState } from 'preact/hooks';
import { getBackendUrl } from '../../lib/backend-config';
import { isTauri } from '../../lib/utils/tauri';

type TestResult = {
  method: string;
  url: string;
  ok: boolean;
  ms: number;
  status?: number;
  message?: string;
  details?: string;
};

type AuditResult = {
  methodName: string;
  description: string;
  tests: TestResult[];
  overallOk: boolean;
};

export default function BackendAudit() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<string>('');
  const [customBackendUrl, setCustomBackendUrl] = useState<string>('');

  const backendUrl = (() => {
    try {
      return getBackendUrl();
    } catch {
      return '';
    }
  })();

  const testUrl = customBackendUrl || backendUrl || 'http://10.0.2.2:3000';
  const healthEndpoint = '/api/client/health';

  const runAudit = async () => {
    setRunning(true);
    setReport('');
    const allResults: AuditResult[] = [];

    // 0. Diagnostic environnemental (DOIT être en premier pour comprendre les problèmes)
    const testEnvironment = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'Diagnostic environnemental';
      
      // Test 1: Détection Tauri
      const tauriDetected = isTauri();
      tests.push({
        method: 'Détection Tauri (isTauri())',
        url: 'N/A',
        ok: tauriDetected,
        ms: 0,
        message: tauriDetected ? 'Tauri détecté' : 'Tauri NON détecté',
        details: `window.__TAURI_INTERNALS__: ${typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window}, window.__TAURI__: ${typeof window !== 'undefined' && '__TAURI__' in window}`,
      });

      // Test 2: Vérifier si invoke est disponible
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        tests.push({
          method: 'Import @tauri-apps/api/core',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: 'Import réussi',
          details: `invoke type: ${typeof invoke}`,
        });

        // Test 3: Tester get-platform (commande simple)
        try {
          const start = Date.now();
          const platform = await invoke('get-platform');
          const ms = Date.now() - start;
          tests.push({
            method: 'Commande get-platform (test basic invoke)',
            url: 'N/A',
            ok: true,
            ms,
            message: `Plateforme: ${platform}`,
            details: 'Invoke fonctionne pour les commandes de base',
          });
        } catch (e: any) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: 'Commande get-platform (test basic invoke)',
            url: 'N/A',
            ok: false,
            ms: 0,
            message: errorMsg,
            details: `Erreur complète: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`,
          });
        }

        // Test 4: Tester log-message
        try {
          const start = Date.now();
          await invoke('log-message', { message: '[audit-test] Test log-message' });
          const ms = Date.now() - start;
          tests.push({
            method: 'Commande log-message',
            url: 'N/A',
            ok: true,
            ms,
            message: 'Commande exécutée',
            details: 'log-message fonctionne',
          });
        } catch (e: any) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: 'Commande log-message',
            url: 'N/A',
            ok: false,
            ms: 0,
            message: errorMsg,
            details: `Erreur: ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`,
          });
        }

        // Test 5: Tester native-fetch (pour voir l'erreur détaillée)
        try {
          const start = Date.now();
          const testUrl = 'http://10.0.2.2:3000/api/client/health';
          const res = await invoke('native-fetch', {
            url: testUrl,
            method: 'GET',
            headers: [['Content-Type', 'application/json']],
            body: null,
            timeoutMs: 1000,
          } as any);
          const ms = Date.now() - start;
          tests.push({
            method: 'Commande native-fetch (test diagnostic)',
            url: testUrl,
            ok: true,
            ms,
            message: `Status: ${res?.status}`,
            details: `native-fetch est disponible et fonctionne`,
          });
        } catch (e: any) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const errorDetails: any = {
            name: e instanceof Error ? e.name : typeof e,
            message: errorMsg,
            string: String(e),
          };
          
          // Capturer plus de détails si disponibles
          if (e instanceof Error) {
            errorDetails.stack = e.stack;
            Object.keys(e).forEach(key => {
              if (key !== 'name' && key !== 'message' && key !== 'stack') {
                try {
                  errorDetails[key] = (e as any)[key];
                } catch {}
              }
            });
          }
          
          tests.push({
            method: 'Commande native-fetch (test diagnostic)',
            url: 'http://10.0.2.2:3000/api/client/health',
            ok: false,
            ms: 0,
            message: errorMsg,
            details: `Diagnostic complet: ${JSON.stringify(errorDetails, null, 2)}`,
          });
        }

      } catch (e: any) {
        tests.push({
          method: 'Import @tauri-apps/api/core',
          url: 'N/A',
          ok: false,
          ms: 0,
          message: `Import échoué: ${e instanceof Error ? e.message : String(e)}`,
          details: `Type erreur: ${e instanceof Error ? e.name : typeof e}`,
        });
      }

      // Test 6: Informations environnement
      tests.push({
        method: 'Informations environnement',
        url: 'N/A',
        ok: true,
        ms: 0,
        message: 'Informations collectées',
        details: JSON.stringify({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          android: /Android/i.test(navigator.userAgent),
          tauriDetected,
        }, null, 2),
      });

      return {
        methodName,
        description: 'Vérification de l\'environnement Tauri et disponibilité des commandes',
        tests,
        overallOk: tests.filter(t => t.method.includes('native-fetch')).some(t => t.ok) || false,
      };
    };

    // 1. Test avec native-fetch (commande Rust personnalisée)
    const testNativeFetch = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'native-fetch (Rust command)';
      
      const url = `${testUrl}${healthEndpoint}`;
      
      // Toujours essayer, même si isTauri() retourne false (au cas où l'API serait disponible sur Android)
      try {
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BackendAudit.tsx:52',message:'Before invoke native-fetch',data:{url,methodName},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const { invoke } = await import('@tauri-apps/api/core');
        
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'BackendAudit.tsx:56',message:'Invoke imported, attempting native-fetch',data:{url},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const start = Date.now();
        try {
          const res: any = await invoke('native-fetch', {
            url,
            method: 'GET',
            headers: [['Content-Type', 'application/json']],
            body: null,
            timeoutMs: 5000,
          } as any);
          
          const ms = Date.now() - start;
          tests.push({
            method: methodName,
            url,
            ok: res?.ok !== false && (res?.status === 200 || res?.status === 401),
            ms,
            status: res?.status,
            message: res?.ok === false ? `HTTP ${res?.status}` : null,
            details: `Response body length: ${res?.body?.length || 0} chars`,
          });
        } catch (e: any) {
          const ms = Date.now() - start;
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: methodName,
            url,
            ok: false,
            ms,
            message: errorMsg,
            details: `Error type: ${e instanceof Error ? e.name : typeof e}`,
          });
        }
      } catch (e: any) {
        tests.push({
          method: methodName,
          url: `${testUrl}${healthEndpoint}`,
          ok: false,
          ms: 0,
          message: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      return {
        methodName,
        description: 'Commande Rust personnalisée via invoke("native-fetch")',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 2. Test avec @tauri-apps/plugin-http
    const testPluginHttp = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = '@tauri-apps/plugin-http';
      
      const url = `${testUrl}${healthEndpoint}`;
      
      // Toujours essayer, même si isTauri() retourne false (au cas où l'API serait disponible sur Android)
      try {
        const start = Date.now();
        
        try {
          const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
          const response = await httpFetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          } as any);
          
          const ms = Date.now() - start;
          const responseBody = response.text ? await response.text() : '';
          
          tests.push({
            method: methodName,
            url,
            ok: response.ok || response.status === 401,
            ms,
            status: response.status,
            message: response.ok ? null : `HTTP ${response.status}`,
            details: `Response body length: ${responseBody.length} chars`,
          });
        } catch (e: any) {
          const ms = Date.now() - start;
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: methodName,
            url,
            ok: false,
            ms,
            message: errorMsg,
            details: `Error type: ${e instanceof Error ? e.name : typeof e}`,
          });
        }
      } catch (e: any) {
        tests.push({
          method: methodName,
          url: `${testUrl}${healthEndpoint}`,
          ok: false,
          ms: 0,
          message: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      return {
        methodName,
        description: 'Plugin HTTP Tauri standard',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 3. Test avec fetch standard (navigateur)
    const testStandardFetch = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'fetch (navigateur standard)';
      const url = `${testUrl}${healthEndpoint}`;
      
      const start = Date.now();
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        const ms = Date.now() - start;
        const data = await response.json().catch(() => ({}));
        
        tests.push({
          method: methodName,
          url,
          ok: response.ok || response.status === 401,
          ms,
          status: response.status,
          message: response.ok ? null : `HTTP ${response.status}`,
          details: `CORS: ${response.type === 'cors' ? 'OK' : response.type}`,
        });
      } catch (e: any) {
        const ms = Date.now() - start;
        const errorMsg = e instanceof Error ? e.message : String(e);
        const isCorsError = errorMsg.includes('Failed to fetch') || 
                           errorMsg.includes('CORS') ||
                           (e instanceof TypeError && errorMsg.includes('fetch'));
        
        tests.push({
          method: methodName,
          url,
          ok: false,
          ms,
          message: isCorsError ? 'CORS bloque la requête' : errorMsg,
          details: `Error type: ${e instanceof Error ? e.name : typeof e}`,
        });
      }

      return {
        methodName,
        description: 'API fetch standard du navigateur',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 4. Test avec différentes URLs (10.0.2.2, localhost, 127.0.0.1)
    const testDifferentUrls = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'native-fetch avec URLs alternatives';
      
      // Toujours essayer, même si isTauri() retourne false (au cas où l'API serait disponible sur Android)
      const urlsToTest = [
        'http://10.0.2.2:3000',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://192.168.1.1:3000', // IP du réseau local (si disponible)
      ];

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        for (const baseUrl of urlsToTest) {
        const url = `${baseUrl}${healthEndpoint}`;
        const start = Date.now();
        
        try {
          const res: any = await invoke('native-fetch', {
            url,
            method: 'GET',
            headers: [['Content-Type', 'application/json']],
            body: null,
            timeoutMs: 3000,
          } as any);
          
          const ms = Date.now() - start;
          tests.push({
            method: methodName,
            url,
            ok: res?.ok !== false && (res?.status === 200 || res?.status === 401),
            ms,
            status: res?.status,
            message: res?.ok === false ? `HTTP ${res?.status}` : null,
          });
        } catch (e: any) {
          const ms = Date.now() - start;
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: methodName,
            url,
            ok: false,
            ms,
            message: errorMsg,
          });
        }
        }
      } catch (e: any) {
        // Si l'import échoue, ajouter un test d'erreur
        tests.push({
          method: methodName,
          url: 'N/A',
          ok: false,
          ms: 0,
          message: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      return {
        methodName,
        description: 'Test avec différentes URLs (10.0.2.2, localhost, 127.0.0.1)',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 5. Test avec différentes méthodes HTTP (GET, POST, OPTIONS)
    const testDifferentMethods = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'native-fetch avec méthodes HTTP';
      
      const url = `${testUrl}${healthEndpoint}`;
      const methods = ['GET', 'POST', 'OPTIONS'];
      
      // Toujours essayer, même si isTauri() retourne false (au cas où l'API serait disponible sur Android)
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        for (const httpMethod of methods) {
        const start = Date.now();
        
        try {
          const res: any = await invoke('native-fetch', {
            url,
            method: httpMethod,
            headers: [['Content-Type', 'application/json']],
            body: null,
            timeoutMs: 3000,
          } as any);
          
          const ms = Date.now() - start;
          tests.push({
            method: `${methodName} - ${httpMethod}`,
            url,
            ok: res?.ok !== false && (res?.status === 200 || res?.status === 401 || res?.status === 405),
            ms,
            status: res?.status,
            message: res?.ok === false ? `HTTP ${res?.status}` : null,
          });
        } catch (e: any) {
          const ms = Date.now() - start;
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: `${methodName} - ${httpMethod}`,
            url,
            ok: false,
            ms,
            message: errorMsg,
          });
        }
        }
      } catch (e: any) {
        // Si l'import échoue, ajouter un test d'erreur
        tests.push({
          method: methodName,
          url: 'N/A',
          ok: false,
          ms: 0,
          message: `Import failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }

      return {
        methodName,
        description: 'Test avec différentes méthodes HTTP',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // Exécuter tous les tests (diagnostic environnemental EN PREMIER)
    allResults.push(await testEnvironment());
    allResults.push(await testNativeFetch());
    allResults.push(await testPluginHttp());
    allResults.push(await testStandardFetch());
    allResults.push(await testDifferentUrls());
    allResults.push(await testDifferentMethods());

    setResults(allResults);

    // Générer le rapport
    const envInfo = {
      ts: new Date().toISOString(),
      backendUrl: testUrl,
      tauri: isTauri(),
      android: /Android/i.test(navigator.userAgent),
      userAgent: navigator.userAgent,
    };

    const reportObj = {
      kind: 'popcorn-android-audit',
      ...envInfo,
      results: allResults.map(r => ({
        method: r.methodName,
        description: r.description,
        overallOk: r.overallOk,
        tests: r.tests.map(t => ({
          method: t.method,
          url: t.url,
          ok: t.ok,
          ms: t.ms,
          status: t.status || null,
          message: t.message || null,
          details: t.details || null,
        })),
      })),
      summary: {
        totalMethods: allResults.length,
        workingMethods: allResults.filter(r => r.overallOk).length,
        bestMethod: allResults.find(r => r.overallOk)?.methodName || 'Aucune méthode ne fonctionne',
      },
    };

    setReport(JSON.stringify(reportObj, null, 2));
    setRunning(false);
  };

  useEffect(() => {
    runAudit();
  }, []);

  const copyReport = async () => {
    if (!report) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        return;
      }
    } catch {
      // fallback
    }

    try {
      const ta = document.getElementById('audit-report') as HTMLTextAreaElement | null;
      if (ta) {
        ta.focus();
        ta.select();
        document.execCommand('copy');
      }
    } catch {
      // ignore
    }
  };

  const workingMethods = results.filter(r => r.overallOk);
  const bestMethod = workingMethods[0]?.methodName || 'Aucune méthode ne fonctionne';

  return (
    <div className="space-y-6">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Audit de communication (Android)</h2>
              <p className="text-gray-400 text-sm">
                Teste automatiquement toutes les façons de communiquer avec le backend pour trouver la solution qui fonctionne.
              </p>
              {bestMethod !== 'Aucune méthode ne fonctionne' && (
                <div className="mt-3 p-3 bg-green-500/20 border border-green-500/50 rounded">
                  <p className="text-sm text-green-400 font-semibold">
                    ✓ Solution trouvée: <span className="text-white">{bestMethod}</span>
                  </p>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              disabled={running}
              onClick={() => runAudit()}
            >
              {running ? 'Audit en cours…' : 'Relancer'}
            </button>
          </div>
          
          {/* Champ pour personnaliser l'URL du backend */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              URL du backend à tester
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input input-bordered flex-1"
                placeholder={backendUrl || 'http://10.0.2.2:3000'}
                value={customBackendUrl}
                onChange={(e) => setCustomBackendUrl((e.target as HTMLInputElement).value)}
                disabled={running}
              />
              {customBackendUrl && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setCustomBackendUrl('')}
                  disabled={running}
                  title="Réinitialiser à l'URL par défaut"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-gray-500 text-xs">
              Backend testé: <span className="text-gray-300">{testUrl}</span>
              {customBackendUrl && (
                <span className="text-blue-400 ml-2">(URL personnalisée)</span>
              )}
              {!customBackendUrl && backendUrl && (
                <span className="text-gray-500 ml-2">(URL configurée)</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Résumé */}
      {results.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
          <h3 className="text-base font-bold text-white mb-3">Résumé</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Méthodes testées</p>
              <p className="text-xl font-bold text-white">{results.length}</p>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Méthodes fonctionnelles</p>
              <p className={`text-xl font-bold ${workingMethods.length > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {workingMethods.length}
              </p>
            </div>
            <div className="bg-gray-900/50 p-3 rounded">
              <p className="text-xs text-gray-400">Meilleure méthode</p>
              <p className="text-sm font-bold text-white truncate">{bestMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* Résultats détaillés */}
      {results.map((result, idx) => (
        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <div className="p-4 bg-gray-900/30 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">{result.methodName}</h3>
                <p className="text-xs text-gray-400 mt-1">{result.description}</p>
              </div>
              <div className={`px-3 py-1 rounded text-sm font-semibold ${
                result.overallOk ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
                {result.overallOk ? 'FONCTIONNE' : 'ÉCHOUÉ'}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>URL</th>
                  <th>Statut</th>
                  <th>Durée</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {result.tests.map((test, testIdx) => (
                  <tr key={testIdx}>
                    <td className="font-medium text-white text-sm">{test.method}</td>
                    <td className="text-gray-300 text-xs max-w-xs truncate">{test.url}</td>
                    <td className={test.ok ? 'text-green-400' : 'text-red-400'}>
                      {test.ok ? 'OK' : 'KO'}
                      {test.status && ` (${test.status})`}
                    </td>
                    <td className="text-gray-300">{test.ms} ms</td>
                    <td className="text-gray-400 text-xs">
                      {test.message || test.details || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Rapport */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white">Rapport complet</h3>
          <button className="btn btn-sm" onClick={() => copyReport()} disabled={!report}>
            Copier
          </button>
        </div>
        <textarea
          id="audit-report"
          className="textarea textarea-bordered w-full h-64 font-mono text-xs"
          readOnly
          value={report || 'Génération du rapport…'}
        />
        <p className="text-gray-500 text-xs">
          Ce rapport contient tous les détails des tests pour identifier la bonne méthode de communication.
        </p>
      </div>
    </div>
  );
}
