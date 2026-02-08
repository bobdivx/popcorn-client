import { useState, useEffect } from 'preact/hooks';
import { inviteLocalUser, getLocalUsers, deleteLocalUser, resendLocalUserInvitation, type LocalUser } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import { useI18n } from '../../lib/i18n/useI18n';
import { Users, Mail, Trash2, RefreshCw, UserPlus } from 'lucide-preact';

export default function LocalUsersManager() {
  const { t } = useI18n();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Vérifier si l'utilisateur a un token cloud (compte principal)
  const hasCloudToken = TokenManager.getCloudAccessToken() !== null;

  useEffect(() => {
    if (hasCloudToken) {
      loadUsers();
    } else {
      setLoading(false);
      setError('Accès réservé au compte principal');
    }
  }, [hasCloudToken]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const localUsers = await getLocalUsers();
      if (localUsers) {
        setUsers(localUsers);
      } else {
        // Vérifier si c'est un problème de token
        const token = TokenManager.getCloudAccessToken();
        const refreshToken = TokenManager.getCloudRefreshToken();
        if (!token) {
          setError('Aucun token cloud disponible. Veuillez vous reconnecter avec votre compte principal depuis la page de connexion.');
        } else if (!refreshToken) {
          setError('Token cloud expiré et aucun refresh token disponible. Veuillez vous reconnecter avec votre compte principal.');
        } else {
          setError('Impossible de charger les utilisateurs locaux. Le token cloud est peut-être expiré. Veuillez vous reconnecter avec votre compte principal.');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: Event) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Veuillez entrer un email');
      return;
    }

    try {
      setInviting(true);
      setError(null);
      setSuccess(null);

      const result = await inviteLocalUser(email.trim(), displayName.trim() || undefined);
      
      if (result.success) {
        setSuccess(result.message || 'Invitation envoyée avec succès');
        setEmail('');
        setDisplayName('');
        await loadUsers();
      } else {
        setError(result.message || 'Erreur lors de l\'envoi de l\'invitation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi de l\'invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${userEmail} ?`)) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const result = await deleteLocalUser(userId);
      
      if (result.success) {
        setSuccess(result.message || 'Utilisateur supprimé avec succès');
        await loadUsers();
      } else {
        setError(result.message || 'Erreur lors de la suppression');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  const handleResendInvitation = async (userId: string) => {
    try {
      setError(null);
      setSuccess(null);

      const result = await resendLocalUserInvitation(userId);
      
      if (result.success) {
        setSuccess(result.message || 'Invitation renvoyée avec succès');
      } else {
        setError(result.message || 'Erreur lors du réenvoi de l\'invitation');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du réenvoi de l\'invitation');
    }
  };

  if (!hasCloudToken) {
    return (
      <div class="bg-red-900/30 border border-red-700 rounded-lg p-6">
        <p class="text-red-300">
          Cette page est réservée au compte principal. Veuillez vous connecter avec votre compte cloud.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div class="flex justify-center items-center py-12">
        <div class="loading loading-spinner loading-lg text-primary-600"></div>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold text-white mb-2 flex items-center gap-2">
          <Users class="w-6 h-6" />
          Gestion des utilisateurs locaux
        </h2>
        <p class="text-gray-400">
          Invitez des utilisateurs à créer un compte local avec des permissions limitées.
        </p>
      </div>

      {error && (
        <div class="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p class="text-red-300">{error}</p>
        </div>
      )}

      {success && (
        <div class="bg-green-900/30 border border-green-700 rounded-lg p-4">
          <p class="text-green-300">{success}</p>
        </div>
      )}

      {/* Formulaire d'invitation */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <UserPlus class="w-5 h-5" />
          Inviter un utilisateur local
        </h3>
        <form onSubmit={handleInvite} class="space-y-4">
          <div>
            <label class="block text-sm font-semibold text-white mb-2">
              Email *
            </label>
            <input
              type="email"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="utilisateur@example.com"
              value={email}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              required
              disabled={inviting}
            />
          </div>
          <div>
            <label class="block text-sm font-semibold text-white mb-2">
              Nom d'affichage (optionnel)
            </label>
            <input
              type="text"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent"
              placeholder="Jean Dupont"
              value={displayName}
              onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
              disabled={inviting}
            />
          </div>
          <button
            type="submit"
            class="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            disabled={inviting || !email.trim()}
          >
            {inviting ? (
              <>
                <span class="loading loading-spinner loading-sm"></span>
                Envoi en cours...
              </>
            ) : (
              <>
                <Mail class="w-4 h-4" />
                Envoyer l'invitation
              </>
            )}
          </button>
        </form>
      </div>

      {/* Liste des utilisateurs */}
      <div class="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h3 class="text-lg font-semibold text-white mb-4">
          Utilisateurs locaux ({users.length})
        </h3>
        
        {users.length === 0 ? (
          <p class="text-gray-400 text-center py-8">
            Aucun utilisateur local pour le moment
          </p>
        ) : (
          <div class="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                class="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center justify-between"
              >
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-1">
                    <p class="text-white font-semibold">{user.email}</p>
                    {user.isActive ? (
                      <span class="badge badge-success badge-sm">Actif</span>
                    ) : (
                      <span class="badge badge-warning badge-sm">En attente</span>
                    )}
                    {!user.emailVerified && (
                      <span class="badge badge-error badge-sm">Email non vérifié</span>
                    )}
                  </div>
                  {user.displayName && (
                    <p class="text-gray-400 text-sm">{user.displayName}</p>
                  )}
                  <p class="text-gray-500 text-xs mt-1">
                    Créé le {new Date(user.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  {!user.isActive && (
                    <button
                      onClick={() => handleResendInvitation(user.id)}
                      class="btn btn-sm btn-outline"
                      title="Renvoyer l'invitation"
                    >
                      <RefreshCw class="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(user.id, user.email)}
                    class="btn btn-sm btn-error"
                    title="Supprimer"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
