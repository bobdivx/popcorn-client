import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';

export default function TwoFactorSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEnableForm, setShowEnableForm] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);

  // Charger l'état de la 2FA
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getTwoFactorStatus();
      
      if (response.success && response.data) {
        setEnabled(response.data.enabled);
      } else {
        setError(response.message || 'Erreur lors du chargement de l\'état');
      }
    } catch (err) {
      setError('Erreur lors du chargement de l\'état');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEnable = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.enableTwoFactor();

      if (response.success) {
        setEnabled(true);
        setSuccess('Authentification à deux facteurs activée. Un code de test a été envoyé par email.');
        setShowEnableForm(false);
        setTimeout(loadStatus, 1000);
      } else {
        setError(response.message || 'Erreur lors de l\'activation');
      }
    } catch (err) {
      setError('Erreur lors de l\'activation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await serverApi.disableTwoFactor();

      if (response.success) {
        setEnabled(false);
        setSuccess('Authentification à deux facteurs désactivée');
        setShowDisableForm(false);
        setTimeout(loadStatus, 1000);
      } else {
        setError(response.message || 'Erreur lors de la désactivation');
      }
    } catch (err) {
      setError('Erreur lors de la désactivation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await serverApi.sendTwoFactorCode();

      if (response.success) {
        setSuccess('Code de vérification envoyé par email');
      } else {
        setError(response.message || 'Erreur lors de l\'envoi du code');
      }
    } catch (err) {
      setError('Erreur lors de l\'envoi du code');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (enabled === null && loading) {
    return (
      <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
        <div class="flex justify-center items-center min-h-[200px]">
          <span class="loading loading-spinner loading-lg text-white"></span>
        </div>
      </div>
    );
  }

  return (
    <div class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12">
      <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-6 sm:mb-8">Authentification à deux facteurs (2FA)</h2>
      
      {error && (
        <div class="alert alert-error mb-6">
          <span>{error}</span>
        </div>
      )}
      
      {success && (
        <div class="alert alert-success mb-6">
          <span>{success}</span>
        </div>
      )}

      <div class="mb-6 sm:mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4">
          <span class="text-lg sm:text-xl text-white font-semibold">État actuel :</span>
          <span class={`badge ${enabled ? 'badge-success' : 'badge-neutral'} text-sm sm:text-base px-3 sm:px-4 py-2`}>
            {enabled ? 'Activée' : 'Désactivée'}
          </span>
        </div>
        <p class="text-sm sm:text-base text-gray-400">
          {enabled 
            ? 'L\'authentification à deux facteurs est activée. Vous devrez entrer un code envoyé par email à chaque connexion.'
            : 'L\'authentification à deux facteurs ajoute une couche de sécurité supplémentaire à votre compte.'}
        </p>
      </div>

      {!enabled ? (
        <div>
          {!showEnableForm ? (
            <button
              onClick={() => setShowEnableForm(true)}
              disabled={loading}
              class="btn btn-primary w-full sm:w-auto"
            >
              Activer la 2FA
            </button>
          ) : (
            <div class="space-y-4 sm:space-y-6">
              <p class="text-gray-300 text-sm sm:text-base">
                En activant la 2FA, un code de test sera envoyé à votre adresse email. 
                Vous devrez entrer ce code lors de chaque connexion.
              </p>
              <div class="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleEnable}
                  disabled={loading}
                  class="btn btn-primary flex-1 sm:flex-none"
                >
                  {loading ? (
                    <>
                      <span class="loading loading-spinner loading-sm"></span>
                      Activation...
                    </>
                  ) : (
                    'Confirmer l\'activation'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowEnableForm(false);
                    setError(null);
                    setSuccess(null);
                  }}
                  disabled={loading}
                  class="btn btn-neutral flex-1 sm:flex-none"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {!showDisableForm ? (
            <div class="space-y-3">
              <button
                onClick={() => setShowDisableForm(true)}
                disabled={loading}
                class="btn btn-error w-full sm:w-auto"
              >
                Désactiver la 2FA
              </button>
              <button
                onClick={handleSendCode}
                disabled={loading}
                class="btn btn-neutral w-full sm:w-auto block"
              >
                {loading ? (
                  <>
                    <span class="loading loading-spinner loading-sm"></span>
                    Envoi...
                  </>
                ) : (
                  'Envoyer un nouveau code'
                )}
              </button>
            </div>
          ) : (
            <div class="space-y-4 sm:space-y-6">
              <p class="text-gray-300 text-sm sm:text-base">
                Pour désactiver la 2FA, veuillez confirmer en cliquant sur le bouton ci-dessous.
              </p>
              <div class="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDisable}
                  disabled={loading}
                  class="btn btn-error flex-1 sm:flex-none"
                >
                  {loading ? (
                    <>
                      <span class="loading loading-spinner loading-sm"></span>
                      Désactivation...
                    </>
                  ) : (
                    'Confirmer la désactivation'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowDisableForm(false);
                    setError(null);
                    setSuccess(null);
                  }}
                  disabled={loading}
                  class="btn btn-neutral flex-1 sm:flex-none"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
