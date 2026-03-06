import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import type { SubscriptionMe } from '../../lib/api/popcorn-web';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import { CreditCard, ExternalLink, HardDrive, Radio } from 'lucide-preact';

export default function SubscriptionStatusPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<SubscriptionMe | null>(() => getCachedSubscription());
  const [loading, setLoading] = useState(!getCachedSubscription());

  useEffect(() => {
    let cancelled = false;
    loadSubscription()
      .then((d) => {
        if (!cancelled) setData(d ?? null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <span className="loading loading-spinner loading-lg text-primary-400" />
      </div>
    );
  }

  const hasToken = !!data;
  const sub = data?.subscription ?? null;
  const streamingTorrent = data?.streamingTorrent === true;
  const baseUrl = getPopcornWebBaseUrl();

  if (!hasToken) {
    return (
      <div className="space-y-4">
        <p className="text-gray-400">
          {t('settingsMenu.subscription.notConnected')}
        </p>
        {baseUrl && (
          <a
            href={`${baseUrl.replace(/\/$/, '')}/login`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary-400 hover:underline"
          >
            {t('settingsMenu.subscription.connectToCloud')}
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    );
  }

  const periodEnd = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Abonnement stockage (plan) */}
      {sub ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center gap-2 text-white font-medium">
            <CreditCard className="w-5 h-5 text-primary-400" />
            {t('settingsMenu.subscription.plan')}
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">{t('settingsMenu.subscription.planName')}</span>
              <span className="text-white">{sub.planName || sub.planSlug || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t('settingsMenu.subscription.status')}</span>
              <span className="text-white capitalize">{sub.status || '—'}</span>
            </div>
            {sub.storageGb != null && (
              <div className="flex justify-between items-center gap-2">
                <span className="text-gray-400 flex items-center gap-1">
                  <HardDrive className="w-4 h-4" />
                  {t('settingsMenu.subscription.storage')}
                </span>
                <span className="text-white">{sub.storageGb} Go</span>
              </div>
            )}
            {periodEnd && (
              <div className="flex justify-between">
                <span className="text-gray-400">{t('settingsMenu.subscription.periodEnd')}</span>
                <span className="text-white">{periodEnd}</span>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">{t('settingsMenu.subscription.noStoragePlan')}</p>
      )}

      {/* Option streaming torrent */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-white font-medium">
          <Radio className="w-5 h-5 text-primary-400" />
          {t('settingsMenu.subscription.streamingTorrentOption')}
        </div>
        <p className="text-sm text-gray-400">
          {streamingTorrent
            ? t('settingsMenu.subscription.streamingTorrentActive')
            : t('settingsMenu.subscription.streamingTorrentInactive')}
        </p>
      </div>

      {baseUrl && (
        <a
          href={`${baseUrl.replace(/\/$/, '')}/account`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary-400 hover:underline text-sm"
        >
          {t('settingsMenu.subscription.manageOnWeb')}
          <ExternalLink className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
