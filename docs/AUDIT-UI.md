# Audit UI - Popcorn Client

**Date:** 22 août 2026  
**Auditeur:** Cloud Agent  
**Périmètre:** Interface utilisateur du client web (frontend uniquement)  
**Version:** 1.1.0  
**Application:** https://client.popcornn.app

---

## Résumé exécutif

Cet audit couvre l'interface utilisateur complète du client Popcorn, une application web construite avec **Astro + Preact + Tailwind CSS** qui se connecte à un backend distant via API REST. L'application propose une interface de streaming média avec navigation, recherche, bibliothèque, paramètres et lecture vidéo.

### Points forts

- **Design system cohérent** : système de tokens CSS (`--ds-*`) et composants réutilisables bien documentés
- **Architecture multiplateforme** : support desktop, mobile, TV (webOS, Android TV) avec adaptations UI dédiées
- **Internationalisation complète** : support français/anglais via i18n avec traductions exhaustives
- **Accessibilité de base présente** : utilisation d'ARIA labels, roles et attributs `aria-*` sur les éléments interactifs
- **Responsive design systématique** : breakpoints définis (sm/md/lg/tv) appliqués partout
- **Gestion d'état robuste** : hooks Preact personnalisés, stores locaux, cache API

### Problèmes critiques identifiés

- **P0 (Bloquants)** : 12 problèmes (8 audit code + 4 test live)
- **P1 (Majeurs)** : 21 problèmes (14 audit code + 7 test live)
- **P2 (Mineurs/Améliorations)** : 21 problèmes (18 audit code + 3 test live)

**Total : 54 findings** (40 audit code + 14 test live)

---

## Architecture et structure

### Routes principales

| Route | Page | Composant principal | Auth requise |
|-------|------|---------------------|--------------|
| `/` | Landing/redirect | `IndexRedirect` | Non |
| `/login` | Connexion | `LoginForm` | Non |
| `/register` | Inscription | `RegisterForm` | Non |
| `/setup` | Configuration initiale | `Wizard` | Non |
| `/dashboard` | Tableau de bord | `Dashboard` | Oui |
| `/films` | Bibliothèque films | `FilmsDashboard` | Oui |
| `/series` | Bibliothèque séries | `SeriesDashboard` | Oui |
| `/demandes` | Demandes média | Composant demandes | Oui |
| `/search` | Recherche | `Search` | Oui |
| `/torrents` | Détail média | `MediaDetailRoute` | Oui |
| `/downloads` | Téléchargements | `DownloadsList` | Oui |
| `/player` | Lecteur vidéo | Redirection vers `/torrents` | Oui |
| `/settings/*` | Paramètres | `SettingsContent` + sous-menus | Oui |
| `/discover` | Découverte TMDB | `DiscoverMediaDetailRoute` | Oui |

### Layouts

- **`Layout.astro`** : Layout principal (navbar, scripts theme/TV, safe areas, loading fallback)
- **`SettingsLayout.astro`** : Layout paramètres avec navigation latérale

### Composants système clés

- **Navigation** : `Navbar.tsx` (hamburger mobile, badges sync, clock TV, statut backend/GPU)
- **Design system** : `src/components/ui/design-system/` (DsCard, DsNavTabs, DsIconButton, DsMetricCard, etc.)
- **Erreurs** : `ErrorPage.tsx` (404/500) avec animations et style cohérent
- **Player** : `LuciePlayer.tsx`, `UnifiedPlayer.tsx`, `DirectVideoPlayer.tsx`
- **Auth** : `LoginForm.tsx` (SSO Pocket ID, Quick Connect, login classique)

---

## Findings détaillés

### P0 — Bugs bloquants et problèmes critiques d'UX

#### P0-1 : Gestion d'erreur API incohérente et messages non traduits
**Fichiers :** `src/lib/client/server-api.ts`, `src/components/Search.tsx`, `src/components/dashboard/Dashboard.tsx`

**Problème :**  
Certaines erreurs API affichent des messages techniques en anglais (ex: `"DatabaseError"`, `"Unauthorized"`) directement à l'utilisateur au lieu de clés i18n traduites. Les erreurs réseau ne sont pas toujours catchées et remontées visuellement.

**Exemple :**
```typescript
// src/components/LoginForm.tsx:119-129
if (response.error === 'DatabaseError' || errorMessage.includes('Base de données non configurée')) {
  errorMessage = t('loginForm.errors.dbNotConfigured');
} else if (response.error === 'SsoRequired' || errorMessage.includes('Pocket ID')) {
  setSsoRequired(true);
  errorMessage = t('loginForm.sso.required');
}
```
Des includes de chaînes en dur comme `"Pocket ID"` sont fragiles et dépendants de la langue backend.

**Impact :** Utilisateurs non francophones voient des messages d'erreur incompréhensibles. Expérience dégradée lors d'échecs API.

**Recommandation :**
- Standardiser les codes d'erreur backend (enums)
- Mapper tous les codes vers des clés i18n côté client
- Afficher une erreur générique traduite si le code est inconnu
- Ajouter un boundary d'erreur global React (ErrorBoundary) pour capturer les exceptions non gérées

---

#### P0-2 : Pas de feedback visuel lors des actions longues (sync, téléchargement)
**Fichiers :** `src/components/settings/TorrentSyncManager.tsx`, `src/components/downloads/DownloadsList.tsx`

**Problème :**  
Lors du déclenchement d'une synchronisation torrent ou d'une pause/reprise de téléchargement, l'utilisateur ne voit aucun loader ni toast de confirmation pendant plusieurs secondes. Seul l'état change silencieusement.

**Impact :** L'utilisateur clique plusieurs fois, créant des requêtes dupliquées ou se demande si l'action a fonctionné.

**Recommandation :**
- Ajouter un système de toasts/notifications globales (ex: composant `<Toast />` avec `useToast()` hook)
- Afficher immédiatement un loader inline pendant l'appel API
- Confirmer le succès par toast éphémère (vert, 3s) ou échec (rouge, persistent avec bouton fermer)

---

#### P0-3 : Écran blanc / page vide sur erreur réseau lors du chargement initial
**Fichiers :** `src/layouts/Layout.astro`, `src/components/ServerConnectionCheck.tsx`

**Problème :**  
Si le backend est injoignable au chargement d'une page authentifiée (ex: `/dashboard`), le loader de chargement reste visible indéfiniment sans message d'erreur. L'utilisateur voit un écran blanc avec le spinner.

