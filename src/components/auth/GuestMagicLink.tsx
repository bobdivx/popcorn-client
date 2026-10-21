import { useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { getPopcornWebApiUrl } from '../../lib/api/popcorn-web';

/**
 * Connexion sans mot de passe des profils invités : envoie un lien de connexion à usage unique
 * (15 min) par email via popcorn-web. Réponse identique que l'adresse existe ou non.
 */
export default function GuestMagicLink({ initialEmail = '' }: { initialEmail?: string }) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (e: Event) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch(`${getPopcornWebApiUrl()}/local-users/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), lang: language === 'en' ? 'en' : 'fr' }),
      });
      if (res.status === 429) {
        setMessage({ ok: false, text: t('loginForm.guestLink.tooMany') });
      } else if (!res.ok) {
        setMessage({ ok: false, text: t('loginForm.guestLink.error') });
      } else {
        setMessage({ ok: true, text: t('loginForm.guestLink.sent') });
      }
    } catch {
      setMessage({ ok: false, text: t('loginForm.guestLink.error') });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <div className="text-center mt-4">
        <button
          type="button"
          data-focusable
          className="text-sm text-gray-300 hover:text-white underline underline-offset-4"
          onClick={() => setOpen(true)}
        >
          {t('loginForm.guestLink.open')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="mt-5 p-4 rounded-lg border border-white/15 bg-white/5 space-y-3">
      <p className="text-sm text-gray-300">{t('loginForm.guestLink.help')}</p>
      <input
        type="email"
        required
        autocomplete="email"
        className="form-tv-input w-full px-3 py-2.5 rounded bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        placeholder={t('loginForm.emailPlaceholder')}
        value={email}
        onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
        data-focusable
      />
      <button
        type="submit"
        data-focusable
        disabled={sending}
        className="form-tv-button w-full bg-white/15 hover:bg-white/25 text-white font-medium py-2.5 rounded text-sm transition-colors disabled:opacity-50"
      >
        {sending ? t('loginForm.guestLink.sending') : t('loginForm.guestLink.send')}
      </button>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-green-400' : 'text-red-300'}`} role="status">
          {message.text}
        </p>
      )}
    </form>
  );
}
