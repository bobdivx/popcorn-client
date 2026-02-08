/**
 * Bouton d'action flottant (FAB) réutilisable.
 * À placer dans le layout pour des actions globales (ex. feedback).
 */

type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

type Props = {
  /** Icône (ex. composant Lucide). */
  icon: preact.ComponentType<{ className?: string }>;
  /** Accessibilité. */
  ariaLabel: string;
  onClick: () => void;
  /** Badge optionnel (ex. nombre de non lus). */
  badge?: number | null;
  /** Position du FAB. */
  position?: Position;
  className?: string;
  /** Masquer le FAB (ex. quand non connecté). */
  visible?: boolean;
};

const positionClasses: Record<Position, string> = {
  'bottom-right': 'bottom-6 right-6 sm:bottom-8 sm:right-8',
  'bottom-left': 'bottom-6 left-6 sm:bottom-8 sm:left-8',
  'top-right': 'top-20 right-6 sm:right-8',
  'top-left': 'top-20 left-6 sm:left-8',
};

export default function FloatingActionButton({
  icon: Icon,
  ariaLabel,
  onClick,
  badge,
  position = 'bottom-right',
  className = '',
  visible = true,
}: Props) {
  if (!visible) return null;

  return (
    <div
      className={`fixed z-40 ${positionClasses[position]} flex flex-col items-center gap-2`}
      style={{
        paddingBottom: 'var(--safe-area-inset-bottom)',
        paddingRight: 'var(--safe-area-inset-right)',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        className={`
          relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14
          rounded-full shadow-lg
          bg-primary-600 hover:bg-primary-500 active:scale-95
          text-white
          transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-[#121212]
          ${className}
        `}
        aria-label={ariaLabel}
        tabIndex={0}
        data-focusable
      >
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        {badge != null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    </div>
  );
}
