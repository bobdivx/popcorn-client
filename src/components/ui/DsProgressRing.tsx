interface DsProgressRingProps {
  /** Valeur 0–100 */
  value: number;
  /** Taille en px (diamètre du cercle) */
  size?: number;
  /** Épaisseur du trait */
  strokeWidth?: number;
  /** Couleur (token CSS ou hex) */
  color?: string;
  /** Couleur de la piste (fond) */
  trackColor?: string;
  className?: string;
  /** Label accessible */
  'aria-label'?: string;
}

export function DsProgressRing({
  value,
  size = 48,
  strokeWidth = 4,
  color = 'var(--ds-accent-violet)',
  trackColor = 'var(--ds-border)',
  className = '',
  'aria-label': ariaLabel,
}: DsProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, Number(value)));
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`ds-progress-ring ${className}`.trim()}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  );
}