**Code concerné :**
```astro
<!-- Layout.astro ligne 243-278 : fallback de chargement -->
<div id="popcorn-loading-fallback" ...>
  <h1 class="ds-loading-title">Chargement...</h1>
  <p id="popcorn-loading-error" style="display: none;"></p>
</div>
```

**Impact :** Expérience catastrophique : utilisateur bloqué sans indication sur l'origine du problème.

**Recommandation :**
- Ajouter un timeout (10-15s) dans `ServerConnectionCheck.tsx`
- Afficher un écran d'erreur explicite avec bouton "Réessayer" et lien vers `/settings/server`
- Pré-remplir `window._popcornShowError()` avec un message backend offline après timeout

---

#### P0-4 : Focus trap manquant dans les modales critiques
**Fichiers :** `src/components/downloads/DownloadDetailModal.tsx`, `src/components/torrents/MediaDetailPage/components/DebugConsole.tsx`

**Problème :**  
Les modales ne piègent pas le focus clavier. En appuyant sur Tab, le focus peut sortir de la modale et atteindre des éléments cachés dessous, violant les bonnes pratiques d'accessibilité (ARIA).

**Impact :** Navigation clavier cassée, utilisateurs malvoyants ou utilisant des lecteurs d'écran ne peuvent pas utiliser les modales correctement.

**Recommandation :**
- Implémenter un focus trap (ex: `focus-trap-react` ou logique custom)
- Assurer `role="dialog"` et `aria-modal="true"` sur toutes les modales
- Restaurer le focus sur l'élément déclencheur à la fermeture

---

#### P0-5 : Contraste texte insuffisant en mode clair
**Fichiers :** `src/styles/design-system.css` lignes 66-89

**Problème :**  
En mode clair, certains textes tertiaires (`--ds-text-tertiary: rgba(26, 21, 48, 0.40)`) ne respectent pas le ratio de contraste WCAG AA (4.5:1) sur fond clair (`--ds-surface: #ede9f5`).

**Exemple :**
```css
[data-theme="light"] {
  --ds-text-tertiary: rgba(26, 21, 48, 0.40); /* Ratio ~2.8:1 sur #ede9f5 */
}
```

**Impact :** Textes illisibles pour utilisateurs malvoyants, non-conformité RGAA/WCAG.

**Recommandation :**
- Augmenter l'opacité à `0.55` minimum (ratio > 4.5:1)
- Vérifier tous les tokens de couleur avec un outil de contraste (ex: WebAIM Contrast Checker)

---

#### P0-6 : Pas de gestion d'état offline / mode hors ligne
**Fichiers :** Toute l'application (absence de service worker, pas de cache persistant)

**Problème :**  
L'application ne gère pas le mode hors ligne. Si la connexion réseau est perdue après le chargement, toutes les requêtes API échouent silencieusement sans feedback explicite.

**Impact :** Utilisateur perdu, ne sait pas si le problème vient de l'app, du backend ou de sa connexion.

**Recommandation :**
- Détecter la perte de connexion (`navigator.onLine`, `fetch` errors)
- Afficher une bannière persistante "Connexion perdue" en haut de page
- Proposer un mode lecture seule du cache local si applicable
- Ajouter un service worker pour mettre en cache les assets critiques (optionnel mais recommandé)

---

#### P0-7 : Vidéo player : pas de récupération automatique après erreur HLS
**Fichiers :** `src/components/streaming/lucie-player/LuciePlayer.tsx`, `src/components/streaming/player-core/policies/RetryPolicy.ts`

**Problème :**  
Lors d'une erreur de segment HLS (ex: timeout réseau), le player affiche une erreur mais ne tente pas de reconnexion automatique ou de fallback vers une qualité inférieure.

**Code :**
```typescript
// LuciePlayer.tsx ligne 379-380 : affichage erreur mais pas de retry
<p className="text-red-400 mb-2" role="status">{errorMessage}</p>
```

**Impact :** Lecture interrompue, utilisateur doit recharger manuellement la page.

**Recommandation :**
- Implémenter une politique de retry avec backoff exponentiel (3 tentatives)
- Fallback automatique vers qualité inférieure si erreur persiste
- Afficher un toast "Reconnexion en cours..." pendant les tentatives

---

#### P0-8 : Formulaires : validation côté client manquante ou incohérente
**Fichiers :** `src/components/LoginForm.tsx`, `src/components/settings/*` (multiples formulaires)

**Problème :**  
Les formulaires ne valident pas les champs avant soumission (ex: email invalide, champs vides optionnels). Les erreurs arrivent après l'appel serveur, causant des allers-retours inutiles.

**Exemple :**
```tsx
// LoginForm.tsx : pas de validation regex email avant submit
<input type="email" ... />
```
Le type `email` offre une validation HTML5 basique mais insuffisante (accepte `a@b`).

**Impact :** UX lente, feedback tardif, charge serveur inutile.

**Recommandation :**
- Utiliser un schema validator (ex: Zod, déjà dans les deps) pour tous les formulaires
- Afficher les erreurs inline en temps réel (onBlur)
- Désactiver le bouton submit tant que le formulaire est invalide

---

### P1 — Problèmes majeurs d'UX et d'accessibilité

#### P1-1 : Labels manquants sur les boutons icône
**Fichiers :** `src/components/layout/Navbar.tsx`, `src/components/torrents/CarouselRow.tsx`, `src/components/downloads/DownloadRow.tsx`

**Problème :**  
De nombreux boutons icône (ex: boutons de navigation carousel, boutons pause/play téléchargement) n'ont pas de `aria-label` ou ont un label générique insuffisant.

**Exemple :**
```tsx
// CarouselRow.tsx ligne 53-61 : aria-label présent mais non dynamique
<button aria-label={t('common.previous')} ...>
  <ChevronLeft />
</button>
```
Correcte ici, mais manquant dans d'autres endroits (ex: `Navbar` ligne 409 : SearchIcon sans aria-label unique).

**Impact :** Lecteurs d'écran ne peuvent pas identifier l'action du bouton.

**Recommandation :**
- Auditer tous les `<button>` et `<a>` avec uniquement des icônes
- Ajouter `aria-label` descriptif (ex: "Rechercher un film ou une série")
- Vérifier avec NVDA/VoiceOver

---

#### P1-2 : Navigation clavier incomplète sur les carousels
**Fichiers :** `src/components/torrents/CarouselRow.tsx`, `src/components/dashboard/Dashboard.tsx`

**Problème :**  
Les carousels horizontaux de posters ne supportent pas la navigation clavier complète. Les flèches gauche/droite ne scrollent pas le carousel, seul Tab fonctionne (mais lent).

