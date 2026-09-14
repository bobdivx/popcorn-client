# Guide de Test — Mode Conduite Tesla

**Date:** 2026-09-14  
**Branche:** `cursor/tesla-car-smooth-playback-6ef6`  
**Objectif:** Valider système complet de playback Tesla avec détection auto Park/Drive et moteurs multiples.

---

## Nouveautés de cette PR

### 🆕 Probe Complet `/car/probe` (NOUVEAU!)
- **20+ tests systématiques** de TOUTES les APIs navigateur
- Détermine empiriquement ce qui est bloqué en Drive vs Park
- Tests couverts:
  - Video Element (playback, drawImage→canvas, codecs)
  - Audio Element + AudioContext
  - Media Source Extensions (MSE)
  - WebCodecs (VideoDecoder, AudioDecoder)
  - Canvas (2D, WebGL, OffscreenCanvas, createImageBitmap)
  - requestAnimationFrame rate
  - Autoplay policies (muted/unmuted)
  - Fullscreen & Picture-in-Picture
  - WebSocket + binary throughput
- **Rapport visuel:**
  - Mode détecté (Park/Drive/Unknown)
  - Résultats color-coded (✅❌⚠️)
  - Confidence scores (0-100%)
  - **Moteur recommandé** (mjpeg / native-video)
  - Export JSON brut

### 🆕 Détection Auto Park/Drive
- Probe `<video>` pour détecter si Tesla bloque playback (Drive) ou non (Park)
- **drawImage(video)→canvas** test (black frame = Drive blocks extraction)
- Monitoring continu toutes les 10s
- Cache 30s dans localStorage

### 🆕 Moteurs Multiples
- **MJPEG** (`<img>` + `<audio>`): Drive-safe, qualité optimisée (480p@12fps)
- **Vidéo native** (`<video>` MP4): Park only, haute qualité (720p@24fps)

### 🆕 Switcher Auto/Manuel
- **Auto** (défaut): détection → choix optimal automatique
- **Manuel**: force un moteur pour A/B testing
- UI dans dock contrôles (bouton « Type »)

### ✅ Optimisations Qualité (précédent)
- Paramètres MJPEG: `max_height=480`, `max_fps=12`, `quality=3`
- Paramètres audio: `bitrate=96k`
- Bande passante réduite ~50-70%

---

## Prérequis

### Matériel

- **Option A:** Vraie Tesla avec navigateur (Modèle 3/Y/S/X 2019+)
- **Option B:** Desktop Chrome/Edge avec simulation réseau lent

### Environnement

- **Serveur Popcornn** opérationnel (local ou remote avec HTTPS si Tesla réelle)
- **Fichiers test:** Au moins 2-3 vidéos dans la bibliothèque (idéalement : 1080p H.264 + AAC, 720p, et une avec HEVC/DTS)

---

## Test 0: Probe Complet (NOUVEAU!)

**But:** Obtenir un diagnostic empirique complet des capacités navigateur Tesla.

### Steps

