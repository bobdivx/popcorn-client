import { getInitials, type LocalProfile } from '../../lib/client/profile';

type Props = {
  email?: string | null;
  displayName?: string | null;
  profile?: LocalProfile | null;
  sizeClassName?: string;
  className?: string;
};

export default function Avatar({
  email,
  displayName,
  profile,
  sizeClassName = 'w-10 h-10 tv:w-14 tv:h-14',
  className = '',
}: Props) {
  const avatarUrl = profile?.avatarDataUrl?.trim();
  const initials = getInitials(displayName || email);

  if (avatarUrl) {
    return (
      <div
        className={`${sizeClassName} rounded-lg overflow-hidden border border-white/10 bg-black/30 ${className}`}
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
      className={`${sizeClassName} rounded-lg bg-primary text-white flex items-center justify-center font-bold shadow-primary border border-white/10 ${className}`}
      aria-label="Avatar"
    >
      <span className="text-sm sm:text-base md:text-lg tv:text-xl leading-none">{initials}</span>
    </div>
  );
}

