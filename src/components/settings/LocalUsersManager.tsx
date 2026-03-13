import { useState, useEffect } from 'preact/hooks';
import { inviteLocalUser, getLocalUsers, deleteLocalUser, resendLocalUserInvitation, type LocalUser } from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import { useI18n } from '../../lib/i18n/useI18n';
import { Mail, Trash2, RefreshCw, UserPlus } from 'lucide-preact';

export default function LocalUsersManager() {
  const { t } = useI18n();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');

  const hasCloudToken = TokenManager.getCloudAccessToken() !== null;

  useEffect(() => {
    if (hasCloudToken) {
      loadUsers();
    } else {
      setLoading(false);
      setError(t('settingsMenu.localUsers.noToken'));
    }
  }, [hasCloudToken, t]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const localUsers = await getLocalUsers();
      if (localUsers) {
        setUsers(localUsers);
      } else {
        const token = TokenManager.getCloudAccessToken();
        const refreshToken = TokenManager.getCloudRefreshToken();
        if (!token) {
          setError(t('settingsMenu.localUsers.noToken'));
        } else if (!refreshToken) {
          setError(t('settingsMenu.localUsers.tokenExpired'));
        } else {
          setError(t('settingsMenu.localUsers.loadError'));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: Event) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('common.required'));
      return;
    }

    try {
      setInviting(true);
      setError(null);
      setSuccess(null);

      const result = await inviteLocalUser(email.trim(), displayName.trim() || undefined);

      if (result.success) {
        setSuccess(t('settingsMenu.localUsers.inviteSuccess'));
        setEmail('');
        setDisplayName('');
        await loadUsers();
      } else {
        setError(result.message || t('settingsMenu.localUsers.inviteError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.inviteError'));
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!confirm(t('settingsMenu.localUsers.deleteConfirm', { email: userEmail }))) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const result = await deleteLocalUser(userId);

      if (result.success) {
        setSuccess(t('settingsMenu.localUsers.deleteSuccess'));
        await loadUsers();
      } else {
        setError(result.message || t('settingsMenu.localUsers.deleteError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.deleteError'));
    }
  };

  const handleResendInvitation = async (userId: string) => {
    try {
      setError(null);
      setSuccess(null);

      const result = await resendLocalUserInvitation(userId);

      if (result.success) {
        setSuccess(t('settingsMenu.localUsers.resendSuccess'));
      } else {
        setError(result.message || t('settingsMenu.localUsers.resendError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.resendError'));
    }
  };

  if (!hasCloudToken) {
    return (
      <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-error)] bg-[var(--ds-surface-error-muted)] p-4">
        <p className="ds-text-secondary text-sm">{t('settingsMenu.localUsers.mainAccountOnly')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="loading loading-spinner loading-lg text-[var(--ds-accent-violet)]" aria-hidden />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="ds-status-badge ds-status-badge--error w-full" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="ds-status-badge ds-status-badge--success w-full" role="status">
          {success}
        </div>
      )}

      <div class="sc-frame">
        <div class="sc-frame-body">
          <h3 className="ds-title-section text-[var(--ds-text-primary)] mb-2 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[var(--ds-accent-violet)]" strokeWidth={1.8} />
            {t('settingsMenu.localUsers.inviteTitle')}
          </h3>
          <p className="ds-text-secondary text-sm mb-4">{t('settingsMenu.localUsers.inviteDescription')}</p>
          <form onSubmit={handleInvite} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2">
                {t('settingsMenu.localUsers.emailRequired')}
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                placeholder={t('settingsMenu.localUsers.emailPlaceholder')}
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                required
                disabled={inviting}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2">
                {t('settingsMenu.localUsers.displayNameOptional')}
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                placeholder={t('settingsMenu.localUsers.displayNamePlaceholder')}
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                disabled={inviting}
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={inviting || !email.trim()}
            >
              {inviting ? (
                <>
                  <span className="loading loading-spinner loading-sm" aria-hidden />
                  {t('settingsMenu.localUsers.inviting')}
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" strokeWidth={1.8} />
                  {t('settingsMenu.localUsers.sendInvitation')}
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      <div class="sc-frame">
        <div class="sc-frame-body">
          <h3 className="ds-title-section text-[var(--ds-text-primary)] mb-4">
            {t('settingsMenu.localUsers.listTitle', { count: users.length })}
          </h3>

          {users.length === 0 ? (
            <p className="ds-text-tertiary text-sm text-center py-8">{t('settingsMenu.localUsers.noLocalUsers')}</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface)] border border-[var(--ds-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-[var(--ds-text-primary)] truncate">{user.email}</span>
                      {user.isActive ? (
                        <span className="ds-status-badge ds-status-badge--success">{t('settingsMenu.localUsers.active')}</span>
                      ) : (
                        <span className="ds-status-badge ds-status-badge--warning">{t('settingsMenu.localUsers.pending')}</span>
                      )}
                      {!user.emailVerified && (
                        <span className="ds-status-badge ds-status-badge--error">{t('settingsMenu.localUsers.emailNotVerified')}</span>
                      )}
                    </div>
                    {user.displayName && (
                      <p className="ds-text-secondary text-sm">{user.displayName}</p>
                    )}
                    <p className="ds-text-tertiary text-xs mt-1">
                      {t('settingsMenu.localUsers.createdOn', { date: new Date(user.createdAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!user.isActive && (
                      <button
                        type="button"
                        onClick={() => handleResendInvitation(user.id)}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                        title={t('settingsMenu.localUsers.resendInvitation')}
                        aria-label={t('settingsMenu.localUsers.resendInvitation')}
                      >
                        <RefreshCw className="w-4 h-4" strokeWidth={1.8} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(user.id, user.email)}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--ds-radius-sm)] border border-[var(--ds-accent-red-muted)] bg-[var(--ds-surface-elevated)] text-[var(--ds-accent-red)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)]"
                      title={t('settingsMenu.localUsers.delete')}
                      aria-label={t('settingsMenu.localUsers.delete')}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
