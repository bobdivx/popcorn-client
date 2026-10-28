import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { useI18n } from '../../../lib/i18n/useI18n';

type HubModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  size?: 'lg' | 'xl';
  children: ComponentChildren;
  footer?: ComponentChildren;
  /** Classe ajoutée au voile (thème propre à une page, ex. `modules-hub-overlay`). */
  className?: string;
  /**
   * Ouverture / fermeture animées (fondu + léger zoom, glissement depuis le bas sur mobile).
   * Fermeture différée le temps de l'animation ; immédiate si `prefers-reduced-motion: reduce`.
   */
  animated?: boolean;
};

const CLOSE_ANIMATION_MS = 180;

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function HubModal({
  open,
  title,
  description,
  onClose,
  size = 'xl',
  children,
  footer,
  className,
  animated = false,
}: HubModalProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = () => {
    if (!animated || reducedMotion()) {
      onCloseRef.current();
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timerRef.current = setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      onCloseRef.current();
    }, CLOSE_ANIMATION_MS);
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const content = document.querySelector<HTMLElement>('[data-tv-settings-content]');
    content?.setAttribute('inert', '');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const dialog = dialogRef.current;
    const onTvBack = (e: Event) => {
      e.preventDefault();
      requestCloseRef.current();
    };
    dialog?.addEventListener('tv-back-button', onTvBack);
    const focusable = dialog?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [data-focusable]'
    );
    focusable?.focus();
    return () => {
      document.body.style.overflow = prev;
      content?.removeAttribute('inert');
      document.removeEventListener('keydown', onKey);
      dialog?.removeEventListener('tv-back-button', onTvBack);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      class={['hub-overlay', className, animated ? 'hub-overlay--animated' : '', closing ? 'is-closing' : '']
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        class={`hub-modal${size === 'xl' ? ' hub-modal--xl' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-modal-title"
        data-tv-initial-focus
        tabIndex={-1}
      >
        <header class="hub-modal-head">
          <div class="hub-modal-head-copy">
            <h2 id="hub-modal-title" class="hub-modal-title">{title}</h2>
            {description ? <p class="hub-modal-desc">{description}</p> : null}
          </div>
          <button
            type="button"
            class="hub-modal-x"
            data-close
            data-focusable
            onClick={requestClose}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </header>
        <div class="hub-modal-body">{children}</div>
        <footer class="hub-modal-foot">
          {footer ?? (
            <button type="button" class="hub-btn hub-btn-secondary" data-focusable onClick={requestClose}>
              {t('common.close')}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  );
}

export function closeSettingsSub(backHref?: string, backOnClick?: () => void) {
  if (backOnClick) {
    backOnClick();
    return;
  }
  if (!backHref || typeof window === 'undefined') return;
  window.history.replaceState(window.history.state ?? {}, '', backHref);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
