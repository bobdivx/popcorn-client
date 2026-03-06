import { useI18n } from '../../lib/i18n/useI18n';

type Props = {
  translationKey: string;
  className?: string;
};

export default function TranslatedTitle({ translationKey, className = '' }: Props) {
  const { t } = useI18n();
  return <span className={className}>{t(translationKey)}</span>;
}