1. **Desktop Chrome (baseline):**
   ```bash
   npm run dev
   # Ouvrir http://localhost:4321/car/probe
   ```
   - Probe auto-run (10-15s)
   - **Observer résultats:**
     - Video playback: Pass (Chrome desktop pas de restriction)
     - Audio playback: Pass
     - Canvas 2D/WebGL: Pass
     - MSE: Pass (MediaSource disponible)
     - WebCodecs: Pass ou Fail (selon version Chrome)
   - **Summary:**
     - Mode détecté: "unknown" ou "park" (Chrome n'est pas Tesla)
     - Moteur recommandé: "native-video"

2. **Tesla en Parking:**
   - Ouvrir `/car/probe` dans navigateur Tesla
   - Probe auto-run (10-15s)
   - **Observer résultats:**
     - Video playback: **Pass** (currentTime > 0)
     - drawImage(video)→canvas: **Pass** (pixels non-noirs)
     - Audio playback: Pass
     - Canvas/WebGL: Pass
     - MSE: Pass ou Fail (firmware-dependent)
     - WebCodecs: Pass ou Fail (Chromium 94+ requis)
   - **Summary:**
     - Mode détecté: **Park**
     - Video bloqué: Non ✅
     - Audio fonctionne: Oui ✅
     - Canvas disponible: Oui ✅
     - Moteur recommandé: **native-video**

3. **Tesla en Drive:**
   - Mettre Tesla en Drive (D) — pied sur frein si garage
   - Ouvrir `/car/probe` (ou recharger page)
   - Probe auto-run (10-15s)
   - **Observer résultats:**
     - Video playback: **Fail** (currentTime=0 malgré play())
     - drawImage(video)→canvas: **Fail** (black frame ou timeout)
     - Audio playback: **Pass** (audio NOT blocked ✅)
     - Canvas/WebGL: Pass
     - MSE: Pass ou Fail (firmware-dependent)
     - WebCodecs: Pass ou Fail
   - **Summary:**
     - Mode détecté: **Drive**
     - Video bloqué: **Oui ❌**
     - Audio fonctionne: **Oui ✅**
     - Canvas disponible: Oui ✅
     - Moteur recommandé: **MJPEG**

4. **Exporter résultats:**
   - Ouvrir section "Données brutes (JSON)" (détails)
   - Copier JSON complet
   - Partager si comportement inattendu

**Critères de succès:**
- ✅ Probe identifie Drive (video fail) vs Park (video pass)
- ✅ Confirme audio toujours OK en Drive (workaround safe)
- ✅ Confirme Canvas/WebGL disponibles en Drive
- ✅ Recommande MJPEG en Drive, native-video en Park
- ✅ Pas d'erreur console, pas de hang

**Utilité:**
- Empirical data > folklore
- Identifie si MSE/WebCodecs bloqués (info pour futures optimisations)
- Valide que seul `<video>` est bloqué, pas autres APIs

---

## Test 1: Détection Park/Drive (nouveau)

**But:** Valider que le système détecte correctement le mode Tesla.

### Steps

1. **Desktop Chrome:**
   ```bash
   npm run dev
   # Ouvrir http://localhost:4321/car?car=1
   ```
   - Mode détecté: « Unknown » ou « Park » (Chrome n'est pas Tesla)
   - Moteur actif (Auto): « Vidéo native »

2. **Tesla en Parking:**
   - Ouvrir `/car` dans navigateur Tesla
   - Sélectionner un média
   - **Observer coin haut-gauche du menu Type:**
     - « Mode Tesla: **Park** »
     - Moteur actif: « **Vidéo native** » (badge ACTIF)
   - Playback: `<video>` MP4 standard démarre

3. **Tesla en Drive:**
   - Mettre en Drive (D) — pied sur frein si garage
   - **Attendre max 10-15 secondes** (re-détection)
   - **Observer:**
     - Badge change → « Mode Tesla: **Drive** »
     - Moteur bascule → « **MJPEG + Audio** » (badge ACTIF)
     - `<video>` disparaît, `<img>` MJPEG + `<audio>` MP3 démarrent
   - **Vérifier Network tab:**
     - Requête `.../car.mjpeg?...&max_height=480&max_fps=12&quality=3`
     - Requête `.../car.audio?...&bitrate=96k`

4. **Drive → Park (round-trip):**
   - Remettre en Park (P)
   - Attendre ~10s
   - Badge → « Park », moteur → « Vidéo native »
   - Playback rebascule vers `<video>` MP4

**Critères de succès:**
- ✅ Détection Park/Drive fonctionne dans ~10-15s max
- ✅ Auto mode bascule automatiquement les moteurs
- ✅ Pas d'erreur console, pas de playback freeze

---

## Test 2: Mode Manuel (A/B Testing)

**But:** Valider que Mathieu peut forcer un moteur pour comparer.

### Steps

1. **Ouvrir switcher:**
   - Cliquer bouton « Type » (engrenage) dans dock
   - Menu popup apparaît

2. **Toggle « Manuel »:**
   - Cliquer bouton « Manuel » (top menu)
   - Liste moteurs devient active (non-grisée)

3. **Forcer MJPEG en Park:**
   - Tesla en Park (P)
   - Sélectionner moteur « MJPEG + Audio »
   - Fermer menu
   - **Observer:**
     - Badge « ACTIF » sur MJPEG
     - Playback: `<img>` + `<audio>` même en Park
     - Qualité: 480p@12fps (pixelisée vs native)

4. **Forcer Vidéo native en Drive:**
   - Tesla en Drive (D)
   - Ouvrir menu → Manuel → « Vidéo native »
   - **Observer:**
     - `<video>` tente de démarrer
     - Tesla bloque immédiatement (pause forcé)
     - Écran noir ou freeze
   - **Confirme:** que MJPEG est nécessaire en Drive

5. **Retour Auto:**
   - Ouvrir menu → toggle « Auto »
   - Système re-détecte → revient à MJPEG en Drive

**Critères de succès:**
- ✅ Mode Manuel override fonctionne
- ✅ MJPEG fonctionne en Park (qualité dégradée mais watchable)
- ✅ Vidéo native bloquée en Drive (confirme restriction Tesla)
- ✅ Retour Auto restaure comportement optimal

---

## Test 3: Baseline vs After (qualité/fluidité)

**But:** Comparer fluidité avant/après optimisations qualité.

### Baseline (Before)

1. **Checkout branche précédente:**
   ```bash
   git checkout dev
   npm run build  # ou astro build
   ```

2. **Ouvrir `/car` dans Tesla (ou Chrome `?car=1`):**
   - URL: `https://client.popcornn.app/car` (ou `http://localhost:4321/car?car=1`)
   - Sélectionner un média de test (ex: film 1080p H.264)

3. **Mode Parking (stationary):**
   - Vérifier: `<video>` MP4 lecture démarre
   - Noter: Qualité image, fluidité

4. **Mode Conduite (simulé ou réel):**
   - Chrome desktop: DevTools → Network → Throttling → "Slow 3G"
   - Tesla réelle: Rouler en D (pied sur frein si garage)
   - **Observer:**
     - `<video>` disparaît (normal)
     - `<img>` MJPEG + `<audio>` MP3 démarrent
   - **Capturer:**
     - Network tab: taille transfert, framerate, URLs
     - Screenshot: qualité image
     - Chronométrer: durée avant stutter / saccades

5. **Baseline Metrics:**
   - Framerate MJPEG observé: ~__ fps
   - Résolution: ~__p (inspecter URL ou img dimensions)
   - Bande passante: ~__ kbps (Network tab)
   - Stutter commence après: ~__ secondes
   - Audio desync: oui / non

### After (Après Optimisations)

### After (Après Optimisations)

**But:** Valider que params qualité réduisent bande passante et stutter.

### Steps

1. **Checkout branche optimisée:**
   ```bash
   git checkout cursor/tesla-car-smooth-playback-6ef6
   npm run build
   ```

2. **Vérifier params dans URLs:**
   - Ouvrir `/car`, sélectionner média
   - Basculer en mode conduite (Slow 3G)
   - **Network tab → chercher requête `car.mjpeg`:**
     ```
     .../car.mjpeg?seek=0.000&max_height=480&max_fps=12&quality=3&info_hash=...
     ```
   - **Network tab → chercher requête `car.audio`:**
     ```
     .../car.audio?seek=0.000&bitrate=96k&info_hash=...
     ```
   - ✅ Si params présents → client envoie correctement
   - ❌ Si absents → build échoué, recompiler

3. **Mode Conduite (même throttling):**
   - **Observer:**
     - Image MJPEG plus pixelisée (480p vs 1080p) — **normal**
     - Framerate plus bas (12fps vs 24-30fps) — **normal**
     - Fluidité améliorée ? Moins de saccades ?
   - **Capturer:**
     - Network tab: taille transfert réduite (~50-70% moins)
     - Screenshot: qualité dégradée mais **regardable**
     - Chronométrer: stutter retardé ou absent

4. **After Metrics:**
   - Framerate MJPEG: ~12 fps (attendu)
   - Résolution: ~480p (attendu)
   - Bande passante: ~__ kbps (devrait être ~500-800 kbps vs ~1500-3000 avant)
   - Stutter: amélioré / inchangé / pire
   - Audio desync: inchangé (doit rester synchro)

---

## Test 4: Regressions (Ne Pas Casser l'Existant)

**But:** Garantir que le workaround `<img>` MJPEG + `<audio>` MP3 fonctionne toujours.

### Checklist

- [ ] **Mode Parking — `<video>` MP4 intact:**
  - Video démarre, audio synchro, contrôles fonctionnels
  - Pas d'erreur console

- [ ] **Mode Conduite — `<img>` + `<audio>` actifs:**
  - `<video>` caché (normal)
  - `<img src="...car.mjpeg">` visible avec stream
  - `<audio src="...car.audio">` lecture active
  - Badge "Conduite · vidéo + audio" affiché

- [ ] **Seek (avance/recule 30s):**
  - MJPEG + audio resynchro correctement
  - URL mise à jour avec nouveau `?seek=X`

- [ ] **Retour Parking depuis Conduite:**
  - Bouton "Parking" repasse en `<video>` MP4
  - Position reprise correctement

- [ ] **Erreur serveur (params ignorés):**
  - Si serveur ne supporte pas `max_height`/`max_fps` → ignore silencieusement
  - Client doit recevoir stream pleine résolution (fallback gracieux)
  - Pas d'erreur console côté client

- [ ] **Audio/video sync maintenu:**
  - `driveAnchor` + `audio.currentTime` math toujours correcte
  - Pas de drift > 1 seconde après 5 minutes

---

## Test 5: Edge Cases

### 5a. Serveur ne Supporte Pas les Nouveaux Params

**Scénario:** Serveur Popcornn ancien / manquant implémentation `max_height` etc.

- **Comportement attendu:**
  - Client envoie URLs avec params
  - Serveur ignore, retourne MJPEG/MP3 pleine qualité (comme avant)
  - Pas d'erreur, pas de regression
  - Stutter non amélioré, mais **pas pire**

- **Test:**
  - Mock un serveur qui sert MJPEG fixe (ignorer query params)
  - Vérifier: playback fonctionne, pas d'exception

### 5b. Réseau Très Lent (2G)

- Chrome DevTools → "Slow 2G" (50 kbps)
- **Attendu:** Même à 480p@12fps, peut encore buffer
- **Acceptable:** Image freeze, mais audio continue
- **Inacceptable:** Crash, erreur fatale

### 5c. Media HEVC / DTS

- Fichier source HEVC + DTS (non H.264/AAC)
- **Serveur doit:**
  - Transcoder vers H.264 + AAC pour MJPEG/MP3
  - Ou fallback mode parking (remux MP4)
- **Client:**
  - Affiche message "Conversion..." si transcode en cours
  - Ou démarre lecture quand prêt

---

## Test 6: Validation UI/UX

**But:** Vérifier que l'interface est utilisable et intuitive dans Tesla.

### Steps

1. **Switcher Type (Auto/Manuel):**
   - Bouton « Type » visible et cliquable
   - Menu popup s'ouvre sans lag
   - Toggle Auto/Manuel fonctionne
   - Badge « ACTIF » clair

2. **Labels français:**
   - « Mode Tesla: Park / Drive / Inconnu »
   - « MJPEG + Audio », « Vidéo native »
   - « Compatible conduite: Oui / Non »
   - Pas de texte anglais résiduel

3. **Responsive:**
   - Menu ne dépasse pas viewport Tesla
   - Texte lisible (taille police adaptée)
   - Contrôles tactiles assez grands (min 44×44px)

4. **Performance UI:**
   - Changement moteur instantané (< 500ms)
   - Pas de freeze UI pendant détection Park/Drive
   - Badge mode mis à jour dans ~10s max

**Critères de succès:**
- ✅ UI cohérente avec Tesla Theater aesthetic
- ✅ Labels français clairs
- ✅ Switcher fonctionne sans friction
- ✅ Pas de regression UX vs mode actuel

---

## Test 7: Probe Tool Validation (anciennement Test 5)

**But:** Vérifier que `/car/probe` aide à diagnostiquer — MAINTENANT BEAUCOUP PLUS COMPLET.

### Steps

1. **Ouvrir probe:**
   - URL: `https://client.popcornn.app/car/probe` (ou local `?car=1`)
   - Probe auto-run (10-15s)

2. **Vérifier catégories:**
   - **Environment:** User-Agent, isTeslaBrowser, isCarPlayerMode, Secure Context
   - **Video:** HTMLVideoElement, codecs (H.264, AAC, HLS, VP8, VP9, HEVC), playback test, drawImage test
   - **Audio:** Audio playback, AudioContext
   - **MSE:** MediaSource available, SourceBuffer attach
   - **WebCodecs:** VideoDecoder, AudioDecoder, isConfigSupported(AVC)
   - **Canvas:** Canvas 2D, WebGL, OffscreenCanvas, createImageBitmap
   - **Animation:** requestAnimationFrame rate
   - **Autoplay:** Autoplay muted, Autoplay unmuted
   - **APIs:** Fullscreen API, Picture-in-Picture
   - **Network:** WebSocket, WebSocket binary throughput

3. **Vérifier Summary box:**
   - Mode détecté: Park / Drive / Unknown
   - Video bloqué: Oui/Non
   - Audio fonctionne: Oui/Non
   - Canvas disponible: Oui/Non
   - MSE disponible: Oui/Non
   - WebCodecs disponible: Oui/Non
   - **Moteur recommandé:** MJPEG ou native-video

4. **Comparer Park vs Drive:**
   - **Park:**
     - Video playback: ✅ Pass
     - drawImage(video): ✅ Pass
     - Moteur recommandé: native-video
   - **Drive:**
     - Video playback: ❌ Fail
     - drawImage(video): ❌ Fail
     - Audio playback: ✅ Pass (important!)
     - Moteur recommandé: MJPEG

5. **Export JSON:**
   - Section "Données brutes (JSON)" expandable
   - JSON complet copié sans erreur
   - Peut être partagé pour debugging

**Critères de succès:**
- ✅ Probe détecte correctement Park/Drive (via video tests)
- ✅ Confirme audio PAS bloqué en Drive (workaround safe)
- ✅ Identifie si MSE/WebCodecs bloqués (info futures optimisations)
- ✅ Recommandation moteur cohérente avec détection
- ✅ Pas d'erreur console, pas de hang
- ✅ UI claire, color-coded, confidence scores affichés

**Utilité:**
- **Empirical data > folklore**
- Mathieu peut voir EXACTEMENT ce qui est bloqué
- Feed la logique de sélection moteur
- Debug futures issues Tesla firmware

---

## Acceptance Criteria

**Pour merger la PR, tous ces points doivent être ✅:**

1. **Fonctionnel:**
   - [ ] **Probe `/car/probe`:** Auto-run, 20+ tests, summary clair
   - [ ] **Détection Park/Drive:** Fonctionne dans ~10-15s max
   - [ ] **Mode Auto:** Bascule automatiquement moteurs selon détection
   - [ ] **Mode Manuel:** Switcher fonctionnel pour A/B testing
   - [ ] Mode Parking `<video>` intact
   - [ ] Mode Conduite `<img>` MJPEG + `<audio>` MP3 fonctionnent
   - [ ] Params qualité appliqués dans URLs (`max_height=480`, `max_fps=12`, etc.)

2. **Performance:**
   - [ ] Bande passante réduite ~50-70% en mode conduite
   - [ ] Stutter amélioré OU égal (jamais pire)
   - [ ] Audio/video sync maintenu (< 1s drift)

3. **Regressions:**
   - [ ] Pas d'erreur console nouvelle
   - [ ] Fallback gracieux si serveur ignore params
   - [ ] Seek, retour parking, changement média OK
   - [ ] Pas de hang/freeze UI

4. **UI/UX:**
   - [ ] Switcher Type visible, cliquable, responsive
   - [ ] Labels français corrects
   - [ ] Badge mode Tesla mis à jour ~10s
   - [ ] Probe UI claire, color-coded, confidence scores

5. **Documentation:**
   - [ ] `docs/TESLA_CAR_BROWSER.md` décrit architecture + workaround
   - [ ] `docs/TESLA_CAR_TESTING.md` (ce fichier) guide repro complet
   - [ ] PR body résume changements + probe tool

---

## Reporting Issues

Si test échoue, capturer:

1. **Probe Results:**
   - Screenshot `/car/probe` complet
   - Export JSON brut (section Données brutes)
   - Noter mode détecté vs mode réel

2. **Navigateur:**
   - User-Agent complet
   - Version firmware Tesla (Settings → Software)

3. **Network:**
   - Chrome DevTools → Network → Export HAR (ou screenshot filtered `car.mjpeg` / `car.audio`)
   - Throttling mode utilisé

4. **Symptômes:**
   - Stutter: après combien de secondes ?
   - Audio desync: de combien (secondes) ?
   - Image freeze: bloque ou slow framerate ?
   - Erreur console: copier trace complète

5. **Média test:**
   - Résolution source (ex: 1080p)
   - Codec source (H.264 / HEVC / ?)
   - Durée (ex: 1h30)

6. **Mode/Moteur:**
   - Mode sélectionné: Auto ou Manuel ?
   - Moteur actif: MJPEG ou native-video ?
   - Détection Park/Drive correcte ?

---

## Next Steps (Post-PR)

Si cette PR améliore significativement:
- Mesurer impact réel sur Tesla en condition production (Mathieu test)
- Analyser probe results Drive mode → identifier autres APIs potentiellement bloquées
- Si stutter persiste, explorer:
  - **WebCodecs + `<canvas>`** (si probe confirme VideoDecoder disponible)
  - **JSMpeg + WebSocket** (plus complexe, mais latence plus basse)
  - **ABR ladder côté serveur** (3 variantes qualité: 360p@10fps, 480p@12fps, 720p@15fps)
  - **HLS/DASH** pour native `<video>` en Park (si MSE disponible)

Si aucune amélioration:
- Documenter que le problème est probablement serveur-side (transcoding CPU bound, latence réseau)
- Ou hardware Tesla (CPU decode MJPEG insuffisant)
- Recommander: baisser encore à 360p@10fps, ou attendre update firmware Tesla

**Priorité:** probe empirique d'abord → décisions basées sur data, pas folklore 🎯
