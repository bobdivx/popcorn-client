import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { TokenManager } from '../../lib/client/storage';
import { getGuestWebToken } from '../../lib/client/guest-web-session';
import { getLocalUserMe, updateLocalUserPassword } from '../../lib/api/popcorn-web';
import { isLocalUser } from '../../lib/permissions';

const inputClass =
  'w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]';

/**
 * Invité : définir un mot de passe (en plus de la connexion par lien / Quick Connect).
 *
 * Il faut une preuve d'identité récente : le jeton popcorn-web obtenu à la dernière connexion par
 * lien ou Quick Connect (≈ 1 h). Seule la DÉFINITION d'un premier mot de passe est proposée :
 * le serveur du propriétaire garde en cache le mot de passe déjà connu d'un invité, un changement
 * ne serait donc pas pris en compte pour la connexion sur ce serveur.
 */
export default function GuestPasswordSettings() {
  const { t } = useI18n();
  const user = TokenManager.getUser();
  const userId: string | undefined = user?.id;
  const loginId: string = user?.email || '';
  const [token] = useState<string | null>(() => getGuestWebToken(userId));
  const [state, setState] = useState<'loading' | 'needSession' | 'form' | 'alreadySet' | 'done'>(
    token ? 'loading' : 'needSession'
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getLocalUserMe(token).then((me) => {
      if (cancelled) return;
      if (!me || me.id !== userId) setState('needSession');
      else setState(me.has_password ? 'alreadySet' : 'form');
    });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  if (!isLocalUser()) return null;

  const onSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(t('settingsMenu.guestPassword.tooShort'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('settingsMenu.guestPassword.mismatch'));
      return;
    }
    const fresh = getGuestWebToken(userId);
    if (!fresh) {
      setState('needSession');
      return;
    }
    setSaving(true);
    const r = await updateLocalUserPassword({ newPassword: password, guestToken: fresh, userId });
    setSaving(false);
    if (r.success) {
      setPassword('');
      setConfirmPassword('');
      setState('done');
      return;
    }
    if (r.error === 'Unauthorized' || r.error === 'Forbidden') setState('needSession');
    else if (r.error === 'CurrentPasswordRequired') setState('alreadySet');
    else if (r.error === 'TooManyRequests') setError(t('settingsMenu.guestPassword.tooMany'));
    else setError(r.message || t('settingsMenu.guestPassword.error'));
  };

  const box = (text: string, tone: 'info' | 'success' = 'info') => (
    <div
      className={`ds-status-badge ${tone === 'success' ? 'ds-status-badge--success' : ''} w-full`}
      role={tone === 'success' ? 'status' : undefined}
    >
      {text}
    </div>
  );

  return (
    <div className="sc-frame max-w-xl">
      <div className="sc-frame-body space-y-4">
        {loginId && (
          <p className="ds-text-secondary text-sm break-words">
            {t('settingsMenu.guestPassword.loginId', { id: loginId })}
          </p>
        )}
        {state === 'loading' && (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" aria-hidden />
          </div>
        )}
        {state === 'needSession' && box(t('settingsMenu.guestPassword.needSession'))}
        {state === 'alreadySet' && box(t('settingsMenu.guestPassword.alreadySet'))}
        {state === 'done' && box(t('settingsMenu.guestPassword.success', { id: loginId }), 'success')}
        {state === 'form' && (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="ds-text-secondary text-sm">{t('settingsMenu.guestPassword.intro')}</p>
            {/* Identifiant pour les gestionnaires de mots de passe. */}
            <input type="text" name="username" autoComplete="username" value={loginId} readOnly hidden />
            <div>
              <label className="block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2" for="guest-new-password">
                {t('settingsMenu.guestPassword.newPassword')}
              </label>
              <input
                id="guest-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={512}
                required
                className={inputClass}
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2" for="guest-confirm-password">
                {t('settingsMenu.guestPassword.confirmPassword')}
              </label>
              <input
                id="guest-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={512}
                required
                className={inputClass}
                value={confirmPassword}
                onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                disabled={saving}
              />
            </div>
            {error && (
              <div className="ds-status-badge ds-status-badge--error w-full" role="alert">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={saving || !password || !confirmPassword}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? t('settingsMenu.guestPassword.saving') : t('settingsMenu.guestPassword.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
