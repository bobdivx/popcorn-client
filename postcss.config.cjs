/**
 * PostCSS (chargé par @astrojs/tailwind pour les 3 builds : web, Tauri/Android TV, webOS).
 *
 * Perf D-pad TV : retire deux familles de sélecteurs `:has()` générés par daisyUI et
 * inutilisés par l'app, qui rendent CHAQUE appui télécommande très lent :
 *
 * 1. `:has(... [class^=|*=|$=|~=|=...])` — ex. `.tabs-lifted:has(.tab-content[class^="rounded-"]) .tab`.
 *    Un sélecteur d'attribut sur `class` dans :has() oblige Chromium à recalculer le style de
 *    TOUT le document à chaque ajout/retrait de classe, n'importe où (focus `tv-element-focused`,
 *    `tv-card-focused`, états actifs…).
 * 2. `:has(...)::pseudo-élément` — ex. `.input:has(> input[disabled])::placeholder`.
 *    Même effet à chaque changement de focus (`element.focus()`).
 *
 * Mesuré (Chromium, ~9 000 éléments, 480 cartes) : recalcul style par touche 50 ms → <1 ms (header)
 * et 50 ms → 14 ms (cartes) sans throttling ; ×6 sur une TV.
 *
 * Exécuté en OnceExit : passe après Tailwind/daisyUI (ajoutés après ce plugin par l'intégration).
 */
const HAS_ARG = String.raw`:has\((?:[^()]|\([^()]*\))*`;
const HAS_CLASS_ATTR = new RegExp(HAS_ARG + String.raw`\[\s*class\s*[\^*$|~]?=`, 'i');
const HAS_THEN_PSEUDO_ELEMENT = new RegExp(HAS_ARG + String.raw`\)[^\s>+~,]*::`, 'i');

const isCostlyHas = (selector) => HAS_CLASS_ATTR.test(selector) || HAS_THEN_PSEUDO_ELEMENT.test(selector);

const stripCostlyHas = () => ({
  postcssPlugin: 'popcornn-strip-costly-has',
  OnceExit(root) {
    root.walkRules((rule) => {
      if (!rule.selector || !rule.selector.includes(':has(')) return;
      const selectors = rule.selectors;
      const kept = selectors.filter((s) => !isCostlyHas(s));
      if (kept.length === selectors.length) return;
      if (kept.length === 0) rule.remove();
      else rule.selectors = kept;
    });
  },
});
stripCostlyHas.postcss = true;

module.exports = {
  plugins: [stripCostlyHas()],
};
