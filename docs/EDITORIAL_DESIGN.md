# Design éditorial Popcornn

Référence du langage visuel **consommateur** (home, recherche, fiche média, lecteur, overlays). Complète [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md), qui reste centré Sync / Settings (`--ds-*`).

## Activation

- Attribut `html[data-editorial]` posé dans [`src/layouts/Layout.astro`](../src/layouts/Layout.astro) (web, mobile, TV / webOS).
- Feuille de styles : [`src/styles/editorial.css`](../src/styles/editorial.css).
- Hors scope : routes `/car*` (lecteur voiture).

## Tokens `--ed-*`

| Token | Rôle |
| --- | --- |
| `--ed-accent` / `--ed-accent-hover` | Corail CTA (#f2545b) |
| `--ed-ink` / `--ed-ink-dim` / `--ed-ink-faint` | Texte |
| `--ed-line` / `--ed-line-strong` | Filets / bordures |
| `--ed-bg` | Fond page (#0c0d10) |
| `--ed-font-display` | Josefin Sans / Jost — titres, CTA |
| `--ed-font-body` | Jost — corps |
| `--ed-track-xl` / `--md` / `--sm` | Letter-spacing uppercase |
| `--ed-gutter` | Marges latérales hero / pages |

Sous `html[data-editorial]`, `--ds-accent-violet` est mappé vers `--ed-accent` pour les composants DS encore partagés.

## Composition

- Brand / titre display en uppercase, tracking large ; un hero, un CTA principal.
- CTA : `.ed-cta` (fond corail, coins nets, uppercase) — pas de pills violettes ni glass dashboard.
- Pas de cards décoratives ; cards seulement pour une interaction réelle.
- Hero full-bleed (`.ed-hero`) ; pas d’image hero en carte flottante.
- Rangées catalogue : `.ed-row` + `.ed-row-title` (compteur 01 / 02…).
- Loader unique : `.ed-loader` / `DsLoader` — pages (`lg`/`xl`) = marque Popcornn + titre + trait corail (identique à `#popcorn-loading-fallback`) ; `xs`/`sm` = anneau fin.
- Motion : fondus courts (`.ed-fade`) ; voir aussi [`MOTION.md`](./MOTION.md). Sur TV / webOS, blur et ombres coûteux sont coupés.

## Patterns UI

| Surface | Classes / ciblage |
| --- | --- |
| Nav | overrides `.navbar-tv`, `.nav-tab` |
| Fiche média | `.ed-detail-head`, `[data-tv-media-detail]`, actions `.gtv-pill-btn` / `[data-media-detail-primary-action]` |
| Overlay lecture / download | `[data-playback-overlay]`, `.ed-playback-splash` (marque + titre + piste corail d’états), `.ed-playback-inline`, `.ed-playback-btn` |
| Modales | `.ds-modal-glass` restylé (barre gradient masquée, coins nets) |

## Do / Don’t

**Do**

- Utiliser `var(--ed-*)` ou les classes `.ed-*` pour toute nouvelle surface home / fiche / lecteur.
- CTA principal = accent corail, uppercase display.
- Sur TV : focus anneau corail, pas de hover requis ; privilégier transform / opacity.

**Don’t**

- Réintroduire le violet glass `#D1C4E9` / `primary-600` dashboard sur les surfaces consommateur.
- Ajouter blur / ombres multi-couches sur `html[data-tv-platform]` (perf webOS).
- Cards, pills `rounded-full`, badges flottants sur le hero.
- Démarrer un téléchargement juste en ouvrant une fiche (actions manuelles uniquement).

## Fichiers clés

- [`src/styles/editorial.css`](../src/styles/editorial.css)
- [`src/layouts/Layout.astro`](../src/layouts/Layout.astro)
- [`src/components/streaming/player-shared/components/PlaybackStatusSurface.tsx`](../src/components/streaming/player-shared/components/PlaybackStatusSurface.tsx)
- [`src/components/ui/Modal.tsx`](../src/components/ui/Modal.tsx)