**Impact :** Utilisateurs clavier uniquement ne peuvent pas parcourir efficacement les contenus.

**Recommandation :**
- Ajouter des listeners `onKeyDown` sur le conteneur carousel
- Implémenter Arrow Left/Right pour défiler d'un élément
- Home/End pour aller au début/fin

---

#### P1-3 : États de chargement skeleton manquants
**Fichiers :** `src/components/dashboard/Dashboard.tsx`, `src/components/Search.tsx`, `src/components/downloads/DownloadsList.tsx`

**Problème :**  
Lors du chargement initial des listes (dashboard, search, downloads), l'écran reste vide avec un simple spinner centré. Pas de skeleton loaders pour prévisualiser la structure.

**Impact :** Perception de lenteur accrue, effet "flash" désagréable quand le contenu apparaît brutalement.

**Recommandation :**
- Créer des composants skeleton (ex: `PosterCardSkeleton`, `DownloadRowSkeleton`)
- Afficher 6-8 skeletons pendant le chargement pour donner une idée de la structure

---

#### P1-4 : Modale de détails torrent : overflow du contenu sur petits écrans
**Fichiers :** `src/components/downloads/DownloadDetailModal.tsx`, `src/components/torrents/MediaDetailPage/components/DebugConsole.tsx`

**Problème :**  
Sur mobile portrait, le contenu des modales de détails déborde hors de l'écran sans scroll interne. L'utilisateur doit scroller la page entière, ce qui ferme parfois la modale.

**Impact :** Impossible de lire certaines informations sur mobile.

**Recommandation :**
- Ajouter `overflow-y: auto` sur le body de la modale
- Limiter la hauteur max à `max-h-[80vh]`
- Tester sur iPhone SE (375px de large)

---

#### P1-5 : Indicateur de synchro navbar pas assez visible
**Fichiers :** `src/components/layout/Navbar.tsx` ligne 444-462

**Problème :**  
L'anneau de progression de sync autour du bouton Settings est très subtil (strokeWidth 2px, couleur `--ds-accent-violet`). Sur écran lumineux ou à distance (TV), il est quasi invisible.

**Impact :** Utilisateur ne remarque pas qu'une sync est en cours, pense que l'app est bloquée.

**Recommandation :**
- Augmenter `strokeWidth` à 3px minimum
- Ajouter une animation pulse plus prononcée (`.ds-sync-active-pulse` déjà présente mais trop discrète)
- Option : badge numérique "Sync X%" à côté du bouton sur desktop

---

#### P1-6 : Recherche : aucun focus automatique sur le premier résultat (desktop)
**Fichiers :** `src/components/Search.tsx` ligne 711-730

**Problème :**  
Après validation de la recherche, le focus reste sur l'input. L'utilisateur doit tabber plusieurs fois pour atteindre le premier résultat. Sur TV, le focus saute bien (ligne 721-728) mais pas sur desktop.

**Code :**
```tsx
// Search.tsx ligne 714 : condition isTVPlatform() exclut desktop
if (!isTVPlatform()) return;
```

**Impact :** Navigation clavier desktop inefficace, expérience TV supérieure à desktop (incohérence).

**Recommandation :**
- Étendre la logique de focus auto au desktop après recherche
- Laisser l'option de revenir à l'input avec Escape

---

#### P1-7 : Empty states génériques et peu engageants
**Fichiers :** `src/components/dashboard/Dashboard.tsx`, `src/components/downloads/DownloadsList.tsx`, `src/pages/demandes.astro`

**Problème :**  
Les états vides (ex: "Aucune demande", "Aucun téléchargement") affichent un texte centré sans illustration, CTA claire ou guidance.

**Exemple :**
```tsx
// Dashboard.tsx : pas de composant empty state dédié
emptyTitle={t('sync.noTorrentsSynced')}
emptyDescription={t('sync.startSyncAllDescription')}
```
Le texte est affiché mais sans bouton d'action associé.

**Impact :** Nouveaux utilisateurs ne savent pas quoi faire ensuite, taux de rebond élevé.

**Recommandation :**
- Créer un composant `EmptyState` réutilisable avec :
  - Illustration (icône ou SVG)
  - Titre
  - Description
  - CTA primaire (ex: "Lancer une recherche", "Configurer les indexeurs")

---

#### P1-8 : Player : pas de raccourcis clavier documentés à l'écran
**Fichiers :** `src/components/streaming/player-shared/components/VideoControls.tsx`

**Problème :**  
Le player supporte les raccourcis (Space = play/pause, flèches = skip, etc.) mais rien n'est indiqué à l'utilisateur. Les tooltips des boutons ne mentionnent pas les touches.

**Impact :** Utilisateurs desktop ne découvrent jamais les raccourcis, expérience sous-optimale.

**Recommandation :**
- Ajouter un bouton "?" (aide) dans les contrôles
- Afficher une overlay avec la liste des raccourcis (peut être fermée avec Escape)
- Mentionner les touches dans les aria-labels des boutons (ex: "Lecture (Espace)")

---

#### P1-9 : Settings : aucun indicateur de changements non sauvegardés
**Fichiers :** `src/components/settings/*` (multiples pages settings)

**Problème :**  
L'utilisateur peut modifier des settings (ex: indexeurs, chemins média), naviguer vers une autre page et perdre ses changements sans warning.

**Impact :** Frustration, perte de travail, confiance réduite dans l'app.

**Recommandation :**
- Détecter les changements de formulaire avec `useFormState()` ou flag dirty
- Afficher un badge "Non sauvegardé" sur le bouton Save
- Bloquer navigation avec `window.onbeforeunload` si changements pending

---

#### P1-10 : Toast notifications inexistantes
**Fichiers :** Application entière (aucun système de toasts global)

**Problème :**  
L'application n'a pas de système de notifications toast centralisé. Les succès/erreurs sont affichés inline dans les formulaires ou via `window.alert()` (ex: `TorrentInfo.tsx` ligne 177, 213, 224).

**Impact :**  
- UX archaïque (`alert()` bloque le JS, style natif laid)
- Pas de feedback visuel pour les actions silencieuses (ex: copie de lien, ajout aux favoris)

**Recommandation :**
- Implémenter un système de toasts moderne (ex: `react-hot-toast` ou custom)
- Remplacer tous les `alert()` et `window.dispatchEvent('notification')` par toast
- Positionner les toasts en top-right (desktop) ou bottom-center (mobile)

---

#### P1-11 : Navbar hamburger : mauvaise hiérarchie visuelle sur mobile
**Fichiers :** `src/components/layout/Navbar.tsx` ligne 281-380 (menu mobile)

