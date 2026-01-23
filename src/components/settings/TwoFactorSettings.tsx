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
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body">
          <span className="loading loading-spinner loading-md text-white"></span>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 shadow-lg">
      <div className="card-body">
        <h2 className="card-title">Authentification à deux facteurs (2FA)</h2>
        
        {error && (
          <div className="alert alert-error mt-4">
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="alert alert-success mt-4">
            <span>{success}</span>
          </div>
        )}

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg">État actuel :</span>
            <span className={`badge ${enabled ? 'badge-success' : 'badge-neutral'}`}>
              {enabled ? 'Activée' : 'Désactivée'}
            </span>
          </div>
          <p className="text-sm text-gray-400 mb-4">
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
                className="btn btn-primary"
              >
                Activer la 2FA
              </button>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-300">
                  En activant la 2FA, un code de test sera envoyé à votre adresse email. 
                  Vous devrez entrer ce code lors de chaque connexion.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleEnable}
                    disabled={loading}
                    className="btn btn-primary"
                  >
                    {loading ? 'Activation...' : 'Confirmer l\'activation'}
                  </button>
                  <button
                    onClick={() => {
                      setShowEnableForm(false);
                      setError(null);
                      setSuccess(null);
                    }}
                    disabled={loading}
                    className="btn btn-neutral"
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
              <div className="space-y-3">
                <button
                  onClick={() => setShowDisableForm(true)}
                  disabled={loading}
                  className="btn btn-error"
                >
                  Désactiver la 2FA
                </button>
                <button
                  onClick={handleSendCode}
                  disabled={loading}
                  className="btn btn-neutral block"
                >
                  {loading ? 'Envoi...' : 'Envoyer un nouveau code'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-300">
                  Pour désactiver la 2FA, veuillez confirmer en cliquant sur le bouton ci-dessous.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDisable}
                    disabled={loading}
                    className="btn btn-error"
                  >
                    {loading ? 'Désactivation...' : 'Confirmer la désactivation'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDisableForm(false);
                      setError(null);
                      setSuccess(null);
                    }}
                    disabled={loading}
                    className="btn btn-neutral"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
