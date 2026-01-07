import { useEffect, useState } from 'preact/hooks';
import { serverApi } from '../lib/client/server-api';

export default function IndexRedirect() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        // Ne vérifier l'authentification que si on a un token
        if (!serverApi.isAuthenticated()) {
          window.location.href = '/login';
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est connecté
        const meResponse = await serverApi.getMe();
        
        if (meResponse.success) {
          // Utilisateur connecté, vérifier le setup
          const setupResponse = await serverApi.getSetupStatus();
          
          if (setupResponse.success && setupResponse.data) {
            if (setupResponse.data.needsSetup) {
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
          window.location.href = '/login';
        }
      } catch (error) {
        // Les erreurs 401 sont normales, on redirige simplement vers login
        window.location.href = '/login';
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
          <p className="mt-4 text-base-content">Chargement...</p>
        </div>
      </div>
    );
  }

  return null;
}
