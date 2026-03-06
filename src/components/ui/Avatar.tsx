import { getInitials, type LocalProfile } from '../../lib/client/profile';

type Props = {
  email?: string | null;
  displayName?: string | null;
  profile?: LocalProfile | null;
  sizeClassName?: string;
  className?: string;
  /** `circle` pour épouser un cerclage (ex. header mobile), `rounded` par défaut. */
  shape?: 'rounded' | 'circle';
};

export default function Avatar({
  email,
  displayName,
  profile,
  sizeClassName = 'w-10 h-10 tv:w-14 tv:h-14',
  className = '',
  shape = 'rounded',
}: Props) {
  const avatarUrl = profile?.avatarDataUrl?.trim();
  const initials = getInitials(displayName || email);
  const roundClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
  const isCircle = shape === 'circle';
  const fallbackStyle = isCircle
    ? 'bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)] border border-[var(--ds-border)]'
    : 'bg-primary text-white border-white/10 shadow-primary';

  if (avatarUrl) {
    return (
      <div
        className={`${sizeClassName} ${roundClass} overflow-hidden border bg-[var(--ds-surface-elevated)] ${isCircle ? 'border-[var(--ds-border)]' : 'border-white/10 bg-black/30'} ${className}`}
        aria-label="Avatar"
      >
        <img
          src={avatarUrl}
          alt="Avatar"
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
        />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClassName} ${roundClass} flex items-center justify-center font-semibold border ${fallbackStyle} ${className}`}
      aria-label="Avatar"
    >
      <span className="text-sm sm:text-base md:text-lg tv:text-xl leading-none select-none">{initials}</span>
    </div>
  );
}

