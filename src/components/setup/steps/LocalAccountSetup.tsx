import { useState } from 'preact/hooks';
import { serverApi } from '../../../lib/client/server-api';
import { useI18n } from '../../../lib/i18n';
import {
  LOCAL_ACCOUNT_MIN_PASSWORD_LENGTH,
  createLocalAccount,
  validateLocalAccountForm,
} from '../../../lib/setup/local-account-setup';
import { StepHeader, Alert, Spinner, IconArrowRight } from '../wizardUi';

interface LocalAccountSetupProps {
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  /** Called once the local account exists and the session is open. */
  onCreated: () => void | Promise<void>;
  /** Shows the existing Popcornn account options (QR code, Pocket ID, email). */
  onUseOnlineAccount: () => void;
}

/**
 * Microsoft Store edition — first launch: create the local administrator account of the server
 * embedded in the app (stored on this PC only, no internet account needed).
 */
export function LocalAccountSetup({ buttonRefs, onCreated, onUseOnlineAccount }: LocalAccountSetupProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    const invalid = validateLocalAccountForm(email, password, confirm);
    if (invalid) {
      setError(t(`wizard.localAccount.errors.${invalid}`, { min: LOCAL_ACCOUNT_MIN_PASSWORD_LENGTH }));
      return;
    }
    setLoading(true);
    try {
      const result = await createLocalAccount(serverApi, email, password);
      if (!result.ok) {
        setError(t('wizard.localAccount.errors.failed', { message: result.message }));
        return;
      }
      await onCreated();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="local-account-setup" data-testid="local-account-setup">
      <StepHeader
        kicker={t('wizard.localAccount.kicker')}
        title={t('wizard.localAccount.title')}
        lead={t('wizard.localAccount.description')}
      />

      {error && (
        <Alert tone="error" style="margin-bottom:16px;">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit} style="max-width:460px;">
        <div class="auth-field">
          <label class="wz-label" for="local-account-email">{t('wizard.localAccount.email')}</label>
          <input
            id="local-account-email"
            class="wz-input"
            type="email"
            placeholder={t('wizard.localAccount.emailPlaceholder')}
            value={email}
            onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
            required
            disabled={loading}
            autocomplete="username"
          />
          <p class="wz-text-sm" style="margin-top:6px;">{t('wizard.localAccount.emailHint')}</p>
        </div>
        <div class="auth-field">
          <label class="wz-label" for="local-account-password">{t('wizard.auth.password')}</label>
          <input
            id="local-account-password"
            class="wz-input"
            type="password"
            placeholder={t('wizard.auth.passwordMinLengthHint')}
            value={password}
            onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
            required
            disabled={loading}
            autocomplete="new-password"
          />
        </div>
        <div class="auth-field">
          <label class="wz-label" for="local-account-confirm">{t('wizard.auth.confirmPassword')}</label>
          <input
            id="local-account-confirm"
            class="wz-input"
            type="password"
            placeholder={t('wizard.auth.confirmPasswordPlaceholder')}
            value={confirm}
            onInput={(e) => setConfirm((e.target as HTMLInputElement).value)}
            required
            disabled={loading}
            autocomplete="new-password"
          />
        </div>
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          type="submit"
          class="wz-btn wz-btn--primary wz-btn--block"
          data-focusable
          disabled={loading || !email || !password || !confirm}
        >
          {loading ? <Spinner /> : null}
          {loading ? t('wizard.localAccount.creating') : t('wizard.localAccount.create')}
          {loading ? null : <IconArrowRight />}
        </button>
      </form>

      <div class="wz-divider">{t('wizard.localAccount.or')}</div>
      <button
        ref={(el) => { buttonRefs.current[1] = el; }}
        type="button"
        class="wz-btn wz-btn--ghost wz-btn--block"
        style="max-width:460px;"
        data-focusable
        disabled={loading}
        onClick={onUseOnlineAccount}
      >
        {t('wizard.localAccount.useOnlineAccount')}
      </button>
    </div>
  );
}
