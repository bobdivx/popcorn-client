import { useState, useEffect } from 'preact/hooks';
import { getBackendUrl, hasBackendUrl, setBackendUrl as saveBackendUrl } from '../../../lib/backend-config.js';

interface ServerUrlStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

export function ServerUrlStep({ focusedButtonIndex, buttonRefs, onNext }: ServerUrlStepProps) {
  const [backendUrl, setBackendUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Charger l'URL du backend Rust depuis localStorage
    loadBackendUrl();
  }, []);

  const loadBackendUrl = () => {
    try {
      setLoading(true);
      setError(null);
      
      // Si aucune URL n'a été configurée, ne pas pré-remplir: on force la saisie.
      if (!hasBackendUrl()) {
        setBackendUrl('');
        return;
      }

      // Sinon, récupérer l'URL existante (localStorage > env > défaut)
      setBackendUrl(getBackendUrl());
    } catch (err) {
      console.error('Erreur lors du chargement de l\'URL du backend:', err);
      // Valeur par défaut en cas d'erreur
      setBackendUrl('http://127.0.0.1:3000');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL de backend Rust');
      return;
    }

    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      // Normaliser l'URL (ajouter http:// si manquant)
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        // Mettre à jour l'input avec l'URL normalisée
        setBackendUrl(normalizedUrl);
      }
      
      // Valider l'URL
      try {
        const urlObj = new URL(normalizedUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
        }
        throw e;
      }

      // Tester la connexion au backend Rust directement
      const testUrl = `${normalizedUrl}/api/client/health`;
      console.log('[ServerUrlStep] Test de connexion à:', testUrl);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServerUrlStep.tsx:handleTest:BEFORE_FETCH',message:'Test connexion backend',data:{backendUrl,normalizedUrl,testUrl},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
      });
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServerUrlStep.tsx:handleTest:AFTER_FETCH',message:'Réponse test connexion',data:{testUrl,status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (response.ok) {
        setSuccess(`✅ Connexion réussie ! Le backend Rust est accessible à ${normalizedUrl}`);
      } else {
        setError(`❌ Impossible de se connecter au backend Rust (${response.status}).\n\nURL testée: ${normalizedUrl}\n\nVérifiez que:\n• Le backend Rust est démarré sur votre machine\n• L'URL est correcte (ex: http://192.168.1.100:3000)\n• Votre mobile et votre PC sont sur le même réseau Wi-Fi`);
      }
    } catch (err) {
      // #region agent log
      const errorDetails = err instanceof Error ? {name:err.name,message:err.message,stack:err.stack} : {value:String(err),type:typeof err};
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ServerUrlStep.tsx:handleTest:CATCH',message:'Erreur test connexion',data:{backendUrl,normalizedUrl,testUrl,error:errorDetails,isTypeError:err instanceof TypeError,isFailedToFetch:err instanceof TypeError && err.message.includes('Failed to fetch')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      let errorMessage = 'Erreur de connexion';
      
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        const normalizedUrl = backendUrl.trim().match(/^https?:\/\//i) 
          ? backendUrl.trim() 
          : `http://${backendUrl.trim()}`;
        errorMessage = `❌ Impossible de se connecter au backend.\n\nURL testée: ${normalizedUrl}\n\nVérifiez que:\n• Le backend Rust est démarré (port 3000)\n• L'IP est correcte (pas 10.0.2.2 sur appareil physique)\n• Votre mobile et votre PC sont sur le même réseau Wi-Fi\n• Le firewall n'bloque pas le port 3000\n• Testez depuis le navigateur mobile: ${normalizedUrl}/api/client/health`;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('[ServerUrlStep] Erreur de test:', err);
    } finally {
      setTesting(false);
    }
  };

  const handleNext = async () => {
    if (!backendUrl.trim()) {
      setError('Veuillez entrer une URL de backend Rust');
      return;
    }

    try {
      setTesting(true);
      setError(null);

      // Valider l'URL
      try {
        const urlObj = new URL(backendUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Le protocole doit être http:// ou https://');
        }
      } catch (e) {
        if (e instanceof TypeError) {
          setError('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
          setTesting(false);
          return;
        }
        throw e;
      }

      // Normaliser l'URL (ajouter http:// si manquant) avant de sauvegarder
      let normalizedUrl = backendUrl.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = `http://${normalizedUrl}`;
        setBackendUrl(normalizedUrl);
      }
      
      // Sauvegarder l'URL dans localStorage
      saveBackendUrl(normalizedUrl);
      console.log('[ServerUrlStep] URL sauvegardée:', normalizedUrl);

      // Continuer au prochain step
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="text-2xl font-bold text-white">Configuration de l'URL du backend Rust</h3>
      
      <p className="text-gray-400">
        Entrez l'adresse du backend Rust auquel le client Astro doit se connecter.
        Cette URL est stockée dans localStorage et utilisée par les routes API du client pour faire le proxy vers le backend Rust.
      </p>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-300">
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-green-300">
          <span>{success}</span>
        </div>
      )}

      {loading && (
        <div className="bg-gray-900/30 border border-gray-700 rounded-lg p-4 text-gray-300">
          <span className="loading loading-spinner loading-sm"></span> Chargement de la configuration...
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-white">
          URL du Backend Rust
        </label>
        <input
          type="url"
          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
          placeholder="http://192.168.1.100:3000"
          value={backendUrl}
          onInput={(e) => {
            setBackendUrl((e.target as HTMLInputElement).value);
            setError(null);
            setSuccess(null);
          }}
          disabled={testing || loading}
        />
        <div className="space-y-1">
          <p className="text-sm text-gray-500">
            Format: <code className="bg-gray-800 px-1 rounded">http://IP:3000</code>
          </p>
          <p className="text-xs text-gray-400">
            📱 <strong>Sur Android (appareil physique):</strong> Utilisez l'IP locale de votre machine (ex: <code className="bg-gray-800 px-1 rounded">http://192.168.1.100:3000</code>)
          </p>
          <p className="text-xs text-gray-400">
            💻 <strong>Pour trouver l'IP de votre machine:</strong>
          </p>
          <ul className="text-xs text-gray-500 list-disc list-inside ml-2 space-y-1">
            <li><strong>Windows:</strong> Ouvrez CMD et tapez <code className="bg-gray-800 px-1 rounded">ipconfig</code>, cherchez "Adresse IPv4"</li>
            <li><strong>Linux/Mac:</strong> Ouvrez Terminal et tapez <code className="bg-gray-800 px-1 rounded">ip addr</code> ou <code className="bg-gray-800 px-1 rounded">ifconfig</code></li>
            <li>Assurez-vous que votre mobile et votre PC sont sur le même réseau Wi-Fi</li>
          </ul>
          <p className="text-xs text-gray-400 mt-2">
            🖥️ <strong>Émulateur Android:</strong> Utilisez <code className="bg-gray-800 px-1 rounded">http://10.0.2.2:3000</code>
          </p>
        </div>
        <p className="text-xs text-gray-600 mt-2">
          💡 Cette URL est stockée dans localStorage et utilisée par les routes API du client Astro pour faire le proxy vers le backend Rust. Le backend Rust utilise le port 3000 par défaut.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="w-full sm:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleTest}
          disabled={testing || loading || !backendUrl.trim()}
        >
          {testing ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Test en cours...
            </>
          ) : (
            'Tester la connexion'
          )}
        </button>
        <button
          ref={(el) => { buttonRefs.current[1] = el; }}
          className="w-full sm:flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleNext}
          disabled={testing || loading || !backendUrl.trim()}
        >
          {testing ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Sauvegarde...
            </>
          ) : (
            'Suivant →'
          )}
        </button>
      </div>
    </div>
  );
}
