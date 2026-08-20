import { DsLoader, type DsLoaderSize } from './DsLoader';

interface HLSLoadingSpinnerProps {
  size?: DsLoaderSize;
  text?: string;
  className?: string;
}

/**
 * @deprecated Utiliser `DsLoader`. Conservé comme alias pour les imports existants.
 */
export default function HLSLoadingSpinner({
  size = 'lg',
  text,
  className = '',
}: HLSLoadingSpinnerProps) {
  return <DsLoader size={size} text={text} className={className} />;
}
