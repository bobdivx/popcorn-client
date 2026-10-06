/**
 * Barre de contrôle basse : un gros bouton par catégorie (valeur courante affichée), chacun ouvre un
 * menu déroulant vers le HAUT avec de grandes options. Un seul menu ouvert à la fois.
 * Masquage auto après inactivité (useAutoHide) — un tap n'importe où la réaffiche.
 */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import './car-ui.css';

export interface BarOption {
  id: string;
  label: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
}

export interface BarCategory {
  id: string;
  label: string;
  value: string;
  /** Options du menu (ou contenu libre via `content`) */
  options?: BarOption[];
  onSelect?: (id: string) => void;
  /** Ferme le menu après sélection (défaut true) */
  closeOnSelect?: boolean;
  content?: () => ComponentChildren;
  /** Action directe sans menu */
  onClick?: () => void;
  disabled?: boolean;
  /** Mise en avant (ex. alerte) */
  tone?: 'ok' | 'warn' | 'bad';
}

export interface CarCategoryBarProps {
  categories: BarCategory[];
  /** Éléments à gauche (transport) */
  leading?: ComponentChildren;
  onOpenChange?: (open: boolean) => void;
  onActivity?: () => void;
  className?: string;
}

export default function CarCategoryBar({ categories, leading, onOpenChange, onActivity, className }: CarCategoryBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left?: number; right?: number }>({});
  const barRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (id: string | null) => {
      setOpenId(id);
      onOpenChange?.(id != null);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (openId && !categories.some((c) => c.id === openId)) setOpen(null);
  }, [categories, openId, setOpen]);

  const open = categories.find((c) => c.id === openId) || null;

  return (
    <div
      ref={barRef}
      className={`car-ui-bar${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onActivity?.();
      }}
    >
      {open && (
        <>
          <div
            className="car-ui-bar__backdrop"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(null);
            }}
          />
          <div className="car-ui-bar__menu" style={anchor.left != null ? { left: `${anchor.left}px` } : { right: `${anchor.right ?? 0}px` }}>
            <div className="car-ui-bar__menu-title">{open.label}</div>
            {open.content
              ? open.content()
              : (open.options || []).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={o.disabled}
                    className={`car-ui-bar__opt${o.active ? ' is-active' : ''}${o.disabled ? ' is-disabled' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onActivity?.();
                      if (o.disabled) return;
                      open.onSelect?.(o.id);
                      if (open.closeOnSelect !== false) setOpen(null);
                    }}
                  >
                    <span>{o.label}</span>
                    {o.hint && <small>{o.hint}</small>}
                  </button>
                ))}
          </div>
        </>
      )}
      <div className="car-ui-bar__row">
        {leading}
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={c.disabled}
            className={`car-ui-bar__cat${openId === c.id ? ' is-open' : ''}${c.tone ? ` is-${c.tone}` : ''}${c.disabled ? ' is-disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onActivity?.();
              if (c.disabled) return;
              if (c.onClick) {
                setOpen(null);
                c.onClick();
                return;
              }
              if (openId === c.id) {
                setOpen(null);
                return;
              }
              const bar = barRef.current?.getBoundingClientRect();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (bar) {
                const left = r.left - bar.left;
                setAnchor(left > bar.width / 2 ? { right: Math.max(0, bar.right - r.right) } : { left: Math.max(0, left) });
              }
              setOpen(c.id);
            }}
          >
            <small>{c.label}</small>
            <span>{c.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Visibilité avec masquage auto après `ms` d'inactivité (sauf épinglé, ex. menu ouvert). */
export function useAutoHide(
  ms: number,
  enabled: boolean,
): { visible: boolean; poke: () => void; hide: () => void; setPinned: (p: boolean) => void } {
  const [visible, setVisible] = useState(true);
  const pinned = useRef(false);
  const timer = useRef(0);
  const arm = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!enabled || pinned.current) return;
    timer.current = window.setTimeout(() => setVisible(false), ms);
  }, [ms, enabled]);
  const poke = useCallback(() => {
    setVisible(true);
    arm();
  }, [arm]);
  const setPinned = useCallback(
    (p: boolean) => {
      pinned.current = p;
      if (p) {
        window.clearTimeout(timer.current);
        setVisible(true);
      } else arm();
    },
    [arm],
  );
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    pinned.current = false;
    setVisible(false);
  }, []);
  useEffect(() => {
    if (enabled) arm();
    else {
      window.clearTimeout(timer.current);
      setVisible(true);
    }
    return () => window.clearTimeout(timer.current);
  }, [enabled, arm]);
  return { visible, poke, hide, setPinned };
}
