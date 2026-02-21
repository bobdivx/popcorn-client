import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import Avatar from '../ui/Avatar';
import { getLocalProfile, updateLocalProfile, type LocalProfile } from '../../lib/client/profile';
import { redirectTo } from '../../lib/utils/navigation.js';
import { useI18n } from '../../lib/i18n';
import { DsCard, DsCardSection } from '../ui/design-system';
import { Modal } from '../ui/Modal';
import TwoFactorSettings from './TwoFactorSettings';
import { Shield } from 'lucide-preact';

export type AccountSection = 'profile' | 'info' | 'logout' | 'all';

interface AccountSettingsProps {
  section?: AccountSection;
}

const inputClass =
  'w-full px-4 py-3 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] placeholder-[var(--ds-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] form-tv-input tv:text-lg tv:min-h-[56px]';
const labelClass = 'block text-sm font-semibold text-[var(--ds-text-secondary)] mb-2';
const btnSecondaryClass =
  'min-h-[44px] px-4 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] text-sm font-medium hover:bg-[var(--ds-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] form-tv-button tv:min-h-[56px] tv:px-6 tv:py-3';

export default function AccountSettings({ section = 'all' }: AccountSettingsProps) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
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
        setError(response.message || t('common.error'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <span className="loading loading-spinner loading-lg text-[var(--ds-accent-violet)]" aria-hidden />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="ds-status-badge ds-status-badge--error w-full max-w-xl" role="alert">
        {error}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="ds-card rounded-[var(--ds-radius-lg)] px-4 py-6 text-center">
        <p className="ds-text-secondary">{t('account.noUserInfo')}</p>
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
      setError(t('account.invalidImage'));
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
  const showLogout = section === 'all' || section === 'logout';

  const isUnified = section === 'all';

  if (isUnified) {
    return (
      <>
      <DsCard variant="elevated">
        <DsCardSection className="space-y-6">
          {saved && (
            <div className="ds-status-badge ds-status-badge--success w-fit" role="status">
              {t('common.success')}
            </div>
          )}
          {error && (
            <div className="ds-status-badge ds-status-badge--error w-full max-w-xl" role="alert">
              {error}
            </div>
          )}

          {/* Identité : avatar + nom affiché */}
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <Avatar
                email={user.email}
                displayName={displayName}
                profile={profile}
                sizeClassName="w-20 h-20 sm:w-24 sm:h-24 tv:w-28 tv:h-28"
                className="rounded-[var(--ds-radius-lg)]"
              />
              <span className="text-xs ds-text-tertiary">{t('account.avatar')}</span>
            </div>
            <div className="flex-1 w-full min-w-0">
              <label className={labelClass}>{t('account.displayName')}</label>
              <input
                type="text"
                className={inputClass}
                placeholder={t('account.displayNamePlaceholder')}
                value={displayName}
                onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                onBlur={() => persist({ displayName: displayName.trim() || undefined })}
                tabIndex={0}
                data-focusable
              />
              <p className="ds-text-tertiary text-xs mt-1">{t('account.displayNameOptionalHint')}</p>
            </div>
          </div>

          {/* Image d'avatar : URL + import / supprimer */}
          <div>
            <label className={labelClass}>{t('account.avatarUrl')}</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                className={inputClass}
                placeholder={t('account.avatarUrlPlaceholder')}
                value={avatarUrl}
                onInput={(e) => setAvatarUrl((e.target as HTMLInputElement).value)}
                onBlur={() => persist({ avatarDataUrl: avatarUrl.trim() || undefined })}
                data-focusable
              />
              <label className={`inline-flex items-center justify-center cursor-pointer ${btnSecondaryClass}`}>
                {t('account.uploadAvatar')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handlePickFile((e.target as HTMLInputElement).files?.[0] || null)}
                />
              </label>
              <button
                type="button"
                className={btnSecondaryClass}
                onClick={() => {
                  setAvatarUrl('');
                  persist({ avatarDataUrl: undefined });
                }}
                tabIndex={0}
                data-focusable
              >
                {t('account.removeAvatar')}
              </button>
            </div>
            <p className="ds-text-tertiary text-xs mt-1">{t('account.avatarTvHint')}</p>
          </div>

          {/* Informations du compte (lecture seule) */}
          <div className="pt-4 border-t border-[var(--ds-border)]">
            <h3 className="ds-title-section text-[var(--ds-text-primary)] mb-3">
              {t('account.subMenu.accountInfo')}
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wider mb-1">
                  {t('account.email')}
                </dt>
                <dd className="text-[var(--ds-text-primary)] font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wider mb-1">
                  {t('account.userId')}
                </dt>
                <dd className="ds-text-secondary font-mono text-sm break-all">{user.id}</dd>
              </div>
            </dl>
          </div>

          {/* Authentification à deux facteurs + Déconnexion (même ligne) */}
          <div className="pt-4 border-t border-[var(--ds-border)]">
            <h3 className="ds-title-section text-[var(--ds-text-primary)] mb-2">
              {t('account.twoFactor.title')}
            </h3>
            <p className="ds-text-secondary text-sm mb-4">
              {t('account.twoFactor.descriptionShort')}
            </p>
            <p className="ds-text-secondary text-sm mb-3">{t('account.subMenu.logoutDesc')}</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShow2FAModal(true)}
                className={`inline-flex items-center justify-center gap-2 ${btnSecondaryClass}`}
                data-focusable
              >
                <Shield className="w-4 h-4" strokeWidth={1.8} />
                {t('account.twoFactor.configure')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await serverApi.logout();
                  } catch (err) {
                    console.error('Logout error:', err);
                  }
                  redirectTo('/login');
                }}
                className="min-h-[48px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-red)] text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] tv:min-h-[56px] tv:px-8 tv:py-4"
                tabIndex={0}
                data-focusable
              >
                {t('account.logout')}
              </button>
            </div>
          </div>
        </DsCardSection>
      </DsCard>

      <Modal
        isOpen={show2FAModal}
        onClose={() => setShow2FAModal(false)}
        title={t('account.twoFactor.title')}
        size="md"
      >
        <TwoFactorSettings />
      </Modal>
    </>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {showProfile && (
        <DsCard variant="elevated">
          <DsCardSection title={t('account.profile')}>
            {saved && (
              <div className="ds-status-badge ds-status-badge--success mb-4 w-fit" role="status">
                {t('common.success')}
              </div>
            )}
            {error && (
              <div className="ds-status-badge ds-status-badge--error mb-4 w-fit max-w-xl" role="alert">
                {error}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
              <div className="flex flex-col items-center gap-2 flex-shrink-0">
                <Avatar
                  email={user.email}
                  displayName={displayName}
                  profile={profile}
                  sizeClassName="w-20 h-20 sm:w-24 sm:h-24"
                  className="rounded-[var(--ds-radius-lg)]"
                />
                <span className="text-xs ds-text-tertiary">{t('account.avatar')}</span>
              </div>
              <div className="flex-1 w-full space-y-4">
                <div>
                  <label className={labelClass}>{t('account.displayName')}</label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder={t('account.displayNamePlaceholder')}
                    value={displayName}
                    onInput={(e) => setDisplayName((e.target as HTMLInputElement).value)}
                    onBlur={() => persist({ displayName: displayName.trim() || undefined })}
                    data-focusable
                  />
                  <p className="ds-text-tertiary text-xs mt-1">{t('account.displayNameOptionalHint')}</p>
                </div>
                <div>
                  <label className={labelClass}>{t('account.avatarUrl')}</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder={t('account.avatarUrlPlaceholder')}
                      value={avatarUrl}
                      onInput={(e) => setAvatarUrl((e.target as HTMLInputElement).value)}
                      onBlur={() => persist({ avatarDataUrl: avatarUrl.trim() || undefined })}
                    />
                    <label className={`inline-flex items-center justify-center cursor-pointer ${btnSecondaryClass}`}>
                      {t('account.uploadAvatar')}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePickFile((e.target as HTMLInputElement).files?.[0] || null)}
                      />
                    </label>
                    <button
                      type="button"
                      className={btnSecondaryClass}
                      onClick={() => {
                        setAvatarUrl('');
                        persist({ avatarDataUrl: undefined });
                      }}
                      data-focusable
                    >
                      {t('account.removeAvatar')}
                    </button>
                  </div>
                  <p className="ds-text-tertiary text-xs mt-1">{t('account.avatarTvHint')}</p>
                </div>
              </div>
            </div>
          </DsCardSection>
        </DsCard>
      )}

      {showInfo && (
        <DsCard variant="elevated">
          <DsCardSection title={t('account.subMenu.accountInfo')}>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wider mb-1">
                  {t('account.email')}
                </dt>
                <dd className="text-[var(--ds-text-primary)] font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--ds-text-tertiary)] uppercase tracking-wider mb-1">
                  {t('account.userId')}
                </dt>
                <dd className="ds-text-secondary font-mono text-sm break-all">{user.id}</dd>
              </div>
            </dl>
          </DsCardSection>
        </DsCard>
      )}

      {showLogout && (
        <DsCard variant="elevated" className="border border-[var(--ds-accent-red-muted)]">
          <DsCardSection>
            <p className="ds-text-secondary text-sm mb-4">{t('account.subMenu.logoutDesc')}</p>
            <button
              type="button"
              onClick={async () => {
                try {
                  await serverApi.logout();
                } catch (err) {
                  console.error('Logout error:', err);
                }
                redirectTo('/login');
              }}
              className="min-h-[48px] px-6 py-3 rounded-[var(--ds-radius-sm)] font-semibold bg-[var(--ds-accent-red)] text-white hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-red)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
              data-focusable
            >
              {t('account.logout')}
            </button>
          </DsCardSection>
        </DsCard>
      )}
    </div>
  );
}