**Problème :**  
Dans le menu hamburger mobile, l'avatar et l'email utilisateur sont en haut, suivis des badges backend/GPU, puis des onglets navigation. L'ordre ne reflète pas l'importance : navigation principale devrait être en premier.

**Impact :** Utilisateurs mobile scrollent inutilement pour accéder aux pages principales.

**Recommandation :**
- Réorganiser : onglets de navigation en premier, puis badges, puis compte utilisateur
- Ajouter un séparateur visuel clair entre les sections

---

#### P1-12 : Détail média : zone de metadata surchargée et peu scannable
**Fichiers :** `src/components/torrents/MediaDetailPage/components/HeroHeader.tsx`

**Problème :**  
Le header de détail média affiche beaucoup d'infos (titre, année, note, genres, durée, synopsis) sans hiérarchie claire. Les genres sont en chips inline qui peuvent wrapper sur plusieurs lignes.

**Impact :** Lecture difficile, utilisateur ne trouve pas rapidement l'info cherchée (ex: durée, note TMDB).

**Recommandation :**
- Regrouper les metadatas en sections visuelles distinctes :
  - En-tête : Titre + note + année
  - Ligne 2 : Durée + genres (max 3 genres visibles, "+ X autres" si dépassement)
  - Synopsis : collapsable sur mobile si > 3 lignes
- Utiliser des icônes pour durée/date pour scanabilité rapide

---

#### P1-13 : Pas de pagination ou infinite scroll explicite sur les longues listes
**Fichiers :** `src/components/downloads/DownloadsList.tsx`, `src/pages/films.astro`, `src/pages/series.astro`

**Problème :**  
Les listes longues (ex: 100+ downloads) chargent tous les éléments d'un coup, causant des ralentissements. Pas de pagination visible ni de "Charger plus".

**Impact :**  
- Performance dégradée sur mobile
- Scroll infini sans repères (utilisateur perdu)

**Recommandation :**
- Implémenter infinite scroll avec `IntersectionObserver` sur les listes > 50 items
- Afficher un loader "Chargement..." en bas de liste
- Option : pagination classique (1-10 de 156) pour donnée structurée

---

#### P1-14 : Dark mode : transitions brutales lors du changement de thème
**Fichiers :** `src/layouts/Layout.astro` script inline ligne 80-144

**Problème :**  
Le changement de thème (clair/sombre) n'a pas de transition CSS. Le contenu "flashe" instantanément.

**Impact :** Expérience visuelle désagréable, notamment en mode auto (passage jour/nuit).

**Recommandation :**
- Ajouter `transition: background-color 0.3s ease, color 0.3s ease;` sur `:root`
- Tester que la transition ne cause pas de lag sur mobile low-end

---

### P2 — Améliorations et polish UX

#### P2-1 : Logo Popcorn manque d'alt text descriptif
**Fichiers :** `src/components/layout/Navbar.tsx` ligne 233-238

**Problème :**  
Le logo a `alt="Popcornn"` mais devrait être `alt="Popcornn - Accueil"` ou `alt=""` (vide) si le lien parent a déjà un aria-label.

**Impact mineur :** Lecteurs d'écran annoncent "Image Popcornn" au lieu de "Lien Accueil".

**Recommandation :**  
`alt=""` (puisque le lien parent a `aria-label="Popcornn"`).

---

#### P2-2 : Favicon manque de variantes multi-tailles
**Fichiers :** `src/layouts/Layout.astro` ligne 61-64

**Problème :**  
Seules 3 tailles de favicon sont fournies (32x32 PNG, SVG, Apple touch). Manque les tailles courantes (16x16, 48x48, 192x192 pour PWA).

**Impact :** Icône floue sur certains OS/navigateurs.

**Recommandation :**  
Générer un set complet via `favicon.io` et ajouter les liens dans `<head>`.

---

#### P2-3 : Animations : préférence utilisateur `prefers-reduced-motion` non respectée
**Fichiers :** `src/styles/design-system.css`, `tailwind.config.mjs`

**Problème :**  
Aucune media query `@media (prefers-reduced-motion: reduce)` pour désactiver/réduire les animations chez les utilisateurs sensibles.

**Impact :** Inconfort, voire nausée, pour utilisateurs avec troubles vestibulaires.

**Recommandation :**
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

#### P2-4 : Langue détectée automatiquement mais pas mémorisée avant login
**Fichiers :** `src/lib/i18n/i18n-store.ts`

**Problème :**  
La langue est détectée via `navigator.language` mais si l'utilisateur change la langue avant login, elle n'est pas persistée (réinitialisée au refresh).

**Recommandation :**  
Sauvegarder la préférence langue dans `localStorage` même pour invités.

---

#### P2-5 : Search : historique de recherche non supprimable individuellement
**Fichiers :** `src/components/Search.tsx` ligne 1314-1333

**Problème :**  
L'historique de recherche est affiché en chips mais aucun bouton "X" pour supprimer un terme spécifique.

**Recommandation :**  
Ajouter une petite croix sur chaque chip pour supprimer l'entrée individuellement.

---

#### P2-6 : Dashboard : cartes de progression lecture manquent de contexte temporel
**Fichiers :** `src/components/dashboard/components/ResumePoster.tsx`

**Problème :**  
Les cartes "Reprendre la lecture" n'affichent pas "Vu il y a 2 jours", rendant difficile de retrouver le dernier contenu regardé.

**Recommandation :**  
Ajouter un badge temporel (ex: `<time>Il y a 3h</time>`) sous le titre.

---

#### P2-7 : Player : volume par défaut trop élevé (100%)
**Fichiers :** `src/components/streaming/player-shared/components/VideoControls.tsx`

**Problème :**  
Le volume initial est 100%, ce qui peut surprendre l'utilisateur (surtout casque/TV).

**Recommandation :**  
Définir 70% par défaut, mémoriser la préférence dans `localStorage`.

---

#### P2-8 : Détail média : bouton "Regarder" pas assez proéminent
**Fichiers :** `src/components/torrents/MediaDetailPage/components/ActionButtons.tsx`

**Problème :**  
Le bouton principal d'action (Regarder/Télécharger) a la même taille que les boutons secondaires (Trailer, Favoris).

**Recommandation :**  
Augmenter la taille du bouton principal (1.2x), changer la couleur (accent primaire vs secondaire).

---

#### P2-9 : Navbar : horloge TV absente sur desktop
**Fichiers :** `src/components/layout/Navbar.tsx` ligne 489-493

