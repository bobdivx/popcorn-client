# Motion — popcorn-client

Adapté de [ai-design-vault](https://github.com/textura-agency/ai-design-vault), pas recopié. Le vault interdit tout `@keyframes` parce qu’il vise des sites vitrines. Ici c’est un dashboard (web, Tauri, webOS) : une partie de la motion est une boucle continue, un ressort ne la remplace pas.

## Une seule binding JS

Le paquet déjà installé est `motion`. Ne pas ajouter `@react-spring/web`, `framer-motion`, ni une deuxième librairie.

## Ce qui reste en CSS

| Cas | Moyen | Exemple |
|---|---|---|
| Hover, focus, couleur, opacité | `transition` + `--ds-ease` / `--ds-duration` | cartes, onglets, boutons |
| Entrée d’un écran ou d’une carte | `@keyframes` opacité + `transform` uniquement | `ds-enter`, `ds-stream-item-in` |
| Boucle infinie (état, pas déco marketing) | `@keyframes` conservés | voir exceptions |

Interdit d’animer `width`, `height`, `top`, `margin`. Le contenu reste dans le DOM : une animation change l’apparence, jamais la présence.

## Exceptions — ne pas supprimer

Ces keyframes ne sont pas des scrolls de landing. Les retirer casse le focus télécommande ou un retour d’état.

- `ds-loader-rotate` — spinner. En `prefers-reduced-motion`, il devient un arc statique, il ne disparaît pas.
- `ds-halo-pulse` — halo focus / sync (`.ds-sync-active-pulse`). Repère 10-foot, pas un ressort.
- `sync-pulse`, `sync-badge-glow`, `sync-elapsed-dot-pulse`, `overview-card-*-pulse`, `sync-fill-pulse` — sync en cours.
- `gradient-x`, `pulse-slow`, `progress-wave`, `sc-skeleton-shine` — chargement indéterminé.
- `playback-status-hint-glow` — qualité en lecture.

Les barres de marque (`--ds-gradient-brand*`) peuvent animer un dégradé. La couleur vient des tokens, pas d’un hex dans le composant.

## Reduced motion

`prefers-reduced-motion: reduce` amène à l’état final : opaque, sans translate, sans flou. Les boucles décoratives s’arrêtent (`animation: none`). Le focus reste visible (outline de `.ds-focus-glow`), le spinner reste lisible.

Ne jamais désactiver la motion pour tout le monde, ni via un flag mobile global. Sur TV, les entrées de rangées sont déjà coupées (`html[data-tv-platform="true"]`).
