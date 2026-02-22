# Build webOS

## Modes de build

| Mode | Commande | Résultat |
|------|----------|----------|
| **Simple** (actuel) | `.\build.ps1 -Simple -Package` | IPK minimal : lanceur (choix client cloud / client local), pas de build Astro. |
| **Natif** | `.\build.ps1 -Native -Package` | IPK avec l’app complète embarquée : pas de page de choix, ouverture directe dans l’app = expérience plus fluide. |
| **Démo** | `.\build.ps1 -Demo -Package` | App complète + backend de validation (stores). |

## Build natif (sans lanceur)

- L’app s’ouvre directement sur l’interface Popcorn (accueil ou setup si pas de backend configuré).
- Plus de redirection ni de page « Choisir le client ».
- Le backend se configure comme d’habitude (Paramètres > URL du serveur ou connexion cloud).
- Pour un IPK natif : `.\scripts\webos\build.ps1 -Native -Package` (depuis la racine du repo).

## Icônes

Les icônes (fond plein #D1C4E9 pour LG QA) sont générées par `create-icons-solid-bg.mjs` lors du build, ou à la main : `node scripts/webos/create-icons-solid-bg.mjs`.
