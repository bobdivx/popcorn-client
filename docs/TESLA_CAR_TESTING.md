# Guide de Test — Mode Conduite Tesla

**Date:** 2026-09-14  
**Branche:** `cursor/tesla-car-smooth-playback-6ef6`  
**Objectif:** Valider que les optimisations de qualité MJPEG/MP3 améliorent la fluidité en conduite **sans casser le workaround existant**.

---

## Prérequis

### Matériel

- **Option A:** Vraie Tesla avec navigateur (Modèle 3/Y/S/X 2019+)
- **Option B:** Desktop Chrome/Edge avec simulation réseau lent

### Environnement

- **Serveur Popcornn** opérationnel (local ou remote avec HTTPS si Tesla réelle)
- **Fichiers test:** Au moins 2-3 vidéos dans la bibliothèque (idéalement : 1080p H.264 + AAC, 720p, et une avec HEVC/DTS)

---

## Test 1: Baseline (Before)

**But:** Capturer le comportement actuel avant optimisations.

### Steps

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

---

## Test 2: Après Optimisations (After)

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

## Test 3: Regressions (Ne Pas Casser l'Existant)

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

## Test 4: Edge Cases

### 4a. Serveur ne Supporte Pas les Nouveaux Params

**Scénario:** Serveur Popcornn ancien / manquant implémentation `max_height` etc.

- **Comportement attendu:**
  - Client envoie URLs avec params
  - Serveur ignore, retourne MJPEG/MP3 pleine qualité (comme avant)
  - Pas d'erreur, pas de regression
  - Stutter non amélioré, mais **pas pire**

- **Test:**
  - Mock un serveur qui sert MJPEG fixe (ignorer query params)
  - Vérifier: playback fonctionne, pas d'exception

### 4b. Réseau Très Lent (2G)

- Chrome DevTools → "Slow 2G" (50 kbps)
- **Attendu:** Même à 480p@12fps, peut encore buffer
- **Acceptable:** Image freeze, mais audio continue
- **Inacceptable:** Crash, erreur fatale

### 4c. Media HEVC / DTS

- Fichier source HEVC + DTS (non H.264/AAC)
- **Serveur doit:**
  - Transcoder vers H.264 + AAC pour MJPEG/MP3
  - Ou fallback mode parking (remux MP4)
- **Client:**
  - Affiche message "Conversion..." si transcode en cours
  - Ou démarre lecture quand prêt

---

## Test 5: Probe Tool Validation

**But:** Vérifier que `/car/probe` aide à diagnostiquer.

### Steps

1. Ouvrir `https://client.popcornn.app/car/probe` (ou local `?car=1`)
2. **Vérifier lignes:**
   - `isTeslaBrowser`: OK / LIMITÉ (selon UA)
   - `HTMLVideoElement`: OK
   - `canPlayType H.264 AVC`: "probably" ou "maybe"
   - `canPlayType AAC`: "probably" ou "maybe"
   - `MediaSource (MSE)`: true / false
   - `WebCodecs VideoDecoder`: true / false (firmware-dependent)
   - `AudioContext`: true
   - `WebSocket`: true
   - `WebGL`: OK

3. **Si WebCodecs = false:**
   - Normal pour Tesla ancienne (Chromium 73)
   - Confirme qu'on doit garder `<img>` MJPEG (pas WebCodecs)

4. **Si WebCodecs = true:**
   - Firmware récent (Chromium 94+)
   - Future opportunité: tester WebCodecs + `<canvas>` (hors scope PR actuelle)

---

## Acceptance Criteria

**Pour merger la PR, tous ces points doivent être ✅:**

1. **Fonctionnel:**
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

4. **Documentation:**
   - [ ] `docs/TESLA_CAR_BROWSER.md` décrit architecture + workaround
   - [ ] `docs/TESLA_CAR_TESTING.md` (ce fichier) guide repro
   - [ ] PR body résume changements + lien vers docs

---

## Reporting Issues

Si test échoue, capturer:

1. **Navigateur:**
   - User-Agent complet
   - `/car/probe` résultats (screenshot)

2. **Network:**
   - Chrome DevTools → Network → Export HAR (ou screenshot filtered `car.mjpeg` / `car.audio`)
   - Throttling mode utilisé

3. **Symptômes:**
   - Stutter: après combien de secondes ?
   - Audio desync: de combien (secondes) ?
   - Image freeze: bloque ou slow framerate ?
   - Erreur console: copier trace complète

4. **Média test:**
   - Résolution source (ex: 1080p)
   - Codec source (H.264 / HEVC / ?)
   - Durée (ex: 1h30)

---

## Next Steps (Post-PR)

Si cette PR améliore significativement:
- Mesurer impact réel sur Tesla en condition production (Mathieu test)
- Si stutter persiste, explorer:
  - WebCodecs + `<canvas>` (firmware récent)
  - JSMpeg + WebSocket (plus complexe)
  - ABR ladder côté serveur (3 variantes qualité)

Si aucune amélioration:
- Documenter que le problème est probablement serveur-side (transcoding CPU bound, latence réseau)
- Ou hardware Tesla (CPU decode MJPEG insuffisant)
- Recommander: baisser encore à 360p@10fps, ou attendre update firmware Tesla