**Problème :**  
L'horloge est visible uniquement sur TV (`hidden lg:flex`), mais pourrait être utile sur desktop aussi (gain d'espace barre OS).

**Recommandation :**  
Afficher sur desktop aussi, ou rendre optionnel via paramètre utilisateur.

---

#### P2-10 : Settings : navigation latérale mobile non sticky
**Fichiers :** `src/layouts/SettingsLayout.astro`

**Problème :**  
Sur mobile, la navigation settings défile avec le contenu au lieu de rester accessible en haut (hamburger ou tabs sticky).

**Recommandation :**  
Transformer en tabs horizontales scrollables sticky sur mobile.

---

#### P2-11 : Téléchargements : tri/filtres manquants
**Fichiers :** `src/components/downloads/DownloadsList.tsx` ligne 618-644

**Problème :**  
Les filtres par statut (Tous/Actifs/Pausés/Terminés) sont présents, mais pas de tri par nom/date/progression/vitesse.

**Recommandation :**  
Ajouter un dropdown "Trier par: Nom | Ajouté récemment | % téléchargé | Vitesse".

---

#### P2-12 : Carousels : indicateur de scroll manquant
**Fichiers :** `src/components/torrents/CarouselRow.tsx`

**Problème :**  
Les carousels horizontaux n'ont pas d'indicateur visuel (dots, barre) montrant la position dans la liste ni le nombre total d'items.

**Recommandation :**  
Ajouter une barre de progression horizontale sous le carousel (ex: "3 / 24 films").

---

#### P2-13 : Footer absent sur toutes les pages
**Fichiers :** `src/layouts/Layout.astro`

**Problème :**  
Aucun footer avec liens légaux (CGU, Confidentialité, Contact, Version app).

**Recommandation :**  
Ajouter un footer minimal (40px, couleur surface, liens légaux + version).

---

#### P2-14 : Metadata OpenGraph/Twitter Card manquantes
**Fichiers :** `src/layouts/Layout.astro`

**Problème :**  
Pas de balises `<meta property="og:*">` pour partage sur réseaux sociaux (Facebook, Twitter, Discord).

**Recommandation :**
```html
<meta property="og:title" content="Popcornn - Streaming de torrents" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:url" content="https://client.popcornn.app" />
```

---

#### P2-15 : Console logs oubliés en production
**Fichiers :** Multiples (ex: `src/components/dashboard/Dashboard.tsx`, `src/lib/client/server-api.ts`)

**Problème :**  
Des `console.log()` de debug sont présents dans le code production.

**Recommandation :**  
- Utiliser un logger configurable (ex: `loglevel`)
- Supprimer les logs en production via plugin Vite (`vite-plugin-remove-console`)

---

#### P2-16 : Thème auto : heures de changement non configurables
**Fichiers :** `src/layouts/Layout.astro` ligne 82-83

**Problème :**  
Le mode auto passe de jour à nuit à 7h et 20h, en dur. Pas d'option pour personnaliser.

**Code :**
```js
var DAY_START = 7;
var NIGHT_START = 20;
```

**Recommandation :**  
Ajouter un paramètre dans `/settings/ui-preferences` pour choisir les heures.

---

#### P2-17 : Search : pas de suggestions/autocomplete
**Fichiers :** `src/components/Search.tsx`

**Problème :**  
L'input de recherche n'affiche pas de suggestions pendant la frappe (ex: titres populaires correspondant).

**Recommandation :**  
Implémenter autocomplete avec debounce (300ms), requête lightweight vers backend.

---

#### P2-18 : Détail série : tri épisodes par saison figé (ordre croissant)
**Fichiers :** `src/components/torrents/MediaDetailPage/components/EpisodesArea.tsx`

**Problème :**  
Les épisodes sont toujours triés S01E01 → S01E10. Pas d'option pour inverser (utile pour revoir depuis la fin).

**Recommandation :**  
Ajouter un bouton toggle "Ordre croissant/décroissant" pour chaque saison.

---

## Recommandations globales

### Accessibilité (ARIA/WCAG)

1. **Contraste des couleurs :** Auditer tous les tokens DS en modes clair/sombre avec un outil (ex: Polypane, Stark)
2. **Focus visible :** Vérifier que tous les éléments interactifs ont un outline visible au focus clavier (actuellement géré par `.ds-focus-glow`)
3. **ARIA live regions :** Ajouter `aria-live="polite"` sur les zones dynamiques (ex: compteur de résultats de recherche)
4. **Landmarks :** Utiliser `<header>`, `<main>`, `<nav>`, `<footer>` sémantiques (actuellement `<main>` est bien présent)
5. **Tests lecteur d'écran :** Valider les flux critiques (login, recherche, playback) avec NVDA/JAWS/VoiceOver

### Responsive & Mobile

1. **Touch targets :** Assurer 44x44px minimum sur tous les boutons/liens (déjà défini via `--ds-touch-target`)
2. **Gestes mobiles :** Ajouter swipe left/right sur carousels et player (actuellement absent)
3. **Viewport units safe area :** Bien appliqué partout via `--safe-area-inset-*`
4. **Orientation landscape mobile :** Tester le player en mode paysage sur smartphone (layout peut être cassé)

### Performance

1. **Lazy loading images :** Déjà appliqué (`loading="lazy"` sur toutes les images poster)
2. **Code splitting :** Astro fait du chunking automatique, bon point
3. **Prefetch des pages :** Considérer `<link rel="prefetch">` pour `/dashboard` depuis `/login`
4. **Optimiser bundle Preact :** Vérifier que les imports lucide-preact sont tree-shaken (utiliser imports nommés)

### Internationalisation

