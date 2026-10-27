import { useState, useEffect } from 'preact/hooks';
import {
  inviteLocalUser,
  getLocalUsers,
  deleteLocalUser,
  resendLocalUserInvitation,
  createLocalUserInviteLink,
  getLocalUserInviteLinks,
  revokeLocalUserInviteLink,
  getUserConfig,
  type LocalUser,
  type LocalUserInviteLink,
} from '../../lib/api/popcorn-web';
import { TokenManager } from '../../lib/client/storage';
import { useI18n } from '../../lib/i18n/useI18n';
import { Mail, Trash2, RefreshCw, UserPlus, Link2, Copy, Share2, Check, AlertTriangle } from 'lucide-preact';
import { useConfirmDialog } from '../ui/useConfirmDialog';
import { syncLocalUsersToBackend, removeLocalUserFromBackend } from '../../lib/client/local-users-sync';
import {
  checkBackendUrlForGuests,
  guestBackendIssueKey,
  type GuestBackendCheck,
} from '../../lib/local-users/guest-invite-readiness';

export default function LocalUsersManager() {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [links, setLinks] = useState<LocalUserInviteLink[]>([]);
  const [creatingLink, setCreatingLink] = useState(false);
  const [newLinkId, setNewLinkId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // URL du serveur enregistrée dans la config cloud (celle que reçoivent les invités) :
  // null = inconnue (config illisible), on n'avertit pas.
  const [serverCheck, setServerCheck] = useState<GuestBackendCheck | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function';

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
      const [localUsers, inviteLinks, cloudConfig] = await Promise.all([
        getLocalUsers(),
        getLocalUserInviteLinks(),
        getUserConfig().catch(() => null),
      ]);
      if (inviteLinks) setLinks(inviteLinks);
      setServerCheck(cloudConfig ? checkBackendUrlForGuests(cloudConfig.backendUrl) : null);
      if (localUsers) {
        setUsers(localUsers);
        // Invités AVEC mot de passe : les créer à l'avance sur le serveur pour que la connexion par
        // mot de passe y fonctionne. Ceux sans mot de passe sont créés par le serveur lui-même à
        // leur première connexion (lien / Quick Connect) : rien à faire (voir local-users-sync).
        if (localUsers.some((u) => u.isActive && u.hasPassword !== false)) {
          void syncLocalUsersToBackend();
        }
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

  /**
   * Serveur inutilisable par un invité (absent, HTTP, réseau local) : on prévient et on demande
   * confirmation avant d'inviter (l'invitation reste possible, le serveur peut être corrigé ensuite).
   */
  const confirmServerReadyForGuests = async (): Promise<boolean> => {
    if (!serverCheck || serverCheck.ok) return true;
    return confirm({
      title: t('settingsMenu.localUsers.serverWarningTitle'),
      message: `${t(guestBackendIssueKey(serverCheck.issue), { url: serverCheck.url })} ${t('settingsMenu.localUsers.serverWarningConfirm')}`,
      confirmLabel: t('settingsMenu.localUsers.inviteAnyway'),
    });
  };

  const handleInvite = async (e: Event) => {
    e.preventDefault();
    if (!email.trim()) {
      setError(t('common.required'));
      return;
    }
    if (!(await confirmServerReadyForGuests())) return;

    try {
      setInviting(true);
      setError(null);
      setSuccess(null);

      // Seul l'email est demandé : l'invité choisit lui-même son nom de profil à l'acceptation.
      const result = await inviteLocalUser(email.trim());

      if (result.success && result.emailSent === false) {
        setError(
          t('settingsMenu.localUsers.inviteEmailNotSent') +
            (result.emailError ? ` (${result.emailError})` : '')
        );
        setEmail('');
        await loadUsers();
      } else if (result.success) {
        setSuccess(t('settingsMenu.localUsers.inviteSuccess'));
        setEmail('');
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

  const handleDelete = async (userId: string, userLabel: string) => {
    if (!(await confirm({
      title: t('common.delete') || 'Supprimer',
      message: t('settingsMenu.localUsers.deleteConfirm', { name: userLabel }),
      danger: true,
      confirmLabel: t('common.delete') || 'Supprimer',
    }))) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const result = await deleteLocalUser(userId);

      if (result.success) {
        await removeLocalUserFromBackend(userId);
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

      if (result.success && result.emailSent === false) {
        setError(
          t('settingsMenu.localUsers.inviteEmailNotSent') +
            (result.emailError ? ` (${result.emailError})` : '')
        );
        await loadUsers();
      } else if (result.success) {
        setSuccess(t('settingsMenu.localUsers.resendSuccess'));
        await loadUsers();
      } else {
        setError(result.message || t('settingsMenu.localUsers.resendError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.resendError'));
    }
  };

  /** Copie dans le presse-papiers, avec repli pour les navigateurs TV / anciens WebView. */
  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* repli ci-dessous */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopyLink = async (link: LocalUserInviteLink) => {
    setError(null);
    const ok = await copyText(link.url);
    if (ok) {
      setCopiedId(link.id);
      setSuccess(t('settingsMenu.localUsers.linkCopied'));
      window.setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2500);
    } else {
      setError(t('settingsMenu.localUsers.copyFailed'));
    }
  };

  const handleShareLink = async (link: LocalUserInviteLink) => {
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: t('settingsMenu.localUsers.shareTitle'),
        text: t('settingsMenu.localUsers.shareText'),
        url: link.url,
      });
    } catch {
      /* partage annulé par l'utilisateur */
    }
  };

  const handleCreateLink = async () => {
    if (!(await confirmServerReadyForGuests())) return;
    try {
      setCreatingLink(true);
      setError(null);
      setSuccess(null);
      const result = await createLocalUserInviteLink();
      if (result.success && result.link) {
        const link = result.link;
        setLinks((prev) => [link, ...prev.filter((l) => l.id !== link.id)]);
        setNewLinkId(link.id);
        const copied = await copyText(link.url);
        if (copied) setCopiedId(link.id);
        setSuccess(t(copied ? 'settingsMenu.localUsers.linkCreatedCopied' : 'settingsMenu.localUsers.linkCreated'));
      } else {
        setError(result.message || t('settingsMenu.localUsers.linkCreateError'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settingsMenu.localUsers.linkCreateError'));
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (link: LocalUserInviteLink) => {
    if (!(await confirm({
      title: t('settingsMenu.localUsers.revokeLink'),
      message: t('settingsMenu.localUsers.revokeConfirm'),
      danger: true,
      confirmLabel: t('settingsMenu.localUsers.revokeLink'),
    }))) {
      return;
    }
    setError(null);
    setSuccess(null);
    const result = await revokeLocalUserInviteLink(link.id);
    if (result.success) {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      setSuccess(t('settingsMenu.localUsers.revokeSuccess'));
    } else {
      setError(result.message || t('settingsMenu.localUsers.revokeError'));
      await loadUsers();
    }
  };

  const iconBtn =
    'ds-focus-glow inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] text-sm hover:bg-[var(--ds-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-brand)]';

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

      {serverCheck && !serverCheck.ok && (
        <div
          className="flex items-start gap-3 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-error)] bg-[var(--ds-surface-error-muted)] p-4"
          role="alert"
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--ds-accent-red)]" strokeWidth={1.8} aria-hidden />
          <div className="min-w-0">
            <p className="font-semibold text-[var(--ds-text-primary)] text-sm mb-1">{t('settingsMenu.localUsers.serverWarningTitle')}</p>
            <p className="ds-text-secondary text-sm break-words">
              {t(guestBackendIssueKey(serverCheck.issue), { url: serverCheck.url })}
            </p>
            <p className="ds-text-tertiary text-xs mt-1">{t('settingsMenu.localUsers.serverWarningHint')}</p>
          </div>
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
          <h3 className="ds-title-section text-[var(--ds-text-primary)] mb-2 flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[var(--ds-brand)]" strokeWidth={1.8} />
            {t('settingsMenu.localUsers.linkInviteTitle')}
          </h3>
          <p className="ds-text-secondary text-sm mb-4">{t('settingsMenu.localUsers.linkInviteDescription')}</p>
          <button
            type="button"
            onClick={handleCreateLink}
            disabled={creatingLink}
            className="ds-focus-glow inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-brand)] text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--ds-brand)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creatingLink ? (
              <>
                <span className="loading loading-spinner loading-sm" aria-hidden />
                {t('settingsMenu.localUsers.creatingLink')}
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" strokeWidth={1.8} />
                {t('settingsMenu.localUsers.createLink')}
              </>
            )}
          </button>

          <h4 className="text-sm font-semibold text-[var(--ds-text-secondary)] mt-6 mb-3">
            {t('settingsMenu.localUsers.pendingLinksTitle', { count: links.length })}
          </h4>
          {links.length === 0 ? (
            <p className="ds-text-tertiary text-sm">{t('settingsMenu.localUsers.noPendingLinks')}</p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className={`p-4 rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface)] border ${link.id === newLinkId ? 'border-[var(--ds-brand)]' : 'border-[var(--ds-border)]'}`}
                >
                  <input
                    type="text"
                    readOnly
                    value={link.url}
                    aria-label={t('settingsMenu.localUsers.linkInviteTitle')}
                    onFocus={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full px-3 py-2 mb-2 bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--ds-brand)]"
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className={`text-xs ${link.expired ? 'text-[var(--ds-accent-red)]' : 'ds-text-tertiary'}`}>
                      {link.expired
                        ? t('settingsMenu.localUsers.linkExpired')
                        : link.expiresAt
                          ? t('settingsMenu.localUsers.linkExpiresOn', { date: new Date(link.expiresAt).toLocaleString() })
                          : ''}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!link.expired && (
                        <button
                          type="button"
                          onClick={() => handleCopyLink(link)}
                          className={iconBtn}
                          title={t('settingsMenu.localUsers.copyLink')}
                          aria-label={t('settingsMenu.localUsers.copyLink')}
                        >
                          {copiedId === link.id ? <Check className="w-4 h-4" strokeWidth={1.8} /> : <Copy className="w-4 h-4" strokeWidth={1.8} />}
                          <span>{copiedId === link.id ? t('settingsMenu.localUsers.copied') : t('settingsMenu.localUsers.copyLink')}</span>
                        </button>
                      )}
                      {!link.expired && canShare && (
                        <button
                          type="button"
                          onClick={() => handleShareLink(link)}
                          className={iconBtn}
                          title={t('settingsMenu.localUsers.shareLink')}
                          aria-label={t('settingsMenu.localUsers.shareLink')}
                        >
                          <Share2 className="w-4 h-4" strokeWidth={1.8} />
                          <span>{t('settingsMenu.localUsers.shareLink')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRevokeLink(link)}
                        className="ds-focus-glow inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-accent-red-muted)] bg-[var(--ds-surface-elevated)] text-[var(--ds-accent-red)] text-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)]"
                        title={t('settingsMenu.localUsers.revokeLink')}
                        aria-label={t('settingsMenu.localUsers.revokeLink')}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                        <span>{t('settingsMenu.localUsers.revokeLink')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
              {users.map((user) => {
                // Nom de profil d'abord ; l'email (ou l'identifiant généré) en second.
                const hasEmail = user.hasEmail !== false;
                const title = user.displayName || (hasEmail ? user.email : t('settingsMenu.localUsers.noEmail'));
                const showEmailBadge = user.isActive && user.inviteKind !== 'link' && hasEmail && !user.emailVerified;
                return (
                <div
                  key={user.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-[var(--ds-radius-sm)] bg-[var(--ds-surface)] border border-[var(--ds-border)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-[var(--ds-text-primary)] truncate">{title}</span>
                      {user.isActive ? (
                        <span className="ds-status-badge ds-status-badge--success">{t('settingsMenu.localUsers.active')}</span>
                      ) : (
                        <span className="ds-status-badge ds-status-badge--warning">{t('settingsMenu.localUsers.pending')}</span>
                      )}
                      {user.inviteKind === 'link' && (
                        <span className="ds-status-badge">{t('settingsMenu.localUsers.viaLink')}</span>
                      )}
                      {showEmailBadge && (
                        <span className="ds-status-badge ds-status-badge--error">{t('settingsMenu.localUsers.emailNotVerified')}</span>
                      )}
                    </div>
                    {(user.displayName || !hasEmail) && (
                      <p className="ds-text-secondary text-sm truncate">
                        {hasEmail ? user.email : t('settingsMenu.localUsers.loginId', { id: user.email })}
                      </p>
                    )}
                    <p className="ds-text-tertiary text-xs mt-1">
                      {t('settingsMenu.localUsers.createdOn', { date: new Date(user.createdAt).toLocaleDateString() })}
                    </p>
                    {!user.isActive && user.lastEmailStatus && user.lastEmailSentAt && (
                      <p
                        className={`text-xs mt-1 ${user.lastEmailStatus === 'sent' ? 'text-[var(--ds-accent-green,#22c55e)]' : 'text-[var(--ds-accent-red,#ef4444)]'}`}
                        title={user.lastEmailError || undefined}
                      >
                        {user.lastEmailStatus === 'sent'
                          ? t('settingsMenu.localUsers.lastEmailSent', { date: new Date(user.lastEmailSentAt).toLocaleString() })
                          : t('settingsMenu.localUsers.lastEmailFailed', {
                              date: new Date(user.lastEmailSentAt).toLocaleString(),
                              error: user.lastEmailError || '',
                            })}
                      </p>
                    )}
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
                      onClick={() => handleDelete(user.id, user.displayName || user.email)}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--ds-radius-sm)] border border-[var(--ds-accent-red-muted)] bg-[var(--ds-surface-elevated)] text-[var(--ds-accent-red)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)]"
                      title={t('settingsMenu.localUsers.delete')}
                      aria-label={t('settingsMenu.localUsers.delete')}
                    >
                      <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
