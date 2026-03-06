# Audit : navigation télécommande sur le lecteur vidéo

**Date :** 2025-02  
**Périmètre :** Lecteur unifié (HLS, Direct, Lucie) en mode TV (WebOS, Android TV, Apple TV).

---

## 1. Détection TV

- **Source :** `lib/utils/device-detection.ts` → `isTVPlatform()`.
- **Plateformes :** Android TV, WebOS (LG), Apple TV (tvOS).
- **Usage :** `useTVPlayerNavigation` utilise `isTVPlatform()` pour activer la navigation télécommande et le focus visuel (ring).

---

## 2. Structure du focus

### 2.1 Zones focusables

| Zone | Élément | `tabIndex` | Géré par |
|------|--------|------------|----------|
| **Barre de progression** | `div` avec `ref={progressBarRef}` | `0` | `focusedOnProgress` + focus DOM |
| **Bouton Retour** | Premier bouton (si `onClose`) | natif | `focusedControlIndex === 0` |
| **Bouton Play/Pause** | | natif | `focusedControlIndex === 1` (si Retour) ou `0` |
| **Bouton Mute** | | natif | `focusedControlIndex === 2` ou `1` |
| **Bouton Plein écran** | | natif | `focusedControlIndex === 3` ou `2` |

**Contrôles sans focus ring TV (non inclus dans `controls` du hook) :**

- Bouton « Redémarrer depuis le début » (`onRestart`)
- Bouton « Épisode suivant » (`onPlayNextEpisode`)
- Bouton Sous-titres
- Bouton Qualité (Settings)

Seuls **Retour, Play/Pause, Mute, Plein écran** font partie du tableau `controls` et du `focusedControlIndex`. Les autres restent focusables au clavier (ordre tab) mais n’ont pas de ring ni de logique flèche gauche/droite dédiée.

### 2.2 Focus initial

- **Au montage (TV) :** `setShowControls(true)` puis effet qui met `focusedOnProgress = true` et `progressBarRef.current.focus()` après 100 ms.
- **Résultat :** le focus logique et le focus DOM démarrent sur la **barre de progression**.

### 2.3 Masquage des contrôles

- Timeout **5 s** quand `showControls === true` : les contrôles se cachent et `focusedOnProgress` est remis à `false`.
- Réaffichage : toute touche directionnelle ou Retour/OK réaffiche les contrôles ; un effet remet à nouveau le focus sur la barre après affichage.

---

## 3. Touches et actions

### 3.1 Touches globales (hors input/textarea)

| Touche(s) | Code(s) | Action |
|-----------|--------|--------|
| **Retour** | Escape, Backspace, 461 (webOS), Back, BrowserBack, GoBack | Si contrôles masqués → afficher contrôles (focus Play) ; sinon → `onClose()` ou plein écran |
| **Play/Pause (média)** | 415, 19 | `onPlayPause()` |
| **Reculer (média)** | 412 | Seek gauche + accélération |
| **Avancer (média)** | 417 | Seek droite + accélération |

### 3.2 Quand les contrôles sont visibles

| Touche | Sur barre de progression | Sur boutons (Retour, Play, Mute, Plein écran) |
|--------|---------------------------|------------------------------------------------|
| **Espace / Entrée** | Play/Pause | Action du bouton focusé |
| **Flèche gauche** | Seek gauche (avec accélération) | Bouton précédent, ou seek gauche si déjà sur premier |
| **Flèche droite** | Seek droite (avec accélération) | Bouton suivant, ou seek droite si déjà sur dernier |
| **Flèche haut** | Volume + | Passe sur la **barre de progression** (focus DOM + `focusedOnProgress = true`) |
| **Flèche bas** | — | Si sur barre → passe sur **Play** (index 1 ou 0) ; si sur Retour → passe sur barre ; sinon volume − |

### 3.3 Raccourcis clavier (souris/clavier)

- **M / m** : Mute  
- **F / f** : Plein écran  

### 3.4 WebOS

- Événement **`webosback`** : même comportement que Retour (fermeture ou affichage contrôles).

---

## 4. Seek avec accélération

- **Hook :** `useSeekStepAcceleration`.
- **Pas :** `[10, 30, 60]` secondes.
- **Règles :**  
  - 1er appui (ou changement de direction) → **10 s**  
  - Appuis répétés même direction : après **3** répétitions → **30 s**, après **6** → **60 s**  
