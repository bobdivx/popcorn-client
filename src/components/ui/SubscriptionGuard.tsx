import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { CreditCard, ExternalLink } from 'lucide-preact';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';

interface SubscriptionGuardProps {
  children: preact.ComponentChildren;
}

export default function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { t } = useI18n();
  const [isAllowed, setIsAllowed] = useState<boolean | null>(() => {
    const cached = getCachedSubscription();
    if (cached === null) return null;
    return cached.subscription?.status === 'active';
  });

  useEffect(() => {
    const cached = getCachedSubscription();
    if (cached !== null) {
      setIsAllowed(cached.subscription?.status === 'active');
      return;
    }
    loadSubscription()
      .then((data) => setIsAllowed(data?.subscription?.status === 'active'))
      .catch(() => setIsAllowed(false));
  }, []);

  if (isAllowed === null) {
    return (
      <div className="flex items-center justify-center min-h-[120px]" aria-busy="true">
        <span className="loading loading-spinner loading-md text-[var(--ds-accent-violet)]" />
      </div>
    );
  }

  if (!isAllowed) {
    const baseUrl = getPopcornWebBaseUrl();
    return (
      <div class="glass-panel rounded-2xl shadow-2xl border border-amber-500/20 p-8 sm:p-12 text-center">
        <CreditCard class="w-16 h-16 mx-auto mb-4 text-amber-400" />
        <h2 class="text-2xl font-bold text-white mb-4">
          {t('subscriptionGuard.title')}
        </h2>
        <p class="text-gray-400 mb-6">
          {t('subscriptionGuard.description')}
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          {baseUrl && (
            <a
              href={`${baseUrl}/pricing`}
              target="_blank"
              rel="noopener noreferrer"
              class="btn btn-primary inline-flex items-center gap-2"
            >
              {t('subscriptionGuard.cta')}
              <ExternalLink class="w-4 h-4" />
            </a>
          )}
          <a href="/settings" class="btn btn-ghost inline-flex items-center gap-2">
            {t('subscriptionGuard.backToSettings')}
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
