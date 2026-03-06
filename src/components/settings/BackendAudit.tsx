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

      // Test 2: Vérifier si invoke est disponible (seulement si Tauri est détecté)
      if (tauriDetected) {
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
      } else {
        // Tauri non détecté - marquer les tests Tauri comme non applicables
        tests.push({
          method: 'Import @tauri-apps/api/core',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: 'Non applicable (mode navigateur)',
          details: 'Les tests Tauri ne sont pertinents que dans un environnement Tauri (Android/Desktop)',
        });
        tests.push({
          method: 'Commande get-platform (test basic invoke)',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: 'Non applicable (mode navigateur)',
          details: 'Tauri non détecté - cette commande nécessite un environnement Tauri',
        });
        tests.push({
          method: 'Commande log-message',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: 'Non applicable (mode navigateur)',
          details: 'Tauri non détecté - cette commande nécessite un environnement Tauri',
        });
        tests.push({
          method: 'Commande native-fetch (test diagnostic)',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: 'Non applicable (mode navigateur)',
          details: 'Tauri non détecté - cette commande nécessite un environnement Tauri',
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
      
      // Vérifier si Tauri est disponible avant d'essayer
      if (!isTauri()) {
        tests.push({
          method: methodName,
          url,
          ok: true,
          ms: 0,
          status: null,
          message: 'Non applicable (mode navigateur)',
          details: 'Tauri non détecté - cette méthode nécessite un environnement Tauri (Android/Desktop)',
        });
        return {
          methodName,
          description: 'Commande Rust personnalisée via invoke("native-fetch")',
          tests,
          overallOk: true, // Marquer comme OK car non applicable
        };
      }
      
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
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
      
      // Vérifier si Tauri est disponible avant d'essayer
      if (!isTauri()) {
        tests.push({
          method: methodName,
          url,
          ok: true,
          ms: 0,
          status: null,
          message: 'Non applicable (mode navigateur)',
          details: 'Tauri non détecté - cette méthode nécessite un environnement Tauri (Android/Desktop)',
        });
        return {
          methodName,
          description: 'Plugin HTTP Tauri standard',
          tests,
          overallOk: true, // Marquer comme OK car non applicable
        };
      }
      
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
      
      // Vérifier si Tauri est disponible avant d'essayer
      if (!isTauri()) {
        const urlsToTest = [
          'http://10.0.2.2:3000',
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://192.168.1.1:3000',
        ];
        urlsToTest.forEach(baseUrl => {
          tests.push({
            method: methodName,
            url: `${baseUrl}${healthEndpoint}`,
            ok: true,
            ms: 0,
            status: null,
            message: 'Non applicable (mode navigateur)',
            details: 'Tauri non détecté - cette méthode nécessite un environnement Tauri (Android/Desktop)',
          });
        });
        return {
          methodName,
          description: 'Test avec différentes URLs (10.0.2.2=émulateur Android, localhost, 127.0.0.1, réseau local)',
          tests,
          overallOk: true, // Marquer comme OK car non applicable
        };
      }
      
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
        description: 'Test avec différentes URLs (10.0.2.2=émulateur Android, localhost, 127.0.0.1, réseau local)',
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
      
      // Vérifier si Tauri est disponible avant d'essayer
      if (!isTauri()) {
        methods.forEach(httpMethod => {
          tests.push({
            method: `${methodName} - ${httpMethod}`,
            url,
            ok: true,
            ms: 0,
            status: null,
            message: 'Non applicable (mode navigateur)',
            details: 'Tauri non détecté - cette méthode nécessite un environnement Tauri (Android/Desktop)',
          });
        });
        return {
          methodName,
          description: 'Test avec différentes méthodes HTTP',
          tests,
          overallOk: true, // Marquer comme OK car non applicable
        };
      }
      
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

    // 6. Test CORS (vérifier les headers CORS dans les réponses)
    const testCors = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'Vérification CORS';
      const url = `${testUrl}${healthEndpoint}`;
      
      // Test 1: Vérifier les headers CORS avec fetch standard
      try {
        const start = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const ms = Date.now() - start;
        
        const corsOrigin = response.headers.get('access-control-allow-origin');
        const corsMethods = response.headers.get('access-control-allow-methods');
        const corsHeaders = response.headers.get('access-control-allow-headers');
        const corsCredentials = response.headers.get('access-control-allow-credentials');
        
        const corsOk = corsOrigin !== null || response.type === 'cors' || response.type === 'basic';
        
        tests.push({
          method: 'Headers CORS (fetch standard)',
          url,
          ok: corsOk && (response.ok || response.status === 401),
          ms,
          status: response.status,
          message: corsOk ? 'CORS configuré' : 'CORS non détecté',
          details: JSON.stringify({
            'access-control-allow-origin': corsOrigin,
            'access-control-allow-methods': corsMethods,
            'access-control-allow-headers': corsHeaders,
            'access-control-allow-credentials': corsCredentials,
            responseType: response.type,
          }, null, 2),
        });
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const isCorsError = errorMsg.includes('Failed to fetch') || 
                           errorMsg.includes('CORS') ||
                           (e instanceof TypeError && errorMsg.includes('fetch'));
        
        tests.push({
          method: 'Headers CORS (fetch standard)',
          url,
          ok: false,
          ms: 0,
          message: isCorsError ? 'Erreur CORS détectée' : errorMsg,
          details: `Type erreur: ${e instanceof Error ? e.name : typeof e}`,
        });
      }

      // Test 2: Test OPTIONS (preflight CORS)
      try {
        const start = Date.now();
        const response = await fetch(url, {
          method: 'OPTIONS',
          headers: { 
            'Content-Type': 'application/json',
            'Origin': window.location.origin || 'null',
          },
        });
        const ms = Date.now() - start;
        
        const corsOrigin = response.headers.get('access-control-allow-origin');
        const preflightOk = response.status === 200 || response.status === 204 || corsOrigin !== null;
        
        tests.push({
          method: 'Preflight OPTIONS (CORS)',
          url,
          ok: preflightOk,
          ms,
          status: response.status,
          message: preflightOk ? 'Preflight OK' : 'Preflight échoué',
          details: `Origin: ${window.location.origin || 'null'}, CORS-Allow-Origin: ${corsOrigin || 'non défini'}`,
        });
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        tests.push({
          method: 'Preflight OPTIONS (CORS)',
          url,
          ok: false,
          ms: 0,
          message: errorMsg,
          details: `Type erreur: ${e instanceof Error ? e.name : typeof e}`,
        });
      }

      // Test 3: Test avec origine null (Android WebView)
      if (isTauri()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const start = Date.now();
          
          const res: any = await invoke('native-fetch', {
            url,
            method: 'GET',
            headers: [
              ['Content-Type', 'application/json'],
              ['Origin', 'null'], // Simuler origine null Android
            ],
            body: null,
            timeoutMs: 3000,
          } as any);
          
          const ms = Date.now() - start;
          const headers = res?.headers || [];
          const corsHeader = headers.find(([k]: [string, string]) => 
            k.toLowerCase() === 'access-control-allow-origin'
          );
          
          // Le backend devrait retourner * pour les origines null
          const nullOriginOk = corsHeader && (corsHeader[1] === '*' || corsHeader[1] === 'null');
          
          tests.push({
            method: 'CORS avec origine null (Android)',
            url,
            ok: nullOriginOk && (res?.status === 200 || res?.status === 401),
            ms,
            status: res?.status,
            message: nullOriginOk ? 'CORS null origin géré' : 'CORS null origin non géré',
            details: corsHeader ? `CORS-Allow-Origin: ${corsHeader[1]}` : 'Header CORS non trouvé',
          });
        } catch (e: any) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          tests.push({
            method: 'CORS avec origine null (Android)',
            url,
            ok: false,
            ms: 0,
            message: errorMsg,
          });
        }
      }

      return {
        methodName,
        description: 'Vérification de la configuration CORS (headers, preflight, origines null)',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 7. Test d'authentification (tokens Bearer)
    const testAuthentication = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'Authentification (Bearer tokens)';
      const url = `${testUrl}/api/client/health`;
      
      // Test 1: Requête sans token (devrait fonctionner pour /health)
      try {
        const start = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const ms = Date.now() - start;
        
        tests.push({
          method: 'Requête sans token (endpoint public)',
          url,
          ok: response.ok || response.status === 401,
          ms,
          status: response.status,
          message: response.ok ? 'OK (endpoint public)' : `HTTP ${response.status}`,
          details: response.status === 401 ? 'Authentification requise (normal pour certains endpoints)' : 'Endpoint accessible',
        });
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        tests.push({
          method: 'Requête sans token (endpoint public)',
          url,
          ok: false,
          ms: 0,
          message: errorMsg,
        });
      }

      // Test 2: Requête avec token invalide (devrait retourner 401)
      try {
        const start = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': 'Bearer invalid-token-test',
          },
        });
        const ms = Date.now() - start;
        
        tests.push({
          method: 'Requête avec token invalide',
          url,
          ok: response.status === 401 || response.status === 403,
          ms,
          status: response.status,
          message: response.status === 401 ? '401 Unauthorized (attendu)' : `HTTP ${response.status}`,
          details: 'Le backend rejette correctement les tokens invalides',
        });
      } catch (e: any) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        tests.push({
          method: 'Requête avec token invalide',
          url,
          ok: false,
          ms: 0,
          message: errorMsg,
        });
      }

      // Test 3: Vérifier si un token est stocké
      try {
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');
        
        tests.push({
          method: 'Vérification tokens stockés',
          url: 'N/A',
          ok: true,
          ms: 0,
          message: accessToken ? 'Token présent' : 'Aucun token stocké',
          details: `Access token: ${accessToken ? 'présent' : 'absent'}, Refresh token: ${refreshToken ? 'présent' : 'absent'}`,
        });
      } catch (e: any) {
        tests.push({
          method: 'Vérification tokens stockés',
          url: 'N/A',
          ok: false,
          ms: 0,
          message: 'Erreur accès localStorage',
        });
      }

      return {
        methodName,
        description: 'Vérification du système d\'authentification Bearer tokens',
        tests,
        overallOk: tests.some(t => t.ok),
      };
    };

    // 8. Test configuration Android/Tauri
    const testAndroidConfig = async (): Promise<AuditResult> => {
      const tests: TestResult[] = [];
      const methodName = 'Configuration Android/Tauri';
      
      const isAndroid = /Android/i.test(navigator.userAgent);
      const tauriDetected = isTauri();
      
      // Test 1: Détection plateforme
      tests.push({
        method: 'Détection plateforme',
        url: 'N/A',
        ok: true,
        ms: 0,
        message: isAndroid ? 'Android détecté' : 'Autre plateforme',
        details: `UserAgent: ${navigator.userAgent}, Tauri: ${tauriDetected}`,
      });

      // Test 2: Vérifier capabilities Tauri (si disponible)
      if (tauriDetected) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const platform = await invoke('get-platform');
          
          tests.push({
            method: 'Platform Tauri',
            url: 'N/A',
            ok: true,
            ms: 0,
            message: `Platform: ${platform}`,
            details: platform === 'android' ? 'Application Android Tauri' : `Application ${platform}`,
          });
        } catch (e: any) {
          tests.push({
            method: 'Platform Tauri',
            url: 'N/A',
            ok: false,
            ms: 0,
            message: `Erreur: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      // Test 3: Vérifier URL backend configurée
      try {
        const backendUrl = getBackendUrl();
        const isEmulatorUrl = backendUrl.includes('10.0.2.2');
        const isLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
        
        tests.push({
          method: 'URL backend configurée',
          url: backendUrl,
          ok: true,
          ms: 0,
          message: backendUrl ? 'URL configurée' : 'URL non configurée',
          details: isEmulatorUrl 
            ? '⚠️ URL émulateur (10.0.2.2) - ne fonctionne que sur émulateur'
            : isLocalhost
            ? '⚠️ URL localhost - ne fonctionne pas sur appareil physique Android'
            : 'URL réseau configurée',
        });
      } catch (e: any) {
        tests.push({
          method: 'URL backend configurée',
          url: 'N/A',
          ok: false,
          ms: 0,
          message: 'Erreur lecture configuration',
        });
      }

      // Test 4: Recommandations pour Android
      if (isAndroid && tauriDetected) {
        const backendUrl = getBackendUrl();
        const isEmulatorUrl = backendUrl.includes('10.0.2.2');
        const isLocalhost = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
        
        let recommendation = '';
        if (isEmulatorUrl) {
          recommendation = '✅ URL émulateur correcte (10.0.2.2)';
        } else if (isLocalhost) {
          recommendation = '⚠️ Utilisez l\'IP locale de votre machine (ex: http://192.168.1.100:3000) au lieu de localhost';
        } else {
          recommendation = '✅ URL réseau configurée';
        }
        
        tests.push({
          method: 'Recommandations Android',
          url: 'N/A',
          ok: !isLocalhost,
          ms: 0,
          message: recommendation,
          details: 'Sur appareil physique Android, utilisez l\'IP locale de votre machine, pas localhost ou 127.0.0.1',
        });
      }

      return {
        methodName,
        description: 'Vérification de la configuration Android/Tauri et recommandations',
        tests,
        overallOk: tests.every(t => t.ok),
      };
    };

    // Exécuter tous les tests (diagnostic environnemental EN PREMIER)
    allResults.push(await testEnvironment());
    allResults.push(await testAndroidConfig());
    allResults.push(await testCors());
    allResults.push(await testAuthentication());
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
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-white">Audit complet de communication</h2>
              <p className="text-gray-400 text-sm break-words">
                Teste automatiquement toutes les façons de communiquer avec le backend, vérifie la configuration CORS, 
                l'authentification, et la configuration Android/Tauri pour identifier les problèmes et proposer des solutions.
              </p>
              {bestMethod !== 'Aucune méthode ne fonctionne' && (
                <div className="mt-3 p-3 bg-green-500/20 border border-green-500/50 rounded">
                  <p className="text-sm text-green-400 font-semibold break-words">
                    ✓ Solution trouvée: <span className="text-white">{bestMethod}</span>
                  </p>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary flex-shrink-0 w-full sm:w-auto"
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
                className="input input-bordered flex-1 min-w-0"
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
            <div className="space-y-1">
              <p className="text-gray-500 text-xs break-words">
                Backend testé: <span className="text-gray-300 break-all">{testUrl}</span>
                {customBackendUrl && (
                  <span className="text-blue-400 ml-2">(URL personnalisée)</span>
                )}
                {!customBackendUrl && backendUrl && (
                  <span className="text-gray-500 ml-2">(URL configurée)</span>
                )}
              </p>
              {testUrl.includes('10.0.2.2') && (
                <p className="text-blue-400/80 text-xs flex items-start gap-1">
                  <span className="flex-shrink-0">📱</span>
                  <span className="break-words">
                    <strong>10.0.2.2</strong> est l'IP spéciale de l'émulateur Android pour accéder au localhost de la machine hôte.
                    Les tests avec cette IP échoueront si vous n'êtes pas sur un émulateur Android.
                  </span>
                </p>
              )}
            </div>
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
              <p className="text-sm font-bold text-white break-words">{bestMethod}</p>
            </div>
          </div>
        </div>
      )}

      {/* Résultats détaillés */}
      {results.map((result, idx) => (
        <div key={idx} className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
          <div className="p-4 bg-gray-900/30 border-b border-white/10">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white break-words">{result.methodName}</h3>
                <p className="text-xs text-gray-400 mt-1 break-words">{result.description}</p>
              </div>
              <div className={`px-3 py-1 rounded text-sm font-semibold flex-shrink-0 ${
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
                {result.tests.map((test, testIdx) => {
                  // Identifier si c'est un test avec l'IP de l'émulateur Android
                  const isEmulatorUrl = test.url.includes('10.0.2.2');
                  const isLocalhost = test.url.includes('localhost') || test.url.includes('127.0.0.1');
                  const isNotApplicable = test.message?.includes('Non applicable') || test.details?.includes('non applicable');
                  
                  return (
                    <tr 
                      key={testIdx}
                      className={
                        isNotApplicable
                          ? 'bg-gray-700/20 border-l-4 border-gray-500/50'
                          : isEmulatorUrl 
                            ? 'bg-blue-500/10 border-l-4 border-blue-500/50' 
                            : isLocalhost 
                              ? 'bg-green-500/5 border-l-4 border-green-500/30' 
                              : ''
                      }
                    >
                      <td className="font-medium text-white text-sm break-words min-w-[150px]">
                        {isNotApplicable && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <span className="text-gray-400 text-xs">⏭️</span>
                          </span>
                        )}
                        {isEmulatorUrl && !isNotApplicable && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <span className="text-blue-400 text-xs">📱</span>
                          </span>
                        )}
                        {isLocalhost && !isEmulatorUrl && !isNotApplicable && (
                          <span className="inline-flex items-center gap-1 mr-2">
                            <span className="text-green-400 text-xs">🖥️</span>
                          </span>
                        )}
                        {test.method}
                      </td>
                      <td className="text-gray-300 text-xs break-words min-w-[150px]">
                        {test.url}
                        {isEmulatorUrl && !isNotApplicable && (
                          <span className="ml-2 text-xs text-blue-400/70 italic break-words">
                            (émulateur)
                          </span>
                        )}
                      </td>
                      <td className={`whitespace-nowrap ${
                        isNotApplicable 
                          ? 'text-gray-400' 
                          : test.ok 
                            ? 'text-green-400' 
                            : 'text-red-400'
                      }`}>
                        {isNotApplicable ? 'N/A' : (test.ok ? 'OK' : 'KO')}
                        {test.status && ` (${test.status})`}
                      </td>
                      <td className="text-gray-300 whitespace-nowrap">{test.ms} ms</td>
                      <td className="text-gray-400 text-xs break-words min-w-[200px]">
                        {test.message || test.details || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Rapport */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="text-base font-bold text-white">Rapport complet</h3>
          <button className="btn btn-sm w-full sm:w-auto" onClick={() => copyReport()} disabled={!report}>
            Copier
          </button>
        </div>
        <textarea
          id="audit-report"
          className="textarea textarea-bordered w-full h-64 font-mono text-xs"
          readOnly
          value={report || 'Génération du rapport…'}
        />
        <p className="text-gray-500 text-xs break-words">
          Ce rapport contient tous les détails des tests pour identifier la bonne méthode de communication, 
          vérifier la configuration CORS, l'authentification, et la configuration Android/Tauri.
        </p>
        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded">
          <p className="text-xs text-blue-300 font-semibold mb-2">💡 Tests inclus :</p>
          <ul className="text-xs text-blue-200/80 space-y-1 list-disc list-inside">
            <li>Diagnostic environnemental (Tauri, commandes, plateforme)</li>
            <li>Configuration Android/Tauri (URL backend, recommandations)</li>
            <li>Vérification CORS (headers, preflight, origines null)</li>
            <li>Authentification Bearer tokens</li>
            <li>Méthodes de communication (native-fetch, plugin-http, fetch standard)</li>
            <li>URLs alternatives et méthodes HTTP</li>
          </ul>
        </div>
      </div>
    </div>
  );
}