- **Enregistrement :** `recordKeyDown('left'|'right')` au keydown, `recordKeyUp()` au keyup (remise à zéro du compteur).
- **Utilisation :** sur barre (gauche/droite), sur boutons quand on est au bord (premier/dernier), et pour les codes 412/417 (touches média).

---

## 5. Interception des flèches (barre de progression)

- **Problème évité :** quand le focus DOM est sur la barre (`tabIndex={0}`), le navigateur pourrait déplacer le focus (gauche/droite) avant que le handler ne fasse le seek.
- **Solution :** `keydown` écouté en **phase capture** sur `window` (`addEventListener(..., true)`), avec `preventDefault()` dans les cas ArrowLeft/ArrowRight (et autres selon le contexte). Le seek est donc bien pris en charge et le focus ne bouge pas.

---

## 6. Synchro focus logique / DOM

- **Barre :** `onFocus` / `onBlur` sur la barre appellent `setFocusedOnProgress?.(true/false)` pour garder `focusedOnProgress` aligné avec le focus réel.
- **Boutons :** pas de focus DOM explicite lors du changement de `focusedControlIndex` (flèches) ; seul le **ring visuel** (`getFocusClass`) reflète le focus logique. L’utilisateur peut donc avoir le focus DOM sur la barre alors que le ring est sur un bouton après une flèche bas (état cohérent après la prochaine action).

---

## 7. Points forts

- Focus initial sur la barre de progression en TV.
- Navigation barre ↔ boutons cohérente avec le layout (haut/bas = barre, bas = boutons).
- Seek avec pas progressifs (10 → 30 → 60 s) et touches média 412/417 gérées.
- Phase capture pour les flèches, évitant le déplacement de focus indésirable sur la barre.
- Gestion webOS (Retour, 461, `webosback`) et premier appui « Retour » qui affiche les contrôles au lieu de quitter.
- Timeout 5 s pour masquer les contrôles en TV.

---

## 8. Points d’attention / améliorations possibles

1. **Boutons hors focus ring**  
   Restart, Épisode suivant, Sous-titres, Qualité ne sont pas dans `controls` ni dans `focusedControlIndex`. En TV, ils restent atteignables par tab mais pas par flèches gauche/droite. Souhait ou non de les inclure dans la boucle focus (et étendre `controls` / les indices) ?

2. **Focus DOM après flèche bas depuis la barre**  
   On met `focusedOnProgress = false` et `focusedControlIndex = 1` (ou 0) mais on ne fait pas `button.focus()`. Le ring est sur Play alors que le focus DOM peut encore être sur la barre. Option : appeler `focus()` sur le bouton cible (nécessiterait des refs sur les boutons ou un `querySelector` ciblé).

3. **Sous-titres / Qualité**  
   Pas de raccourci télécommande dédié (ex. touche dédiée sous-titres). Actuellement uniquement via focus + Entrée si ces boutons étaient ajoutés au focus ring.

4. **Volume en TV**  
   Volume +/- est géré par flèche haut/bas quand on n’est pas sur la barre ou dans le cas « contrôles masqués ». Sur certains appareils, les touches volume matérielles peuvent ne pas être exposées en keydown ; à valider sur chaque plateforme.

5. **Accessibilité**  
   La barre a `role="slider"`, `aria-valuenow/min/max`, `aria-label`. Les boutons ont des `aria-label` / `title`. Pas de `aria-live` pour les changements de position ou de temps affiché.

---

## 9. Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `player-shared/hooks/useTVPlayerNavigation.ts` | Gestion des touches, focus logique, timeouts, focus initial barre |
| `player-shared/hooks/useSeekStepAcceleration.ts` | Pas de seek 10/30/60 s et répétition |
| `player-shared/components/VideoControls.tsx` | Barre (ref, tabIndex, onFocus/onBlur), ring (`getFocusClass`, `getProgressFocusClass`), boutons |
| `lib/utils/device-detection.ts` | `isTVPlatform()`, WebOS / Android TV / Apple TV |

---

## 10. Résumé

La navigation télécommande est cohérente pour **barre de progression** et **Retour / Play / Mute / Plein écran** : focus initial sur la barre, flèches gauche/droite pour seek (avec accélération), flèches haut/bas pour barre ↔ boutons et volume, touches média et Retour gérées. Les écarts principaux sont le focus DOM non synchronisé explicitement sur les boutons après une flèche bas, et l’absence des boutons Restart / Épisode suivant / Sous-titres / Qualité dans le cycle de focus TV.
