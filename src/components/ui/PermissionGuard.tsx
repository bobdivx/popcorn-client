import { canAccess, getUserType, type Permission } from '../../lib/permissions';
import { useI18n } from '../../lib/i18n/useI18n';
import { Lock } from 'lucide-preact';
import { TokenManager } from '../../lib/client/storage';
import { useEffect, useState } from 'preact/hooks';

interface PermissionGuardProps {
  permission: Permission;
  children: preact.ComponentChildren;
}

export default function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { t } = useI18n();
  const [hasAccess, setHasAccess] = useState(() => canAccess(permission));
  const [isChecking, setIsChecking] = useState(true);

  // Re-vérifier les permissions après le montage pour s'assurer que l'utilisateur est chargé
  useEffect(() => {
    // Attendre un peu pour que l'utilisateur soit chargé depuis localStorage
    const checkAccess = () => {
      const user = TokenManager.getUser();
      if (!user && permission === 'settings.server') {
        setHasAccess(true);
        setIsChecking(false);
        return;
      }
      const access = canAccess(permission);
      setHasAccess(access);
      setIsChecking(false);

      // Debug: vérifier pourquoi l'accès est refusé pour un compte principal
      if (typeof window !== 'undefined' && !access && permission === 'settings.account') {
        const userType = getUserType();
        const hasCloudToken = TokenManager.getCloudAccessToken() !== null;
        const user = TokenManager.getUser();
        console.log('[PermissionGuard] Debug account access:', {
          permission,
          hasAccess: access,
          userType,
          hasCloudToken,
          userRole: user?.role,
          user,
        });
      }
    };

    // Vérifier immédiatement
    checkAccess();

    // Re-vérifier après un court délai au cas où l'utilisateur serait chargé de manière asynchrone
    const timeoutId = setTimeout(checkAccess, 100);
    return () => clearTimeout(timeoutId);
  }, [permission]);

  // Afficher un loader pendant la vérification initiale (évite une page vide)
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[120px]" aria-busy="true">
        <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div class="glass-panel rounded-2xl shadow-2xl border border-red-500/20 p-8 sm:p-12 text-center">
        <Lock class="w-16 h-16 mx-auto mb-4 text-red-500" />
        <h2 class="text-2xl font-bold text-white mb-4">
          {t('permissions.accessDenied')}
        </h2>
        <p class="text-gray-400 mb-6">
          {t('permissions.accessDeniedDescription')}
        </p>
        <a
          href="/settings"
          class="btn btn-primary inline-flex items-center gap-2"
        >
          {t('permissions.backToSettings')}
        </a>
      </div>
    );
  }

  return <>{children}</>;
}
