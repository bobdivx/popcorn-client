import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import Avatar from '../ui/Avatar';
import { getLocalProfile, updateLocalProfile, type LocalProfile } from '../../lib/client/profile';
import { useI18n } from '../../lib/i18n';

export type AccountSection = 'profile' | 'info' | 'interface' | 'logout' | 'all';

interface AccountSettingsProps {
  section?: AccountSection;
}

export default function AccountSettings({ section = 'all' }: AccountSettingsProps) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    const p = getLocalProfile();
    setProfile(p);
    setDisplayName(p.displayName || '');
    setAvatarUrl(p.avatarDataUrl || '');
  }, []);

  const loadUser = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getMe();
      if (response.success && response.data) {
        setUser(response.data);
      } else {
        setError(response.message || 'Erreur lors du chargement des informations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[200px]">
        <span class="loading loading-spinner loading-lg text-[var(--ds-accent-violet)]" />
      </div>
    );
  }

  if (error) {
    return (
      <div class="ds-status-badge ds-status-badge--error w-full max-w-xl" role="alert">
        {error}
      </div>
    );
  }

  if (!user) {
    return (
      <div class="sc-frame">
        <div class="sc-frame-body" style="text-align:center">
          <p class="ds-text-secondary">{t('account.noUserInfo')}</p>
        </div>
      </div>
    );
  }

  const persist = (next: Partial<LocalProfile>) => {
    const merged = { ...profile, ...next };
    setProfile(merged);
    updateLocalProfile(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handlePickFile = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Veuillez sélectionner une image (PNG/JPG/WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      setError(null);
      setAvatarUrl(result);
      persist({ avatarDataUrl: result });
    };
    reader.readAsDataURL(file);
  };

  const showProfile = section === 'all' || section === 'profile';
  const showInfo = section === 'all' || section === 'info';
  const showInterface = section === 'all' || section === 'interface';

  return (
    <div class="space-y-6 sm:space-y-8">
      {showProfile && (
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-title">{t('account.profile')}</div>
          </div>
          <div class="sc-frame-body">

        {saved && (
          <div class="ds-status-badge ds-status-badge--success mb-6 w-fit" role="status">
            {t('common.success')}
          </div>
        )}

        {error && (
          <div class="ds-status-badge ds-status-badge--error mb-6 w-fit max-w-xl" role="alert">
            {error}
          </div>
        )}

            <div class="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
              <div class="flex items-center gap-4">
                <Avatar
                  email={user.email}
                  displayName={displayName}
                  profile={profile}
                  sizeClassName="w-20 h-20 sm:w-24 sm:h-24 tv:w-28 tv:h-28"
                  className="rounded-[var(--ds-radius-lg)]"
                />
                <div class="text-sm ds-text-secondary">
                  <div class="font-semibold text-[var(--ds-text-primary)]">{t('account.avatar')}</div>
                </div>
              </div>
              <div class="flex-1 w-full space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2">Nom affiché</label>
                  <input
                    type="text"
                    class="w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] form-tv-input tv:text-lg tv:min-h-[56px] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                placeholder="Ex: Alex"
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                onBlur={() => persist({ displayName: displayName.trim() || undefined })}
                tabIndex={0}
                data-focusable
              />
              <label class="label">
                <span class="label-text-alt text-gray-400">Optionnel. Sinon, l’email est utilisé.</span>
              </label>
            </div>

            <div class="form-control">
              <label class="label">
                <span class="label-text text-white font-semibold">Image d’avatar</span>
              </label>

              <div class="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  class="input input-bordered bg-black/30 border-white/10 text-white flex-1"
                  placeholder="Collez une URL d’image (https://...)"
                  value={avatarUrl}
                  onInput={(e) => setAvatarUrl((e.target as HTMLInputElement).value)}
                  onBlur={() => persist({ avatarDataUrl: avatarUrl.trim() || undefined })}
                />
                    <label class="inline-flex items-center justify-center min-h-[44px] px-4 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] text-sm font-medium hover:bg-white/10 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]">
                      Importer…
                      <input type="file" accept="image/*" class="hidden" onChange={(e) => handlePickFile((e.target as HTMLInputElement).files?.[0] || null)} />
                    </label>
                    <button
                      type="button"
                      class="min-h-[44px] px-4 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] text-sm font-medium hover:bg-white/10 form-tv-button tv:min-h-[56px] tv:px-6 tv:py-3 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
                      onClick={() => { setAvatarUrl(''); persist({ avatarDataUrl: undefined }); }}
                      tabIndex={0}
                      data-focusable
                    >
                      Supprimer
                    </button>
                  </div>
                  <p class="ds-text-tertiary text-xs mt-1">Conseil TV: privilégiez une image carrée (≥ 256×256).</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-title">Informations du compte</div>
          </div>
          <div class="sc-frame-body">
            <div class="space-y-6">
              <div>
                <label class="block text-sm font-semibold ds-text-secondary mb-2">Email</label>
                <p class="text-[var(--ds-text-primary)] text-lg">{user.email}</p>
              </div>
              <div>
                <label class="block text-sm font-semibold ds-text-secondary mb-2">ID</label>
                <p class="ds-text-secondary font-mono text-sm break-all">{user.id}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInterface && (
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-title">{t('account.interfaceSettings')}</div>
          </div>
          <div class="sc-frame-body">
            <p class="ds-text-secondary mb-6">{t('account.interfaceSettingsDescription')}</p>
            <a
              href="/settings?category=interface"
              class="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] hover:opacity-95 tv:min-h-[64px] tv:px-8 tv:py-4 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
              tabIndex={0}
              data-focusable
            >
              {t('account.openInterfaceSettings')}
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