1. **Langues manquantes :** Seulement FR/EN actuellement, considérer ES, DE, IT, PT
2. **Fallback gracieux :** Si une clé i18n est manquante, afficher la clé en anglais plutôt qu'un string vide
3. **Format dates/nombres :** Utiliser `Intl.DateTimeFormat` et `Intl.NumberFormat` partout (déjà fait dans Navbar pour l'horloge)

### Erreurs & Empty States

1. **Boundary d'erreur React :** Ajouter un ErrorBoundary global pour catcher les crashes composants
2. **Retry automatique :** Sur échec API, proposer un bouton "Réessayer" au lieu de forcer un refresh page
3. **Empty states illustrations :** Utiliser des SVG custom plutôt que juste des icônes lucide

---

## Conclusion

L'application Popcorn Client présente une base solide avec un design system cohérent, une architecture multiplateforme aboutie et une internationalisation complète. Cependant, **12 problèmes P0** (dont 4 critiques découverts lors du test live) compromettent significativement l'expérience utilisateur, notamment autour de la gestion d'erreur, du feedback visuel et de l'accessibilité. Les **21 problèmes P1** et **21 problèmes P2** identifiés, bien que moins critiques, nuisent au polish général et à la compétitivité de l'application.

### Priorités d'action recommandées

**Phase 1 (2-3 semaines)** : Corriger tous les P0
- Système de toasts/notifications global
- Gestion erreur API standardisée
- Focus trap dans les modales
- Timeout backend + écran offline explicite
- Contraste mode clair (tokens CSS)
- Validation formulaires côté client
- Player retry automatique
- Mode hors ligne basique

**Phase 2 (4-6 semaines)** : Traiter les P1
- Accessibilité clavier complète (carousels, focus auto)
- Skeleton loaders
- Empty states redesignés
- Settings dirty state tracking
- Raccourcis player documentés
- Responsive fixes (modales mobile)

**Phase 3 (ongoing)** : P2 et polish
- Footer légal
- Metadata OG
- Autocomplete recherche
- Préférence reduced-motion
- Tri/filtres avancés

L'effort total estimé pour atteindre un niveau de qualité production-ready est de **10-12 semaines développeur full-time**, en priorisant les P0 puis P1.

---

## Parcours live (22 août 2026)

**Session de test :** Mode démo sur https://client.popcornn.app  
**Utilisateur :** `demo@popcorn.local`  
**Version client :** v1.3.60  
**Date/heure :** 22 août 2026, ~5h27 UTC

Cette section documente les observations réalisées lors d'un parcours utilisateur complet sur l'application live, complétant l'audit statique du code. Les findings sont classés par sévérité et enrichissent les statistiques globales du rapport.

---

### P0 — Bugs bloquants découverts en live

#### P0-9 : Overlay de chargement ne se démonte jamais (bug critique)
**Pages affectées :** Toutes (dashboard, films, séries, downloads, settings, search, login, register)

**Problème :**  
L'overlay global "Chargement… / Préparation de l'application" (`#popcorn-loading-fallback`) reste visible de façon semi-transparente sur toutes les pages après le chargement initial. Il ne se cache jamais, créant un voile permanent sur tout le contenu.

**Code concerné :**
```astro
<!-- Layout.astro ligne 243-278 -->
<div id="popcorn-loading-fallback" class="fixed inset-0 z-[9999] ...">
  <h1 class="ds-loading-title">Chargement...</h1>
</div>
```

Le script de masquage (ligne 346-360) écoute `popcorn-app-ready` et `astro:page-load` mais ne se déclenche visiblement pas correctement.

**Impact :**  
**Le défaut live le plus dommageable.** Rend l'application quasiment inutilisable :
- Overlay noir semi-transparent sur tout le contenu
- Réduit la lisibilité à ~60%
- Spinner de chargement visible en permanence
- Donne l'impression que l'app n'a jamais fini de charger
- Utilisateur pense que l'app est cassée ou en erreur

**Recommandation urgente :**
1. Vérifier que `window.dispatchEvent(new Event('popcorn-app-ready'))` est bien appelé dans tous les composants racine (Navbar, ServerConnectionCheck)
2. Ajouter un timeout de sécurité : masquer l'overlay après 5s max si aucun événement reçu
3. Ajouter des logs de debug pour tracer les événements de montage
4. Test de régression obligatoire : vérifier que l'overlay disparaît sur toutes les routes

---

#### P0-10 : Hero CTAs pointent vers une recherche cassée
**Page affectée :** `/dashboard` (hero section)

**Problème :**  
Les deux boutons d'action primaires du hero (carte "Sintel") :
- Bouton "Lire" (lecture vidéo)
- Bouton "Détails" (page de détail)

...naviguent tous deux vers `/search?q=Sintel&type=movie&from=dashboard`, qui retourne **"Aucun résultat"**. Les deux boutons partagent la même destination incorrecte. Aucune lecture ni page de détail ne s'ouvre.

**Flux attendu :**
- "Lire" → `/player?id=...` ou `/torrents?...` puis player
- "Détails" → `/torrents?tmdbId=10606&type=movie` (page de détail média)

**Flux actuel :**
- "Lire" → `/search?q=Sintel&type=movie&from=dashboard` → "Aucun résultat"
- "Détails" → `/search?q=Sintel&type=movie&from=dashboard` → "Aucun résultat"

**Impact :**  
Fonction principale de l'app (lecture de contenu) complètement cassée depuis le hero du dashboard. Nouveau visiteur ne peut pas tester la lecture. Le contenu mis en avant n'est pas accessible.

**Recommandation :**
- Corriger le routage des CTAs hero pour pointer vers les bonnes URLs de détail/playback
- Vérifier que le contenu hero existe réellement dans la base démo
- Ajouter un fallback : si le contenu n'existe pas, masquer la carte hero plutôt que d'afficher des liens cassés

---

#### P0-11 : Recherche ne trouve pas le contenu affiché dans les rails
**Pages affectées :** `/search`, `/dashboard`

**Problème :**  
Le dashboard affiche des rails de contenu (ex: carte "Sintel" dans le hero, "Films populaires"). Mais une recherche pour "Sintel" dans `/search` retourne **"Aucun résultat"**. Le contenu visible dans l'UI n'est pas indexé dans la recherche.

**Test réalisé :**
1. Dashboard affiche "Sintel" en hero
2. Clic sur Search dans la navbar
3. Recherche "Sintel"
4. Résultat : "Aucun résultat pour Sintel"

**Impact :**  
Incohérence majeure : l'utilisateur voit du contenu mais ne peut pas le retrouver via la recherche. Donne l'impression que la recherche est cassée ou que le contenu n'existe pas vraiment.

**Recommandation :**
- Vérifier que le backend démo indexe bien les mêmes titres que ceux affichés dans les rails
- Ajouter un endpoint `/search/validate` pour tester la cohérence catalogue/search
- En démo, pré-remplir la search avec des exemples garantis de retourner des résultats

---

#### P0-12 : Page Settings complètement vide (body absent)
**Page affectée :** `/settings`

**Problème :**  
La page `/settings` s'affiche avec uniquement le heading de la page, mais le body est complètement vide. La sidebar de navigation n'affiche qu'un seul item : "Vue d'ensemble". Toutes les autres sections de settings sont inaccessibles depuis l'interface.

**Observation :**
- `/settings` → page vide
- Sidebar → seul "Vue d'ensemble" visible
- Impossible d'accéder à Server, Account, Indexers, etc. depuis l'UI
- Les URLs directes comme `/settings/server` fonctionnent si on les devine

**Impact :**  
Settings inaccessible via navigation normale. Utilisateur ne peut pas configurer l'app (serveur, compte, indexeurs, etc.) sans deviner les URLs. Bloque toute configuration initiale.

**Recommandation :**
- Vérifier le rendu du composant `SettingsContent` : pourquoi le body est vide ?
- Vérifier que la liste des sections settings est bien chargée/affichée dans la sidebar
- Ajouter un état de fallback : si aucune section n'est chargée, afficher un message d'erreur explicite
- Test de régression : `/settings` doit afficher au minimum 5-6 items dans la sidebar

---

### P1 — Problèmes majeurs découverts en live

#### P1-15 : Top-nav chevauche badge démo et pill serveur (1024-1280px)
**Pages affectées :** Toutes les pages authentifiées

**Problème :**  
Entre 1024px et 1280px de largeur d'écran, les items de navigation top (Films, Séries, Demandes) chevauchent visuellement le badge orange "Quitter le mode démo" et la pill de statut "Serveur". Le texte du badge devient "Dema…de démo" (tronqué).

**Observation visuelle :**
```
[Logo] [Films] [Séries] [Quitt...démo] [Serveur ●] [Search] [Avatar]
              └──────── overlap ────────┘
```

**Impact :**  
Navbar illisible sur les écrans laptop typiques (1024-1366px). Badge démo partiellement masqué. Utilisateur ne voit pas clairement qu'il est en mode démo.

**Recommandation :**
- Réduire le padding des tabs de navigation ou passer au hamburger dès 1024px au lieu de 1280px
- Réduire la taille du texte du badge démo (text-sm → text-xs)
- Tester sur MacBook Air 13" (1440x900) et Surface Go (1536x1024)

---

#### P1-16 : Images posters ne chargent jamais (rectangles navy vides)
**Pages affectées :** `/dashboard`, `/films`, `/series`, `/demandes`, `/search`

**Problème :**  
Aucune image poster ne charge sur l'ensemble de l'application. Toutes les cartes de contenu affichent des rectangles navy/bleu foncé vides à la place des posters. La page `/demandes` utilise des placeholders génériques (icône film). Aucune image de fond de carte (backdrop) ne charge non plus.

**Observation :**
- Cartes dashboard hero : rectangle vide navy
- Rails "Films populaires" : rectangles vides
- Résultats de recherche : rectangles vides
- Pas de spinner de chargement ni d'indication que l'image est en cours de fetch
- Pas de fallback alt text visible

**Impact :**  
Expérience visuelle catastrophique. Impossible de distinguer visuellement les contenus. Application ressemble à une maquette wireframe non finie. Impact majeur sur l'engagement utilisateur (attractivité zéro).

**Hypothèses :**
- Backend démo ne sert pas les URLs d'images TMDB
- CORS bloque les images TMDB (headers manquants)
- URLs d'images malformées ou chemins incorrects
- Aucun système de fallback vers placeholder SVG

**Recommandation :**
1. Vérifier que le backend démo retourne bien des URLs d'images valides (TMDB cdn)
2. Ajouter un système de fallback : si l'image ne charge pas après 5s, afficher un SVG placeholder avec le titre du média
3. Afficher un spinner subtil pendant le chargement initial
4. Ajouter `alt={title}` sur toutes les images pour accessibilité
5. Considérer un proxy backend pour les images TMDB si CORS pose problème

---

#### P1-17 : Modale "Ajouter magnet link" accepte submit vide sans validation
**Page affectée :** `/downloads` (bouton "Ajouter magnet link")

**Problème :**  
La modale de saisie de lien magnet permet de cliquer sur "Ajouter" avec un champ vide. La modale se ferme silencieusement sans message d'erreur ni validation. Aucun feedback que l'action a échoué.

**Flux observé :**
1. Clic "Ajouter magnet link"
2. Modale s'ouvre (champ vide)
3. Clic direct sur "Ajouter"
4. Modale se ferme instantanément
5. Aucun toast, aucune erreur affichée

**Impact :**  
Utilisateur confus : est-ce que le lien a été ajouté ? L'action a-t-elle fonctionné ? Violation des principes de validation formulaire (P0-8).

**Recommandation :**
- Ajouter validation regex du format magnet: `magnet:?xt=urn:btih:[a-fA-F0-9]{40}`
- Désactiver le bouton "Ajouter" tant que le champ est vide ou invalide
- Afficher une erreur inline : "Lien magnet invalide"
- Toast de confirmation après ajout réussi

---

#### P1-18 : Touche Escape dans modale Logs Session navigue vers /demandes
**Page affectée :** `/settings/librqbit` (modale "Logs Session")

**Problème :**  
Lors de l'ouverture de la modale "Logs Session" depuis `/settings/librqbit`, appuyer sur Escape ferme la modale **et** navigue vers `/demandes` au lieu de simplement fermer la modale. Hotkey leak : Escape est intercepté par un autre composant.

**Impact :**  
Navigation inattendue. Utilisateur perd son contexte (quitte les settings). Confirme le finding P0-4 (focus trap manquant) : Escape n'est pas capturé correctement par la modale.

**Recommandation :**
- Implémenter un focus trap complet dans toutes les modales
- Stopper la propagation de l'événement Escape dans le handler de fermeture modale
- `e.stopPropagation()` + `e.preventDefault()` dans le `onKeyDown` de la modale

---

#### P1-19 : Langue client français uniquement, pas de switcher in-app
**Pages affectées :** Toutes

**Problème :**  
L'application est entièrement en français sans possibilité de changer la langue depuis l'interface. Le site marketing `popcornn.app` sert du contenu anglais sur mobile UA, créant une incohérence. De plus, plusieurs tokens i18n restent en anglais dans le client :
- "Ajouter magnet link" (bouton downloads)
- "Logs Session" (modale librqbit)
- "Register" (titre page inscription)

**Observation :**
- Navbar : pas de sélecteur de langue visible (uniquement pour invités sur login)
- Une fois authentifié, impossible de changer de langue
- Settings → pas de section "Langue" ou "Préférences d'interface"

**Impact :**  
Utilisateurs anglophones ne peuvent pas utiliser l'app confortablement. Incohérence avec le site marketing (FR/EN mixé). Tokens EN résiduels cassent l'expérience francophone.

**Recommandation :**
- Ajouter un sélecteur de langue dans Settings → UI Preferences
- Afficher un mini-sélecteur (FR/EN) dans le footer ou la navbar user menu
- Traduire tous les tokens EN restants : audit complet des fichiers `fr.json` et `en.json`
- Harmoniser la langue entre `popcornn.app` (site) et `client.popcornn.app` (app)

---

#### P1-20 : Titres de page incohérents (branding confus)
**Pages affectées :** Multiples

**Problème :**  
Les titres de pages (`<title>`) utilisent un branding incohérent :
- Dashboard, Films, Séries : "Popcorn Client"
- Login, Register : "Popcorn Vercel" (fuite du nom d'hébergement)
- 404 : "Popcornn" (marque finale)

**Observation :**
```html
<!-- /dashboard -->
<title>Tableau de bord - Popcorn Client</title>

<!-- /login -->
<title>Connexion - Popcorn Vercel</title>

<!-- /404 -->
<title>404 - Page non trouvée - Popcornn</title>
```

**Impact :**  
Confusion sur le nom de la marque. "Popcorn Vercel" révèle l'infrastructure d'hébergement (peu professionnel). Incohérence des onglets navigateur.

**Recommandation :**
- Standardiser tous les titres sur "Popcornn" (marque finale)
- Pattern : `{Page Title} - Popcornn`
- Remplacer "Popcorn Client" et "Popcorn Vercel" partout
- Fichier à modifier : `src/layouts/Layout.astro` prop `title`

---

#### P1-21 : Arbre d'accessibilité retourne 0 références interactives
**Pages affectées :** Toutes

**Problème :**  
Lors de l'inspection avec les DevTools d'accessibilité, l'arbre d'accessibilité (Accessibility Tree) du client retourne 0 références d'éléments interactifs sur les pages testées. Cela indique une sur-utilisation d'éléments custom/non-sémantiques (`<div>`, `<span>` avec handlers onClick) au lieu d'éléments natifs (`<button>`, `<a>`, `<input>`).

**Impact :**  
Lecteurs d'écran ne peuvent pas identifier les éléments interactifs. Navigation vocale impossible. Violation WCAG niveau A (le plus basique). Application complètement inaccessible aux utilisateurs non-voyants ou malvoyants.

**Recommandation urgente :**
1. Audit complet avec NVDA/JAWS/VoiceOver pour identifier tous les éléments non accessibles
2. Remplacer tous les `<div onClick>` par des `<button>`
3. Assurer que tous les liens ont `href` et sont des `<a>` vrais
4. Ajouter `role`, `aria-label`, `aria-labelledby` sur les composants custom
5. Test automatisé : ajouter axe-core ou Pa11y dans le pipeline CI pour détecter les violations

---

### P2 — Améliorations suggérées (découvertes live)

#### P2-19 : Contraste gris-sur-noir insuffisant (sous-titres/métadonnées)
**Pages affectées :** Toutes les cartes de contenu

**Problème :**  
Les textes secondaires (année, durée, sous-titres de cartes) utilisent un gris très clair sur fond presque noir, créant un ratio de contraste faible (~3:1). Difficile à lire, surtout sur écrans bas de gamme ou en lumière ambiante.

**Recommandation :**  
Augmenter le contraste des textes secondaires à 4.5:1 minimum (WCAG AA). Utiliser `--ds-text-secondary` avec une opacité de 0.75 au lieu de 0.65.

---

#### P2-20 : Boutons icône header sans tooltips (~40px)
**Pages affectées :** Navbar, headers de pages

**Problème :**  
Les boutons icône only (Search, Downloads, Settings) font ~40px de côté sans aucun tooltip au survol. Utilisateur desktop ne sait pas quelle action le bouton déclenche avant de cliquer.

**Recommandation :**  
Ajouter `title="Recherche"` sur tous les boutons icône pour afficher un tooltip natif. Alternative : implémenter un système de tooltip custom design-system.

---

#### P2-21 : Drawer mobile translucide superposé au hero
**Pages affectées :** Mobile (navbar hamburger)

**Problème :**  
Le menu hamburger mobile s'affiche avec un fond semi-transparent, laissant voir le contenu hero en dessous. Lisibilité réduite, notamment si le hero a des couleurs vives.

**Recommandation :**  
Ajouter un backdrop opaque noir/85% derrière le drawer mobile pour masquer le contenu de la page.

---

### Observations supplémentaires (non classées en findings)

#### Wizard d'onboarding (profil non authentifié)
**Observation positive :**  
L'application affiche un wizard d'onboarding en 9 étapes pour les nouveaux utilisateurs non authentifiés :
1. Connexion (login ou Quick Connect)
2. Configuration serveur
3. Choix de langue
4. Bienvenue
5. Configuration indexeurs
6. Configuration TMDB
7. Dossiers de téléchargement
8. Synchronisation
9. Terminé

**Features observées :**
- QR code pour pairing mobile
- Code à 6 caractères pour connexion rapide
- UX guidée pas à pas (bon point)

**Recommandation :**  
Conserver ce flow, mais s'assurer qu'il fonctionne correctement avec un vrai backend (pas testé en profondeur en démo).

---

#### Page /history retourne une 404 stylée
La route `/history` retourne la page 404 custom avec animations (bon point : pas d'erreur serveur brute). Indiquer que cette feature est en développement.

---

#### Pas d'erreur 5xx observée
Aucune erreur serveur 500/502/503 observée durant le test. Stabilité apparente de l'API démo (bon point).

---

#### Fonctionnalités non testables en démo
Les fonctionnalités suivantes n'ont pas pu être testées en profondeur faute d'un backend complet avec compte réel :
- Lecture vidéo (player HLS)
- Téléchargement de torrents
- Configuration indexeurs fonctionnelle
- Synchronisation cloud
- Gestion bibliothèque approfondie

**Note :** Ces flows nécessitent un audit dédié avec un environnement de test complet.

---

### Synthèse du parcours live

Le test live révèle **4 bugs P0 critiques** non détectables par audit statique du code :
1. Overlay de chargement permanent (le plus grave)
2. Hero CTAs cassées (recherche au lieu de playback/détail)
3. Recherche incohérente avec le contenu affiché
4. Page Settings vide et inaccessible

Ces bugs rendent l'application **quasiment inutilisable** pour un nouveau visiteur :
- Impossible de regarder du contenu (hero cassé)
- Impossible de rechercher du contenu (search vide)
- Impossible de configurer l'app (settings vide)
- Impossible de lire l'interface (overlay permanent)

**Priorité absolue :** Corriger ces 4 P0 live avant toute autre intervention. Sans ces corrections, l'application ne peut pas être déployée en production ni présentée à des utilisateurs finaux.

---

**Fin du parcours live**
