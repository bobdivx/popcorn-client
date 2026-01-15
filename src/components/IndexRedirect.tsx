import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';

export default function IndexRedirect() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Chargement...');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        setMessage('Vérification du serveur...');
        // D'abord vérifier le statut du setup pour savoir si la DB est vide
        const setupResponse = await serverApi.getSetupStatus();
        
        console.log('[IndexRedirect] Setup response:', setupResponse);
        
        if (setupResponse.success && setupResponse.data) {
          // Si le backend n'est pas joignable (ex: reboot), ne pas basculer vers /setup.
          // On réessaie quelques fois et on laisse le composant afficher un spinner.
          if (setupResponse.data.backendReachable === false) {
            setMessage('Démarrage du serveur... (réessai)');
            const next = attempt + 1;
            setAttempt(next);
            if (next < 10) {
              setTimeout(checkAndRedirect, 1000);
              return;
            }
            // Après plusieurs tentatives, basculer vers le setup:
            // c'est l'écran qui permet notamment de configurer l'URL du backend.
            window.location.href = '/setup';
            setLoading(false);
            return;
          }

          console.log('[IndexRedirect] hasUsers:', setupResponse.data.hasUsers);
          // Si pas d'utilisateurs dans la DB (première installation), rediriger vers setup
          if (setupResponse.data.backendReachable !== false && setupResponse.data.hasUsers === false) {
            console.log('[IndexRedirect] DB vide, redirection vers /setup');
            window.location.href = '/setup';
            setLoading(false);
            return;
          }
        }

        // Si la DB contient des utilisateurs, vérifier l'authentification
        // Ne vérifier l'authentification que si on a un token
        if (!serverApi.isAuthenticated()) {
          setMessage('Redirection vers la connexion...');
          window.location.href = '/login';
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est connecté
        setMessage('Validation de la session...');
        const meResponse = await serverApi.getMe();
        
        if (meResponse.success) {
          // Utilisateur connecté, vérifier le setup
          setMessage('Finalisation...');
          const setupResponse2 = await serverApi.getSetupStatus();
          
          if (setupResponse2.success && setupResponse2.data) {
            if (setupResponse2.data.backendReachable !== false && setupResponse2.data.needsSetup) {
              window.location.href = '/setup';
            } else {
              window.location.href = '/dashboard';
            }
          } else {
            // En cas d'erreur, rediriger vers le dashboard (ne pas bloquer l'utilisateur)
            window.location.href = '/dashboard';
          }
        } else {
          // Utilisateur non connecté (token invalide ou expiré)
          setMessage('Redirection vers la connexion...');
          window.location.href = '/login';
        }
      } catch (error) {
        // En cas d'erreur, vérifier si on peut accéder au setup
        // Si setup accessible, rediriger vers setup (DB peut être vide)
        // Sinon, rediriger vers login
        try {
          setMessage('Récupération du statut... (réessai)');
          const setupResponse = await serverApi.getSetupStatus();
          if (setupResponse.success && setupResponse.data?.backendReachable === false) {
            const next = attempt + 1;
            setAttempt(next);
            if (next < 10) {
              setTimeout(checkAndRedirect, 1000);
              return;
            }
            window.location.href = '/setup';
            return;
          }
          if (setupResponse.success && setupResponse.data?.backendReachable !== false && setupResponse.data?.hasUsers === false) {
            window.location.href = '/setup';
          } else {
            window.location.href = '/login';
          }
        } catch {
          window.location.href = '/login';
        }
      } finally {
        setLoading(false);
      }
    };

    checkAndRedirect();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-base-100">
        <div className="text-center">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="mt-4 text-base-content">{message}</p>
        </div>
      </div>
    );
  }

  return null;
}
