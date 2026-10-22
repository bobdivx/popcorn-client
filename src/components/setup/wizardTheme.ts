/**
 * Thème éditorial de l'assistant de configuration (/setup).
 *
 * Reprend les tokens du thème éditorial (src/styles/editorial.css : --ed-*) avec des valeurs
 * de repli locales pour que l'assistant reste identique même si data-editorial est absent.
 * Contraintes TV / webOS (vieux Chromium) : pas de :has(), pas de :is(), pas de backdrop-filter,
 * pas de propriété `inset`, valeurs de repli avant chaque clamp().
 *
 * Les anciennes classes `wizard-*` (card, input, btn-primary…) sont conservées comme alias
 * restylés pour ne rien casser dans un composant non migré.
 */
export const WIZARD_THEME_CSS = `
.wz-root {
  --wz-accent: var(--ed-accent, #f2545b);
  --wz-accent-hover: var(--ed-accent-hover, #ff6a70);
  --wz-accent-soft: rgba(242, 84, 91, 0.08);
  --wz-accent-line: rgba(242, 84, 91, 0.38);
  --wz-ink: #f4f1ec;
  --wz-ink-dim: rgba(244, 241, 236, 0.62);
  --wz-ink-faint: rgba(244, 241, 236, 0.38);
  --wz-line: rgba(255, 255, 255, 0.09);
  --wz-line-strong: rgba(255, 255, 255, 0.28);
  --wz-bg: #0c0d10;
  --wz-bg-rail: #0a0b0e;
  --wz-surface: rgba(255, 255, 255, 0.025);
  --wz-display: var(--ed-font-display, 'Josefin Sans', 'Jost', 'Outfit', system-ui, sans-serif);
  --wz-body: var(--ed-font-body, 'Jost', 'Inter', system-ui, sans-serif);
  --wz-mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --wz-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --wz-ok: #6ee7a8;
  --wz-warn: #f5c46b;
  --wz-err: #ff7b7b;
  position: relative;
  min-height: 100vh;
  display: flex;
  background: var(--wz-bg);
  color: var(--wz-ink);
  font-family: var(--wz-body);
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
}
.wz-root *, .wz-root *::before, .wz-root *::after { box-sizing: border-box; }
.wz-root h1, .wz-root h2, .wz-root h3, .wz-root h4 { font-family: var(--wz-display); font-weight: 300; color: var(--wz-ink); margin: 0; }
.wz-root p { margin: 0; }
.wz-root strong { font-weight: 500; color: var(--wz-ink); }

/* ── Rail (colonne des étapes) ───────────────────────────── */
.wz-rail {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 44px 0 28px 36px;
  background: var(--wz-bg-rail);
  border-right: 1px solid var(--wz-line);
  position: sticky;
  top: 0;
  height: 100vh;
  max-height: 100vh;
}
@media (max-width: 1023px) { .wz-rail { display: none; } }
.wz-brand { display: flex; align-items: center; padding-right: 28px; margin-bottom: 56px; }
.wz-brand__logo { width: 26px; height: 26px; object-fit: contain; margin-right: 14px; flex-shrink: 0; }
.wz-brand__name {
  display: block;
  font-family: var(--wz-display);
  font-weight: 300;
  font-size: 0.95rem;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: var(--wz-ink);
  line-height: 1.1;
}
.wz-brand__sub {
  display: block;
  margin-top: 6px;
  font-size: 0.6rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--wz-ink-faint);
}
.wz-rail__kicker {
  font-family: var(--wz-display);
  font-size: 0.6rem;
  letter-spacing: 0.36em;
  text-transform: uppercase;
  color: var(--wz-ink-faint);
  margin: 0 0 18px;
}
.wz-steps { list-style: none; margin: 0; padding: 0 28px 0 0; flex: 1; overflow-y: auto; }
.wz-steps li { margin: 0; padding: 0; }
.wz-step {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 46px;
  padding: 10px 0 10px 18px;
  margin: 0;
  background: transparent;
  border: 0;
  border-left: 1px solid var(--wz-line);
  border-radius: 0;
  color: var(--wz-ink-faint);
  text-align: left;
  font-family: var(--wz-display);
  cursor: pointer;
  transition: color 0.2s var(--wz-ease), border-color 0.2s var(--wz-ease), background-color 0.2s var(--wz-ease);
}
.wz-step:hover { color: var(--wz-ink-dim); border-left-color: var(--wz-line-strong); }
.wz-step__num {
  width: 2.4rem;
  flex-shrink: 0;
  font-size: 0.68rem;
  letter-spacing: 0.14em;
  font-weight: 300;
}
.wz-step__label {
  flex: 1;
  min-width: 0;
  font-size: 0.7rem;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.wz-step__mark {
  flex-shrink: 0;
  margin-left: 10px;
  display: inline-flex;
  align-items: center;
  font-family: var(--wz-body);
  font-size: 0.56rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.wz-step__mark svg { width: 13px; height: 13px; }
.wz-step.is-active {
  color: var(--wz-ink);
  border-left: 2px solid var(--wz-accent);
  padding-left: 17px;
  background: linear-gradient(90deg, rgba(242, 84, 91, 0.07), rgba(242, 84, 91, 0));
}
.wz-step.is-active .wz-step__num { color: var(--wz-accent); }
.wz-step.is-done { color: var(--wz-ink-dim); }
.wz-step.is-done .wz-step__mark { color: var(--wz-accent); }
.wz-step.is-skipped { color: var(--wz-ink-faint); }
.wz-step.is-skipped .wz-step__mark { color: var(--wz-ink-faint); }
.wz-rail__foot {
  margin-top: 28px;
  padding: 20px 28px 0 0;
  border-top: 1px solid var(--wz-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.wz-version { font-size: 0.62rem; letter-spacing: 0.14em; color: var(--wz-ink-faint); font-family: var(--wz-mono); }

/* ── Zone principale ────────────────────────────────────── */
.wz-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 100vh; position: relative; }
.wz-topbar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 16px 20px 14px;
  background: rgba(12, 13, 16, 0.97);
  border-bottom: 1px solid var(--wz-line);
}
@media (max-width: 1023px) { .wz-topbar { display: block; } }
.wz-topbar__row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.wz-topbar__brand { display: flex; align-items: center; }
.wz-topbar__brand img { width: 20px; height: 20px; object-fit: contain; margin-right: 10px; }
.wz-topbar__brand span { font-family: var(--wz-display); font-size: 0.72rem; letter-spacing: 0.38em; text-transform: uppercase; color: var(--wz-ink); }
.wz-topbar__count { font-family: var(--wz-display); font-size: 0.62rem; letter-spacing: 0.24em; text-transform: uppercase; color: var(--wz-ink-dim); text-align: right; }
.wz-topbar__count b { color: var(--wz-accent); font-weight: 400; }

.wz-pager { display: flex; align-items: center; }
.wz-pager__seg { flex: 1; height: 2px; background: rgba(255, 255, 255, 0.12); margin-right: 4px; transition: background-color 0.3s var(--wz-ease); }
.wz-pager__seg:last-child { margin-right: 0; }
.wz-pager__seg.is-done { background: rgba(244, 241, 236, 0.55); }
.wz-pager__seg.is-active { background: var(--wz-accent); }

.wz-content { flex: 1; display: flex; justify-content: center; align-items: flex-start; padding: 36px 20px 40px; }
@media (min-width: 640px) { .wz-content { padding: 48px 40px 48px; } }
@media (min-width: 1024px) { .wz-content { padding: 64px 72px 56px; } }
.wz-content__inner { width: 100%; max-width: 680px; position: relative; }
.wz-content__meta { display: none; margin-bottom: 40px; }
@media (min-width: 1024px) { .wz-content__meta { display: block; } }
.wz-content__meta-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
.wz-content__meta-step { font-family: var(--wz-display); font-size: 0.64rem; letter-spacing: 0.34em; text-transform: uppercase; color: var(--wz-ink-faint); }
.wz-content__meta-step b { color: var(--wz-accent); font-weight: 400; }
.wz-content__meta-label { font-family: var(--wz-display); font-size: 0.64rem; letter-spacing: 0.34em; text-transform: uppercase; color: var(--wz-ink-dim); }

.wz-footer { display: flex; align-items: center; justify-content: center; padding: 18px 20px 22px; border-top: 1px solid var(--wz-line); }
@media (min-width: 1024px) { .wz-footer { display: none; } }
.wz-footer .wz-version { margin-left: 18px; }

/* Animation d'entrée d'étape (coupée sur TV/webOS et si mouvement réduit) */
@keyframes wz-rise { from { opacity: 0; -webkit-transform: translateY(14px); transform: translateY(14px); } to { opacity: 1; -webkit-transform: none; transform: none; } }
@keyframes wz-rise-back { from { opacity: 0; -webkit-transform: translateY(-10px); transform: translateY(-10px); } to { opacity: 1; -webkit-transform: none; transform: none; } }
.wz-enter { animation: wz-rise 0.45s var(--wz-ease) both; }
.wz-enter--back { animation: wz-rise-back 0.45s var(--wz-ease) both; }
.wz-root.is-tv .wz-enter, .wz-root.is-tv .wz-enter--back { animation: none; }
@media (prefers-reduced-motion: reduce) { .wz-enter, .wz-enter--back { animation: none; } }

/* ── En-tête d'étape ────────────────────────────────────── */
.wz-head { margin-bottom: 36px; }
.wz-head--center { text-align: center; }
.wz-head--center .wz-rule { margin-left: auto; margin-right: auto; }
.wz-head--center .wz-lead { margin-left: auto; margin-right: auto; }
.wz-kicker {
  display: block;
  margin: 0 0 14px;
  font-family: var(--wz-display);
  font-size: 0.64rem;
  font-weight: 300;
  letter-spacing: 0.42em;
  text-transform: uppercase;
  color: var(--wz-accent);
}
.wz-root .wz-title {
  margin: 0;
  font-family: var(--wz-display);
  font-weight: 300;
  font-size: 1.45rem;
  line-height: 1.25;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--wz-ink);
  overflow-wrap: break-word;
}
@media (min-width: 640px) { .wz-root .wz-title { font-size: 1.8rem; letter-spacing: 0.24em; } }
.wz-rule { display: block; width: 4rem; height: 1px; background: var(--wz-accent); margin: 22px 0 0; border: 0; }
.wz-lead { margin: 20px 0 0; max-width: 36rem; font-size: 0.95rem; line-height: 1.75; color: var(--wz-ink-dim); }
.wz-root .wz-h3 {
  font-family: var(--wz-display);
  font-weight: 300;
  font-size: 0.95rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--wz-ink);
  margin: 0;
}
.wz-section-label {
  display: block;
  margin: 0 0 14px;
  font-family: var(--wz-display);
  font-size: 0.62rem;
  font-weight: 400;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--wz-ink-faint);
}
.wz-text { font-size: 0.9rem; line-height: 1.7; color: var(--wz-ink-dim); }
.wz-text-sm { font-size: 0.8rem; line-height: 1.6; color: var(--wz-ink-dim); }
.wz-muted { color: var(--wz-ink-faint); }
.wz-accent { color: var(--wz-accent); }

/* ── Surfaces ───────────────────────────────────────────── */
.wz-panel, .wizard-card {
  background: var(--wz-surface);
  border: 1px solid var(--wz-line);
  border-radius: 2px;
  padding: 24px;
}
.wz-panel--flush { padding: 0; }
.wz-panel--accent { border-color: var(--wz-accent-line); background: var(--wz-accent-soft); }
.wz-panel--quiet { background: transparent; }
@media (max-width: 639px) { .wz-panel, .wizard-card { padding: 18px; } }
.wz-rows { border-top: 1px solid var(--wz-line); }
.wz-row { display: flex; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--wz-line); }
.wz-row__icon {
  width: 38px; height: 38px; flex-shrink: 0; margin-right: 16px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--wz-line-strong); color: var(--wz-ink-dim);
}
.wz-row__icon svg { width: 17px; height: 17px; }
.wz-row__icon.is-on { border-color: var(--wz-accent-line); color: var(--wz-accent); }
.wz-row__body { flex: 1; min-width: 0; }
.wz-row__title { display: block; font-family: var(--wz-display); font-size: 0.8rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--wz-ink); }
.wz-row__desc { display: block; margin-top: 4px; font-size: 0.8rem; color: var(--wz-ink-dim); line-height: 1.5; overflow-wrap: anywhere; }
.wz-row__aside { flex-shrink: 0; margin-left: 12px; display: flex; align-items: center; }
.wz-row__aside > * + * { margin-left: 10px; }
.wz-stack > * + * { margin-top: 18px; }
.wz-stack-lg > * + * { margin-top: 28px; }
.wz-stack-sm > * + * { margin-top: 10px; }
.wz-grid-2 { display: grid; grid-template-columns: 1fr; grid-gap: 12px; gap: 12px; }
@media (min-width: 640px) { .wz-grid-2 { grid-template-columns: 1fr 1fr; } }
.wz-grid-3 { display: grid; grid-template-columns: 1fr; grid-gap: 12px; gap: 12px; }
@media (min-width: 640px) { .wz-grid-3 { grid-template-columns: 1fr 1fr 1fr; } }
.wz-inline { display: flex; align-items: center; flex-wrap: wrap; }
.wz-inline > * { margin-right: 10px; }
.wz-inline > *:last-child { margin-right: 0; }
.wz-between { display: flex; align-items: center; justify-content: space-between; }
.wz-center { text-align: center; }
.wz-scroll { max-height: 260px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
.wz-scroll::-webkit-scrollbar { width: 4px; }
.wz-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.16); }

/* ── Champs ─────────────────────────────────────────────── */
.wz-label, .wizard-label {
  display: block;
  margin: 0 0 10px;
  font-family: var(--wz-display);
  font-size: 0.64rem;
  font-weight: 400;
  letter-spacing: 0.26em;
  text-transform: uppercase;
  color: var(--wz-ink-dim);
}
.wz-input, .wizard-input {
  display: block;
  width: 100%;
  min-height: 50px;
  padding: 13px 16px;
  margin: 0;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--wz-line-strong);
  border-radius: 2px;
  color: var(--wz-ink);
  font-family: var(--wz-body);
  font-size: 0.95rem;
  font-weight: 300;
  letter-spacing: 0.02em;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color 0.2s var(--wz-ease), box-shadow 0.2s var(--wz-ease), background-color 0.2s var(--wz-ease);
}
.wz-input::placeholder, .wizard-input::placeholder { color: var(--wz-ink-faint); }
.wz-input:focus, .wizard-input:focus { border-color: var(--wz-accent); box-shadow: inset 0 0 0 1px var(--wz-accent); background: rgba(255, 255, 255, 0.045); }
.wz-input:disabled, .wizard-input:disabled { opacity: 0.5; cursor: not-allowed; }
.wz-input--mono { font-family: var(--wz-mono); font-size: 0.88rem; letter-spacing: 0; }
.wz-input--code { font-family: var(--wz-mono); font-size: 1.4rem; letter-spacing: 0.4em; text-align: center; text-transform: uppercase; }
select.wz-input { padding-right: 40px; background-image: linear-gradient(45deg, transparent 50%, rgba(244,241,236,0.6) 50%), linear-gradient(135deg, rgba(244,241,236,0.6) 50%, transparent 50%); background-position: calc(100% - 20px) 50%, calc(100% - 15px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
select.wz-input option { background: #121318; color: var(--wz-ink); }
textarea.wz-input { min-height: 96px; resize: vertical; line-height: 1.6; }
.wz-help { display: block; margin-top: 8px; font-size: 0.78rem; line-height: 1.55; color: var(--wz-ink-faint); }
.wz-field + .wz-field { margin-top: 20px; }
.wz-input-row { display: flex; align-items: stretch; }
.wz-input-row > .wz-input { flex: 1; min-width: 0; }
.wz-input-row > .wz-btn { flex-shrink: 0; margin-left: 12px; }
@media (max-width: 639px) {
  .wz-input-row { flex-direction: column; }
  .wz-input-row > .wz-btn { margin-left: 0; margin-top: 10px; width: 100%; }
}

/* ── Boutons ────────────────────────────────────────────── */
.wz-btn, .wizard-btn-primary, .wizard-btn-secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  padding: 0 30px;
  margin: 0;
  border: 1px solid transparent;
  border-radius: 0;
  font-family: var(--wz-display);
  font-size: 0.72rem;
  font-weight: 400;
  letter-spacing: 0.28em;
  line-height: 1.2;
  text-transform: uppercase;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  box-shadow: none;
  transition: background-color 0.25s var(--wz-ease), border-color 0.25s var(--wz-ease), color 0.25s var(--wz-ease), opacity 0.2s;
}
.wz-btn > svg, .wizard-btn-primary > svg, .wizard-btn-secondary > svg { width: 16px; height: 16px; flex-shrink: 0; }
.wz-btn > svg, .wizard-btn-primary > svg, .wizard-btn-secondary > svg { margin-left: 12px; }
.wz-btn > svg.is-lead, .wizard-btn-primary > svg.is-lead, .wizard-btn-secondary > svg.is-lead { margin-left: 0; margin-right: 12px; }
.wz-btn > svg.is-solo { margin: 0; }
.wz-btn > .ed-spinner, .wizard-btn-primary > .ed-spinner, .wizard-btn-secondary > .ed-spinner { margin-right: 12px; }
.wz-btn--primary, .wizard-btn-primary { background: var(--wz-accent); color: #fff; border-color: var(--wz-accent); }
.wz-btn--primary:hover:not(:disabled), .wizard-btn-primary:hover:not(:disabled) { background: var(--wz-accent-hover); border-color: var(--wz-accent-hover); }
.wz-btn--ghost, .wizard-btn-secondary { background: transparent; color: var(--wz-ink); border-color: var(--wz-line-strong); }
.wz-btn--ghost:hover:not(:disabled), .wizard-btn-secondary:hover:not(:disabled) { border-color: rgba(244, 241, 236, 0.6); }
.wz-btn--quiet { background: transparent; color: var(--wz-ink-dim); border-color: transparent; padding: 0 14px; }
.wz-btn--quiet:hover:not(:disabled) { color: var(--wz-ink); }
.wz-btn--danger { background: transparent; color: var(--wz-err); border-color: rgba(255, 123, 123, 0.45); }
.wz-btn--danger:hover:not(:disabled) { border-color: var(--wz-err); }
.wz-btn--sm { min-height: 38px; padding: 0 16px; font-size: 0.62rem; letter-spacing: 0.2em; }
.wz-btn--block { display: flex; width: 100%; }
.wz-btn:disabled, .wizard-btn-primary:disabled, .wizard-btn-secondary:disabled { opacity: 0.42; cursor: not-allowed; }
.wz-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; padding: 0; margin: 0;
  background: transparent; border: 1px solid var(--wz-line-strong); border-radius: 0;
  color: var(--wz-ink-dim); cursor: pointer;
}
.wz-icon-btn:hover:not(:disabled) { color: var(--wz-ink); border-color: rgba(244, 241, 236, 0.6); }
.wz-icon-btn--danger:hover:not(:disabled) { color: var(--wz-err); border-color: var(--wz-err); }
.wz-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.wz-icon-btn svg { width: 16px; height: 16px; }
.wz-link {
  display: inline-block;
  padding: 0 0 3px;
  margin: 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--wz-line-strong);
  border-radius: 0;
  color: var(--wz-ink-dim);
  font-family: var(--wz-display);
  font-size: 0.64rem;
  font-weight: 400;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}
.wz-link:hover { color: var(--wz-ink); border-bottom-color: var(--wz-accent); }
.wz-link--accent { color: var(--wz-accent); border-bottom-color: var(--wz-accent-line); }
.wz-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  margin-top: 40px;
  padding-top: 26px;
  border-top: 1px solid var(--wz-line);
}
.wz-actions--end { justify-content: flex-end; }
.wz-actions > * + * { margin-left: 12px; }
.wz-actions__group { display: flex; align-items: center; flex-wrap: wrap; }
.wz-actions__group > * + * { margin-left: 12px; }
@media (max-width: 639px) {
  .wz-actions { flex-direction: column-reverse; align-items: stretch; }
  .wz-actions > * + * { margin-left: 0; }
  .wz-actions > * { margin-top: 10px; }
  .wz-actions > *:last-child { margin-top: 0; }
  .wz-actions .wz-btn, .wz-actions .wizard-btn-primary, .wz-actions .wizard-btn-secondary { width: 100%; }
  .wz-actions__group { flex-direction: column-reverse; align-items: stretch; }
  .wz-actions__group > * + * { margin-left: 0; margin-bottom: 10px; }
}

/* ── Choix (cartes sélectionnables) ─────────────────────── */
.wz-option {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 60px;
  padding: 16px 20px;
  margin: 0;
  background: transparent;
  border: 1px solid var(--wz-line-strong);
  border-radius: 2px;
  color: var(--wz-ink);
  text-align: left;
  font-family: var(--wz-body);
  font-weight: 300;
  cursor: pointer;
  transition: border-color 0.2s var(--wz-ease), background-color 0.2s var(--wz-ease), box-shadow 0.2s var(--wz-ease);
}
.wz-option:hover:not(:disabled) { border-color: rgba(244, 241, 236, 0.6); }
.wz-option.is-selected { border-color: var(--wz-accent); background: var(--wz-accent-soft); box-shadow: inset 2px 0 0 var(--wz-accent); }
.wz-option:disabled { opacity: 0.45; cursor: not-allowed; }
.wz-option__icon { width: 40px; height: 40px; flex-shrink: 0; margin-right: 16px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--wz-line-strong); color: var(--wz-ink-dim); font-size: 1.2rem; }
.wz-option__icon svg { width: 18px; height: 18px; }
.wz-option.is-selected .wz-option__icon { border-color: var(--wz-accent-line); color: var(--wz-accent); }
.wz-option__body { flex: 1; min-width: 0; }
.wz-option__title { display: block; font-family: var(--wz-display); font-size: 0.82rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--wz-ink); line-height: 1.35; }
.wz-option__desc { display: block; margin-top: 5px; font-size: 0.82rem; line-height: 1.55; color: var(--wz-ink-dim); text-transform: none; letter-spacing: 0.01em; }
.wz-option__end { flex-shrink: 0; margin-left: 14px; color: var(--wz-ink-faint); display: flex; align-items: center; }
.wz-option__end svg { width: 16px; height: 16px; }
.wz-option.is-selected .wz-option__end { color: var(--wz-accent); }

/* Case à cocher accessible (bouton role=checkbox) */
.wz-check {
  display: flex;
  align-items: flex-start;
  width: 100%;
  padding: 16px 18px;
  margin: 0;
  background: transparent;
  border: 1px solid var(--wz-line-strong);
  border-radius: 2px;
  color: var(--wz-ink-dim);
  text-align: left;
  font-family: var(--wz-body);
  font-size: 0.88rem;
  font-weight: 300;
  line-height: 1.55;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background-color 0.2s;
}
.wz-check:hover { border-color: rgba(244, 241, 236, 0.6); }
.wz-check__box { width: 18px; height: 18px; flex-shrink: 0; margin: 2px 14px 0 0; display: flex; align-items: center; justify-content: center; border: 1px solid var(--wz-line-strong); color: #fff; }
.wz-check__box svg { width: 12px; height: 12px; }
.wz-check.is-checked { color: var(--wz-ink); border-color: var(--wz-accent-line); background: var(--wz-accent-soft); }
.wz-check.is-checked .wz-check__box { background: var(--wz-accent); border-color: var(--wz-accent); }

/* Interrupteur */
.wz-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; padding: 0; margin: 0; border: 1px solid var(--wz-line-strong); border-radius: 999px; background: transparent; cursor: pointer; transition: background-color 0.2s, border-color 0.2s; }
.wz-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: var(--wz-ink-dim); transition: -webkit-transform 0.2s var(--wz-ease), transform 0.2s var(--wz-ease), background-color 0.2s; }
.wz-switch.is-on { background: var(--wz-accent); border-color: var(--wz-accent); }
.wz-switch.is-on::after { -webkit-transform: translateX(20px); transform: translateX(20px); background: #fff; }
.wz-switch:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Messages ───────────────────────────────────────────── */
.wz-alert, .wizard-error, .wizard-success {
  display: flex;
  align-items: flex-start;
  padding: 14px 18px;
  border: 1px solid var(--wz-line);
  border-left: 2px solid var(--wz-line-strong);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.02);
  color: var(--wz-ink);
  font-size: 0.86rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.wz-alert > svg, .wizard-success > svg { width: 16px; height: 16px; flex-shrink: 0; margin: 3px 12px 0 0; }
.wz-alert__body { flex: 1; min-width: 0; }
.wz-alert__title { display: block; margin-bottom: 4px; font-family: var(--wz-display); font-size: 0.7rem; font-weight: 400; letter-spacing: 0.22em; text-transform: uppercase; }
.wz-alert--error, .wizard-error { border-left-color: var(--wz-err); background: rgba(255, 92, 92, 0.06); color: #ffc9c9; }
.wz-alert--error .wz-alert__title, .wz-alert--error > svg { color: var(--wz-err); }
.wz-alert--success, .wizard-success { border-left-color: var(--wz-ok); background: rgba(110, 231, 168, 0.05); color: #c9f5dc; }
.wz-alert--success .wz-alert__title, .wz-alert--success > svg, .wizard-success > svg { color: var(--wz-ok); }
.wz-alert--warning { border-left-color: var(--wz-warn); background: rgba(245, 196, 107, 0.05); color: #f6e2b8; }
.wz-alert--warning .wz-alert__title, .wz-alert--warning > svg { color: var(--wz-warn); }
.wz-alert--info { border-left-color: var(--wz-accent); background: var(--wz-accent-soft); color: var(--wz-ink); }
.wz-alert--info .wz-alert__title, .wz-alert--info > svg { color: var(--wz-accent); }

.wz-divider, .wizard-divider {
  display: flex;
  align-items: center;
  margin: 24px 0;
  font-family: var(--wz-display);
  font-size: 0.6rem;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--wz-ink-faint);
}
.wz-divider::before, .wz-divider::after, .wizard-divider::before, .wizard-divider::after { content: ''; flex: 1; height: 1px; background: var(--wz-line); }
.wz-divider::before, .wizard-divider::before { margin-right: 16px; }
.wz-divider::after, .wizard-divider::after { margin-left: 16px; }
.wz-divider:empty::before, .wizard-divider:empty::before { margin-right: 0; }
.wz-divider:empty::after, .wizard-divider:empty::after { margin-left: 0; }

/* ── Indicateurs ────────────────────────────────────────── */
.wz-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border: 1px solid var(--wz-line-strong);
  border-radius: 999px;
  font-family: var(--wz-display);
  font-size: 0.56rem;
  font-weight: 400;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--wz-ink-dim);
  white-space: nowrap;
}
.wz-badge--ok { border-color: rgba(110, 231, 168, 0.45); color: var(--wz-ok); }
.wz-badge--accent { border-color: var(--wz-accent-line); color: var(--wz-accent); }
.wz-badge--warn { border-color: rgba(245, 196, 107, 0.45); color: var(--wz-warn); }
.wz-progress { height: 2px; background: rgba(242, 84, 91, 0.18); overflow: hidden; }
.wz-progress__fill { height: 100%; background: var(--wz-accent); transition: width 0.35s var(--wz-ease); }
.wz-stat { padding: 18px 20px; border: 1px solid var(--wz-line); background: var(--wz-surface); }
.wz-stat__value { display: block; font-family: var(--wz-display); font-weight: 200; font-size: 2rem; line-height: 1.1; letter-spacing: 0.04em; color: var(--wz-ink); }
.wz-stat__label { display: block; margin-top: 8px; font-family: var(--wz-display); font-size: 0.58rem; letter-spacing: 0.26em; text-transform: uppercase; color: var(--wz-ink-faint); }
.wz-num { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; border: 1px solid var(--wz-accent-line); color: var(--wz-accent); font-family: var(--wz-display); font-size: 0.7rem; letter-spacing: 0.04em; }
.wz-seal { width: 76px; height: 76px; margin: 0 auto 30px; border: 1px solid var(--wz-accent-line); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--wz-accent); }
.wz-seal svg { width: 30px; height: 30px; }
.wz-seal--ok { border-color: rgba(110, 231, 168, 0.45); color: var(--wz-ok); }
.wz-seal--err { border-color: rgba(255, 123, 123, 0.45); color: var(--wz-err); }
.wz-code {
  display: block;
  padding: 12px 14px;
  border: 1px solid var(--wz-line);
  background: rgba(255, 255, 255, 0.03);
  font-family: var(--wz-mono);
  font-size: 0.85rem;
  color: var(--wz-ink);
  word-break: break-all;
}
.wz-code-big { font-family: var(--wz-mono); font-size: 2rem; letter-spacing: 0.32em; color: var(--wz-ink); font-weight: 400; }
.wz-qr { display: inline-block; padding: 14px; background: #fff; border-radius: 2px; line-height: 0; }
.wz-qr img, .wz-qr canvas { display: block; }
.wz-list { list-style: none; margin: 0; padding: 0; }
.wz-list li { display: flex; align-items: flex-start; padding: 10px 0; font-size: 0.88rem; line-height: 1.6; color: var(--wz-ink-dim); }
.wz-list li > .wz-num { margin-right: 14px; }
.wz-list--lines li { border-bottom: 1px solid var(--wz-line); }
.wz-tag { display: inline-flex; align-items: center; padding: 6px 12px; margin: 0 8px 8px 0; border: 1px solid var(--wz-line-strong); font-size: 0.78rem; color: var(--wz-ink); }
.wz-tag button { margin-left: 8px; padding: 0; background: none; border: 0; color: var(--wz-ink-faint); cursor: pointer; line-height: 1; }
.wz-tag button:hover { color: var(--wz-err); }

/* Spinners daisyUI éventuels restants : teinte corail */
.wz-root .loading { color: var(--wz-accent); }

/* ── TV : lisibilité à distance, cibles plus grandes, pas d'effets coûteux ── */
.wz-root.is-tv .wz-rail { width: 340px; padding-left: 44px; }
.wz-root.is-tv .wz-step { min-height: 56px; }
.wz-root.is-tv .wz-step__label { font-size: 0.82rem; }
.wz-root.is-tv .wz-step__num { font-size: 0.8rem; }
.wz-root.is-tv .wz-content { padding: 56px 72px; align-items: center; }
.wz-root.is-tv .wz-content__inner { max-width: 860px; }
.wz-root.is-tv .wz-title { font-size: 2.1rem; }
.wz-root.is-tv .wz-lead { font-size: 1.12rem; max-width: 44rem; }
.wz-root.is-tv .wz-text { font-size: 1.02rem; }
.wz-root.is-tv .wz-btn, .wz-root.is-tv .wizard-btn-primary, .wz-root.is-tv .wizard-btn-secondary { min-height: 64px; padding: 0 40px; font-size: 0.86rem; }
.wz-root.is-tv .wz-btn--sm { min-height: 52px; padding: 0 24px; font-size: 0.74rem; }
.wz-root.is-tv .wz-input, .wz-root.is-tv .wizard-input { min-height: 64px; font-size: 1.15rem; }
.wz-root.is-tv .wz-label, .wz-root.is-tv .wizard-label { font-size: 0.76rem; }
.wz-root.is-tv .wz-option { min-height: 76px; padding: 18px 24px; }
.wz-root.is-tv .wz-option__title { font-size: 0.95rem; }
.wz-root.is-tv .wz-option__desc { font-size: 0.95rem; }
.wz-root.is-tv .wz-check { font-size: 1rem; padding: 18px 22px; }
.wz-root.is-tv .wz-alert { font-size: 1rem; }
.wz-root.is-tv .wz-icon-btn { width: 52px; height: 52px; }
.wz-root.is-tv .wz-step.is-active { background: rgba(242, 84, 91, 0.07); }
`;
