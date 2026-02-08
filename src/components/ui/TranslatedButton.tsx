import { useI18n } from '../../lib/i18n/useI18n';

type Props = {
  href: string;
  translationKey: string;
  className?: string;
};

export default function TranslatedButton({ href, translationKey, className = '' }: Props) {
  const { t } = useI18n();
  return (
    <a href={href} className={className}>
      {t(translationKey)}
    </a>
  );
}
