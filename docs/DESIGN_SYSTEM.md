# Design system — Sync & Settings

Système de design unifié pour une UX type **dashboard professionnel** (navigation claire, cartes, switches). À réutiliser partout une fois validé sur Sync et Settings.

## Fichiers

- **Tokens & utilitaires CSS** : `src/styles/design-system.css`
  - Variables `--ds-*` (surfaces, accents, texte, radius, espacements)
  - Classes `.ds-card`, `.ds-card-section`, `.ds-nav-tabs`, `.ds-nav-tab`, `.ds-icon-btn`, `.ds-page`, `.ds-container`, `.ds-title-*`, `.ds-text-secondary`
- **Composants Preact** : `src/components/ui/design-system/index.ts`
  - `DsCard` / `DsCardSection` — cartes avec variante `elevated` | `accent`
  - `DsNavTabs` — onglets type switch (label + contenu par onglet)
  - `DsIconButton` — bouton rond icône (Lucide)
  - `DsMetricCard` — carte métrique (icône, label, valeur, accent violet/vert/jaune)
  - `DsPageHeader` — en-tête de page (titre, sous-titre optionnel, slot actions)
  - `DsProgressRing` — anneau de progression 0–100 % (SVG)
  - `DsBarChart` — graphique à barres horizontal/vertical (design system)

## Utilisation

1. **Page** : conteneur `ds-page` + `ds-container` (voir `sync.astro`).
2. **Navigation par onglets** : `<DsNavTabs tabs={[...]} activeId={...} onChange={...} />` pour séparer « Vue d’ensemble » et « Paramètres ».
3. **Cartes** : `<DsCard>`, `<DsCard variant="accent">` pour les CTA.
4. **Boutons icône** : `<DsIconButton icon={RefreshCw} onClick={...} title="..." />`.
5. **Métriques** : `<DsMetricCard icon="🎬" label={t('...')} value={n} accent="yellow" />`.

## Appliquer à d’autres pages

- Importer `design-system.css` (déjà fait dans `Layout.astro`).
- Utiliser les composants depuis `../ui/design-system` ou `../../components/ui/design-system`.
- Remplacer couleurs en dur par `var(--ds-surface)`, `var(--ds-accent-violet)`, etc.
- Utiliser `DsCard` pour les blocs, `DsNavTabs` pour les vues à onglets (ex. Settings par catégorie).
- **Animations** : `.ds-card-animate` (fade-in + translateY), `.ds-card-animate-stagger` sur un conteneur pour décaler l’entrée des enfants (grille de cartes). **Norme design — halo blanc scintillant** : keyframes `ds-halo-pulse` (box-shadow blanc qui pulse en 2s). Utilisé par : `.ds-sync-active-pulse` (sync en cours : icône Paramètres, carte Vue d’ensemble), **focus** (`.ds-focus-glow:focus-visible` = même animation), **clic** (`.ds-active-glow:active` = même halo + scale 0.98). Tous les boutons header, `.sync-toolbar__btn`, `.ds-icon-btn`, cartes torrent utilisent cette norme. `DsProgressRing` pour l’anneau de progression (navbar).

## Sync page (exemple)

- **Onglets** : « Vue d’ensemble » (progression, indexeurs, métriques, sync en cours) | « Paramètres » (indexers à sync, vider, fréquence, etc.).
- **Header** : `DsIconButton` pour Rafraîchir, Télécharger journal, Debug.
- **Métriques** : `DsMetricCard` pour Films / Séries / Autres.
- **Bloc Paramètres** : `DsCard` avec le contenu existant.
- **Boîtes & boutons** : `.ds-box-surface`, `.ds-box-accent`, `.ds-box-accent-green`, `.ds-box-accent-yellow`, `.ds-box-error`, `.ds-btn-accent`, `.ds-btn-secondary` pour modales et cartes (pas de couleurs en dur).

## Audit design — Page Sync Torrents (février 2025)

### Ce qui a été vérifié et corrigé

- **Couleurs en dur** : Toutes les valeurs `#1C1C1E`, `#D1C4E9`, `#2C2C2E`, `#C8E6C9`, `#FFF9C4` dans `TorrentSyncManager.tsx` ont été remplacées par les variables CSS `--ds-surface`, `--ds-accent-violet`, `--ds-surface-elevated`, `--ds-accent-green`, `--ds-accent-yellow` et par les classes utilitaires `.ds-box-*` / `.ds-btn-*` du design system.
- **Modale Détails indexer** : Boîtes métriques (Films/Séries/Autres) utilisent `.ds-box-surface` ; états TMDB utilisent `.ds-box-accent-green`, `.ds-box-accent-yellow`, `.ds-box-accent` ; boutons utilisent `.ds-btn-accent` et `.ds-btn-secondary` ; zone d’erreur utilise `.ds-box-error`.
- **Cartes indexeurs (liste)** : Fond violet/erreur via `.ds-box-accent` et `.sync-card-error` ; focus ring avec `--ds-surface` ; icône chevron et barre de progression avec variables DS.
- **Section « Pendant la sync »** : Fond avec `bg-[var(--ds-surface-elevated)]` ; bannière de phase avec `--ds-accent-violet-muted` et variables de texte.
- **Onglet Paramètres** : Icônes List/Settings avec `bg-[var(--ds-accent-violet)]` ; champs select/input avec `bg-[var(--ds-surface)]` et `border-[var(--ds-border)]` ; labels indexers avec `.ds-box-surface` (via classes Tailwind + variables).
- **Responsive** : Déjà en place (`grid-cols-1 sm:grid-cols-3`, `p-5 sm:p-6`, `text-base sm:text-lg`, etc.) — aucun changement structurel nécessaire.

### Composants réutilisables utilisés

- **Page Sync** : `DsPageHeader`, `DsNavTabs`, `DsIconButton`, `DsMetricCard`, `DsCard`, `DsCardSection`, `DsBarChart`. **Barre Sync** (toolbar) : `.sync-toolbar`, `.sync-toolbar__btn--primary` / `--danger`, variables `--ds-*` (design-system.css).
- **Navbar** : indicateur sync = `DsProgressRing` + classe `.ds-sync-active-pulse` sur le lien Paramètres quand une sync est en cours.
- **Autres pages Settings** : `DsSettingsSectionCard` (DiscoverySubMenuPanel, ContentSubMenuPanel), `DsCard` / `DsCardSection` (LibrarySubMenuPanel, UiPreferencesPanel, etc.).

### Cohérence avec le reste de l’application

- **Wizard (setup)** : Parcours dédié (étapes, navigation spécifique). Il n’utilise pas les composants Ds* ; pour une cohérence visuelle future, on peut réutiliser `--ds-*` et éventuellement `DsCard` dans les steps.
- **Popcorn-web** : Projet séparé (vitrine + cloud). Design propre au site web ; pas de design system partagé avec popcorn-client. Pour une identité de marque unifiée, on pourrait extraire les tokens (couleurs, radius) dans un package partagé ou un fichier de tokens commun.
- **Recommandation** : Pour toute nouvelle page ou composant dans popcorn-client (Settings, Dashboard, etc.), utiliser systématiquement les composants et classes du design system et éviter les couleurs / rayons en dur.
