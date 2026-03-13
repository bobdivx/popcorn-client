import { useState, useEffect } from 'preact/hooks';
import { HardDrive, ExternalLink, Shield } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { getBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';
import { canAccess } from '../../lib/permissions';
import LibRbitSettings from './LibRbitSettings';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const BASE_URL = '/settings/downloads/';

type DownloadItem =
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof HardDrive;
      permission?: string;
      kind: 'link';
      href: string;
      isExternal?: boolean;
    }
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof HardDrive;
      permission?: string;
      kind: 'sub';
      sub: string;
    };

function getSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'librqbit' ? sub : null;
}

export default function DownloadsSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getSubFromUrl);
  const [librqbitWebHref, setLibrqbitWebHref] = useState('#');

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const base = (getBackendUrl() || serverApi.getServerUrl() || '').trim().replace(/\/$/, '');
    setLibrqbitWebHref(base ? `${base}/librqbit/web/` : '#');
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  const items: DownloadItem[] = [
    {
      id: 'ratio',
      titleKey: 'ratioAdmin.title',
      descriptionKey: 'ratioAdmin.subtitle',
      icon: Shield,
      permission: 'settings.server',
      kind: 'link',
      href: '/settings/ratio/',
    },
    {
      id: 'librqbit',
      titleKey: 'settingsMenu.librqbit.title',
      descriptionKey: 'settingsMenu.librqbit.description',
      icon: HardDrive,
      permission: 'settings.server',
      kind: 'sub',
      sub: 'librqbit',
    },
    {
      id: 'librqbit-web',
      titleKey: 'settingsMenu.librqbitWeb.title',
      descriptionKey: 'settingsMenu.librqbitWeb.description',
      icon: ExternalLink,
      permission: 'settings.server',
      kind: 'link',
      href: librqbitWebHref,
      isExternal: true,
    },
  ];

  const visible = items.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  if (sub === 'librqbit') {
    const item = items.find((i) => i.id === 'librqbit')!;
    return (
      <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
        <LibRbitSettings />
      </SettingsSubPageFrame>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const href = item.kind === 'link' ? item.href : `${BASE_URL}?sub=${(item as { sub: string }).sub}`;
        const isExternal = item.kind === 'link' && !!item.isExternal;
        return (
          <SettingsNavCard
            key={item.id}
            href={href}
            icon={item.icon}
            title={t(item.titleKey)}
            description={t(item.descriptionKey)}
            isExternal={isExternal}
          />
        );
      })}
    </div>
  );
}
