import type { ComponentChildren } from 'preact';
import DsLoader from '../ui/DsLoader';

/**
 * Briques de présentation partagées par les étapes de l'assistant (/setup).
 * Purement visuelles : aucune logique. Les classes `wz-*` sont définies dans wizardTheme.ts.
 */

export function StepHeader({
  kicker,
  title,
  lead,
  center = false,
  children,
}: {
  kicker?: ComponentChildren;
  title: ComponentChildren;
  lead?: ComponentChildren;
  center?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <header class={`wz-head${center ? ' wz-head--center' : ''}`}>
      {kicker ? <span class="wz-kicker">{kicker}</span> : null}
      <h2 class="wz-title">{title}</h2>
      <span class="wz-rule" />
      {lead ? <p class="wz-lead">{lead}</p> : null}
      {children}
    </header>
  );
}

type Tone = 'error' | 'success' | 'warning' | 'info';

export function Alert({
  tone,
  title,
  children,
  class: className = '',
  style,
}: {
  tone: Tone;
  title?: ComponentChildren;
  children?: ComponentChildren;
  class?: string;
  style?: string;
}) {
  return (
    <div
      class={`wz-alert wz-alert--${tone} ${className}`.trim()}
      role={tone === 'error' ? 'alert' : 'status'}
      style={style}
    >
      {tone === 'success' ? <IconCheck /> : tone === 'info' ? <IconInfo /> : <IconAlert />}
      <div class="wz-alert__body">
        {title ? <span class="wz-alert__title">{title}</span> : null}
        {children}
      </div>
    </div>
  );
}

/** Chargement dans le contenu d'une étape (trait corail + libellé, comme le reste de l'app). */
export function StepLoading({ label }: { label?: string }) {
  return (
    <div style="padding:56px 0;display:flex;justify-content:center;">
      <DsLoader size="md" text={label} />
    </div>
  );
}

export function Spinner() {
  return <span class="ed-spinner ed-spinner--xs" aria-hidden="true" />;
}

const svgProps = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  'stroke-width': 1.5,
  'aria-hidden': 'true',
} as const;

export function IconArrowRight() {
  return (
    <svg {...svgProps}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  );
}

export function IconArrowLeft() {
  return (
    <svg {...svgProps} class="is-lead">
      <path stroke-linecap="round" stroke-linejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg {...svgProps}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg {...svgProps}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m0 3.75h.008M10.34 3.94 2.4 17.25A1.95 1.95 0 0 0 4.06 20.2h15.88a1.95 1.95 0 0 0 1.66-2.95L13.66 3.94a1.95 1.95 0 0 0-3.32 0z" />
    </svg>
  );
}

export function IconInfo() {
  return (
    <svg {...svgProps}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4m0-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg {...svgProps}>
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** Case à cocher focusable (bouton role="checkbox") : utilisable à la télécommande. */
export function CheckButton({
  checked,
  onToggle,
  children,
  desc,
  descId,
  disabled,
  style,
}: {
  checked: boolean;
  onToggle: (next: boolean) => void;
  children: ComponentChildren;
  desc?: ComponentChildren;
  descId?: string;
  disabled?: boolean;
  style?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-describedby={descId}
      data-focusable
      disabled={disabled}
      class={`wz-check${checked ? ' is-checked' : ''}`}
      style={style}
      onClick={() => onToggle(!checked)}
    >
      <span class="wz-check__box">
        {checked && (
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={3} aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span>
        <span style="display:block;">{children}</span>
        {desc ? <span id={descId} class="wz-help" style="display:block;margin-top:4px;">{desc}</span> : null}
      </span>
    </button>
  );
}
