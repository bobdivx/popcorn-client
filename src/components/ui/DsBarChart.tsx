export interface DsBarChartItem {
  label: string;
  value: number;
  /** Couleur (token ou hex), optionnel */
  color?: string;
}

interface DsBarChartProps {
  items: DsBarChartItem[];
  /** Valeur max pour l’échelle (si non fourni, max des values) */
  max?: number;
  /** Barres horizontales (défaut) ou verticales */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  /** Hauteur d’une barre (horizontal) ou hauteur du graphique (vertical) */
  barHeight?: number;
  /** Affiche la valeur numérique à droite/sous chaque barre */
  showValues?: boolean;
  /** Classes de la colonne label en mode horizontal */
  horizontalLabelClassName?: string;
}

const DEFAULT_COLORS = [
  'var(--ds-accent-violet)',
  'var(--ds-accent-green)',
  'var(--ds-accent-yellow)',
];

export function DsBarChart({
  items,
  max: maxProp,
  orientation = 'horizontal',
  className = '',
  barHeight = 28,
  showValues = true,
  horizontalLabelClassName = 'truncate w-20',
}: DsBarChartProps) {
  const maxVal = maxProp ?? Math.max(...items.map((i) => i.value), 1);
  const scale = maxVal <= 0 ? 0 : 100 / maxVal;

  if (orientation === 'horizontal') {
    return (
      <div className={`ds-bar-chart ds-bar-chart--horizontal ${className}`.trim()} role="img">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 mb-2 last:mb-0 min-w-0">
            <span className={`ds-text-secondary text-sm flex-shrink-0 ${horizontalLabelClassName}`.trim()}>
              {item.label}
            </span>
            <div className="flex-1 min-w-0 h-2 sm:h-2.5 rounded-full overflow-hidden bg-[var(--ds-border)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (item.value / maxVal) * 100)}%`,
                  backgroundColor: item.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
                }}
              />
            </div>
            {showValues ? (
              <span className="tabular-nums text-sm font-medium text-[var(--ds-text-primary)] w-12 text-right flex-shrink-0">
                {item.value.toLocaleString()}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  const chartHeight = barHeight * items.length + 8 * (items.length - 1);
  return (
    <div
      className={`ds-bar-chart ds-bar-chart--vertical flex gap-2 items-end ${className}`.trim()}
      style={{ height: chartHeight }}
      role="img"
    >
      {items.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex-1 min-h-[20px] flex items-end justify-center">
            <div
              className="w-full rounded-t transition-all duration-500 min-h-[4px]"
              style={{
                height: `${Math.min(100, (item.value / maxVal) * 100)}%`,
                backgroundColor: item.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
              }}
            />
          </div>
          <span className="ds-text-tertiary text-xs truncate w-full text-center">{item.label}</span>
          {showValues ? (
            <span className="tabular-nums text-xs font-medium text-[var(--ds-text-primary)]">
              {item.value.toLocaleString()}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
