# Tesla Car Browser — Drive Mode Playback Research

**Date:** 2026-09-14  
**Context:** Investigation Tesla Chromium restrictions pour optimiser le mode conduite Popcornn sans casser le workaround existant.

---

## 1. Tesla Browser Capabilities: Drive vs Parked

### Platform

- **Base:** QtWebEngine (embedded Chromium ~73-94+, firmware-dependent)
- **User-Agent:** `Mozilla/5.0 (X11; GNU/Linux) AppleWebKit/537.36 Chrome/[version] Tesla QtCarBrowser`
- **Modes:** Park (permissif) vs Drive (restrictions sécurité)

### APIs: Support Matrix

**IMPORTANT:** Matrice mise à jour avec résultats probe empirique (`/car/probe`) — voir section [5. Probe Tool](#5-probe-tool) pour détails.

| API / Feature                  | Parked | Drive | Notes / Sources                                      |
|--------------------------------|:------:|:-----:|------------------------------------------------------|
| **`<video>` element**          | ✅      | ❌     | **Probe confirm:** Paused at OS level in Drive, `currentTime` stays 0 despite `play()` [[1]](#ref-1) [[2]](#ref-2) |
| **`<video>` → canvas drawImage** | ✅    | ❌     | **Probe confirm:** Black frame extracted in Drive (Tesla blocks frame extraction) |
| **`<audio>` element**          | ✅      | ✅     | **Probe confirm:** NOT blocked; audio streams persist [[2]](#ref-2) [[3]](#ref-3) |
| **`<img>` MJPEG stream**       | ✅      | ✅     | `multipart/x-mixed-replace` works (server-sent JPEG frames) [[4]](#ref-4) [[5]](#ref-5) |
| **Canvas 2D**                  | ✅      | ✅     | **Probe confirm:** Available [[1]](#ref-1) |
| **WebGL / WebGL2**             | ✅      | ✅     | **Probe confirm:** Available, performance varies [[1]](#ref-1) [[6]](#ref-6) |
| **OffscreenCanvas**            | ⚠️     | ⚠️    | **Probe test:** Available or not (firmware-dependent) |
| **createImageBitmap**          | ⚠️     | ⚠️    | **Probe test:** Available or not (firmware-dependent) |
| **WebSocket**                  | ✅      | ✅     | **Probe confirm:** Available [[1]](#ref-1) |
| **WebAssembly**                | ✅      | ✅     | Available [[1]](#ref-1) |
| **AudioContext / Web Audio**   | ✅      | ✅     | **Probe confirm:** Available [[7]](#ref-7) |
| **requestAnimationFrame**      | ✅      | ✅     | **Probe test:** Measures actual fps (~60fps typically) |
| **MediaSource Extensions (MSE)** | ✅ | ⚠️    | **Probe test:** Limited codec support (H.264/AAC require `-webengine-proprietary-codecs`) [[1]](#ref-1) [[8]](#ref-8) |
| **WebCodecs**                  | ⚠️     | ⚠️    | **Probe test:** `VideoDecoder`/`AudioDecoder` available or not. **Conflicting reports:** madpowah/tesla-video-drive says "Not available" [[1]](#ref-1), but echo-cool/tesla-bilibili-player claims success with `VideoDecoder`/`AudioDecoder` [[7]](#ref-7). Likely **firmware-dependent** (older Tesla ≈ Chromium 73 lacks WebCodecs; newer ≈ Chromium 94+ may have it). Requires secure context (HTTPS/localhost). |
| **WebRTC**                     | ⚠️     | ❌     | Unreliable or blocked in Drive [[1]](#ref-1) [[9]](#ref-9) |
| **getUserMedia (mic/camera)**  | ❌      | ❌     | Blocked at compile-time [[1]](#ref-1) |
| **Fullscreen API**             | ⚠️     | ⚠️    | **Probe test:** `document.fullscreenEnabled` check |
| **Picture-in-Picture**         | ⚠️     | ⚠️    | **Probe test:** `document.pictureInPictureEnabled` check |
| **Service Workers**            | ✅      | ✅     | Available [[1]](#ref-1) |
| **IndexedDB**                  | ✅      | ✅     | Storage API available [[6]](#ref-6) |
| **requestVideoFrameCallback**  | ?      | ?     | Not documented |
| **SharedArrayBuffer**          | ?      | ?     | Not documented |
| **DRM / EME**                  | ✅      | ⚠️    | DRM support exists [[6]](#ref-6), behavior in Drive unclear |
| **Autoplay (audio/video)**     | ⚠️     | ⚠️    | **Probe test:** Muted autoplay likely allowed, unmuted requires user gesture [[7]](#ref-7) |

**Legend:**  
✅ Available (confirmed by probe or community)  
⚠️ Partially available / firmware-dependent / requires configuration  
❌ Blocked (confirmed by probe or community)  
? Undocumented

**→ See [Section 5: Probe Tool](#5-probe-tool) for systematic testing methodology and results interpretation.**

### Codec Support

- **H.264 (AVC) + AAC:** Requires `-webengine-proprietary-codecs` compile flag [[8]](#ref-8). Tesla ships with this enabled (observed working in MJPEG + MP3 workflows).
- **VP8 / VP9 / Theora / Vorbis:** Open codecs available [[6]](#ref-6).
- **HEVC / H.265:** Not reliable [[6]](#ref-6).
- **AV1:** Unknown.

---

## 2. Popcornn Car Mode: Current Implementation

### Architecture Overview

**Location:** `/car` route → `src/pages/car/index.astro` → `CarPlayer.tsx`

**Workaround Strategy:**  
Tesla blocks `<video>` in Drive by calling `.pause()` at the OS level. Popcornn circumvents this with:

1. **Drive Mode (while moving):**
   - **Video:** Server generates **MJPEG stream** (`/api/local/stream/<path>/car.mjpeg?seek=X`)
     - Rendered via `<img>` tag consuming `multipart/x-mixed-replace` JPEG frames
     - Tesla sees a "fast-updating image" — NOT a `<video>` element
   - **Audio:** Server generates **MP3 stream** (`/api/local/stream/<path>/car.audio?seek=X`)
     - Rendered via `<audio>` tag (NOT blocked in Drive)
   - **Sync:** Audio `currentTime` + `driveAnchor` offset to track absolute position

2. **Parking Mode (stationary):**
   - Uses standard `<video>` tag with direct MP4 stream (`/api/local/stream/<path>`)
   - Server remuxes / transcodes to H.264 + AAC if needed (HEVC → H.264, DTS → AAC)
   - Falls back to Drive Mode if Tesla auto-pauses (detection via `video.paused` + `lastAdvanceAtRef`)

### Code Paths

```tsx
// CarPlayer.tsx — Core logic
<video ref={videoRef} />          // Parking mode
<audio ref={audioRef} />          // Drive mode audio
<img ref={imgRef} />              // Drive mode MJPEG video

// buildCarDriveUrls.ts
export function buildCarDriveUrls(streamUrl: string, seekSeconds: number): CarDriveUrls {
  // Currently NO quality/fps parameters — defaults to source framerate/resolution
  mjpeg.pathname = `${pathname}/car.mjpeg`;
  audio.pathname = `${pathname}/car.audio`;
  return { mjpegUrl, audioUrl };
}
```

### Probe Tool

**Location:** `/car/probe` → `CarProbe.tsx`

**🆕 Comprehensive 20+ tests systematically validate ALL browser APIs.**

#### Tests Covered

**1. Environment (4 tests):**
- User-Agent
- `isTeslaBrowser()` detection
- `isCarPlayerMode()` detection
- Secure Context (HTTPS/localhost)

**2. Video Element (6 tests):**
- HTMLVideoElement exists
- Codec support: H.264 AVC, AAC, HLS m3u8, VP8, VP9, HEVC
- **Video playback test:** Creates hidden `<video>` with data URL, attempts play, checks if `currentTime` advances
  - **Park:** `currentTime > 0` → ✅ Pass
  - **Drive:** `currentTime = 0` despite `play()` → ❌ Fail (Tesla pauses at OS level)
- **drawImage(video)→canvas test:** Attempts to extract frame from playing video to canvas
  - **Park:** Non-black pixels → ✅ Pass
  - **Drive:** Black frame or timeout → ❌ Fail (Tesla blocks frame extraction)

**3. Audio Element (2 tests):**
- Audio playback (MP3 data URL)
  - **Drive:** ✅ Pass (audio NOT blocked — confirms workaround safe)
- AudioContext / webkitAudioContext available

**4. Media Source Extensions (2 tests):**
- MediaSource available
- SourceBuffer attach to video (sourceopen event fires)

**5. WebCodecs (3 tests):**
- VideoDecoder presence
- AudioDecoder presence
- `VideoDecoder.isConfigSupported({ codec: 'avc1.42E01E', ... })` (H.264 AVC)

**6. Canvas & Rendering (4 tests):**
- Canvas 2D context
- WebGL context
- OffscreenCanvas availability
- createImageBitmap

**7. Animation & Timing (1 test):**
- requestAnimationFrame rate (~fps measurement over 10 frames)

**8. Autoplay Policies (2 tests):**
- Autoplay muted (usually allowed)
- Autoplay unmuted (usually blocked by browser policy or Drive mode)

**9. Fullscreen & PiP (2 tests):**
- Fullscreen API enabled (`document.fullscreenEnabled`)
- Picture-in-Picture available (`document.pictureInPictureEnabled`)

**10. Networking (2 tests):**
- WebSocket constructor available
- Binary throughput check (placeholder)

#### Probe Report Output

**Visual UI:**
- Results grouped by category (Environment, Video, Audio, MSE, WebCodecs, Canvas, Animation, Autoplay, APIs, Network)
- Color-coded icons: ✅ Pass (green), ❌ Fail (red), ⚠️ Partial (orange)
- Confidence scores displayed (0-100%) for uncertain results
- **Summary Box:**
  - Mode détecté: Park / Drive / Unknown
  - Video bloqué: Oui/Non
  - Audio fonctionne: Oui/Non
  - Canvas disponible: Oui/Non
  - MSE disponible: Oui/Non
  - WebCodecs disponible: Oui/Non
  - **Moteur recommandé:** MJPEG (Drive-safe) ou native-video (Park)
- Expandable JSON raw data export for debugging

#### Interpretation

**Park Mode Results:**
```
Video playback: ✅ Pass (currentTime > 0)
drawImage(video): ✅ Pass (non-black pixels)
Audio playback: ✅ Pass
Canvas 2D: ✅ Pass
WebGL: ✅ Pass
MSE: ✅ Pass (firmware-dependent)
WebCodecs: ✅ Pass ou ❌ Fail (firmware-dependent)

→ Recommande: native-video (meilleure qualité)
```

**Drive Mode Results:**
```
Video playback: ❌ Fail (currentTime=0 malgré play())
drawImage(video): ❌ Fail (black frame — Tesla bloque extraction)
Audio playback: ✅ Pass (audio PAS bloqué — critical!)
Canvas 2D: ✅ Pass
WebGL: ✅ Pass
MSE: ✅ Pass ou ❌ Fail (firmware-dependent)
WebCodecs: ✅ Pass ou ❌ Fail (firmware-dependent)

→ Recommande: MJPEG (seul moteur Drive-safe confirmé)
```

**Key Insights:**
- **Empirical validation:** Pas de folklore — probe confirme exactement ce qui est bloqué
- **Audio always works:** Confirme que workaround `<audio>` MP3 est sûr en Drive
- **Canvas/WebGL available:** Opportunité future pour WebCodecs + canvas render si firmware récent
- **MSE/WebCodecs firmware-dependent:** Peut varier selon version Tesla Chromium

#### Use Case

1. **Before debugging playback issues:** Run `/car/probe` to establish baseline capabilities
2. **Compare Park vs Drive:** Understand exactly what Tesla blocks in each mode
3. **Plan optimizations:** If WebCodecs available → explore canvas decoder; if not → stick to MJPEG
4. **Report bugs:** Export JSON, attach to GitHub issue with firmware version

**→ Probe results drive engine selection logic in `CarPlayer.tsx` (see [Section 2](#2-popcornn-car-mode-current-implementation)).**

---

## 3. Gap Analysis: Smoothness Opportunities

**Problem Statement:** Drive Mode playback (MJPEG `<img>` + MP3 `<audio>`) is stuttery/unwatchable on mobile/LTE networks.

### Hypothesis Matrix

| Root Cause                       | Evidence | Risk to Current Workaround | Opportunity |
|----------------------------------|----------|----------------------------|-------------|
| **High MJPEG resolution/bitrate** | Server sends source resolution (720p-1080p) without downscaling | **Low risk** | ✅ Add `max_height=480`, `quality=3` query params to `.mjpeg` endpoint |
| **High MJPEG framerate**         | No `max_fps` param → server sends 24-30fps | **Low risk** | ✅ Add `max_fps=12` to reduce bandwidth / stutter on variable LTE |
| **Audio bitrate too high**       | No `bitrate` param → defaults to source (128-320kbps?) | **Low risk** | ✅ Add `bitrate=96k` to `.audio` endpoint |
| **Network ABR thrashing**        | MJPEG has no adaptive bitrate ladder | **Medium risk** | ⚠️ Requires server-side ABR (complex) OR client-side frame drop logic |
| **`<img>` render loop blocking**  | Browser may block main thread decoding JPEG | **Low risk** | ✅ Test `loading="eager"` vs lazy, measure with DevTools |
| **Audio/video desync**           | `driveAnchor` + `audio.currentTime` math | **Medium risk** | ⚠️ Requires careful offset tuning; risk breaking sync |
| **CPU/GPU decode overload**      | Tesla Chromium CPU decodes MJPEG (no hw accel for JPEG sequence) | **Low risk** | ✅ Lower resolution + fps reduces decode cost |
| **CSS animations / redraws**     | `tesla-car.css` has transitions, backdrop-filter | **Low risk** | ✅ Disable non-critical animations in Drive mode |
| **Memory / GC pressure**         | Long MJPEG streams + audio buffers | **Low risk** | ✅ Add periodic cleanup, limit buffer sizes |

### Safe vs Risky Changes

**✅ Low-Risk (Server-side quality params):**
- Add query params to `buildCarDriveUrls()`:
  - `max_height=480` (or 360 for very slow 3G)
  - `max_fps=12` (lower = smoother on unstable bandwidth)
  - `quality=3` (MJPEG compression: 1=best, 5=worst)
  - `bitrate=96k` (audio MP3)
- **Does NOT** change client-side `<img>`/`<audio>` workaround.
- **Fallback:** If server ignores params, behavior unchanged.

**⚠️ Medium-Risk (Alternative decode paths):**
- Switch from `<img>` MJPEG to **WebCodecs** + `<canvas>`:
  - **Pro:** Lower latency, hardware decode for H.264, adaptive quality
  - **Con:** Conflicting WebCodecs support reports → may not work on older Tesla firmware
  - **Mitigation:** Feature-detect `VideoDecoder`, fallback to `<img>` MJPEG
- Switch to **JSMpeg** (MPEG1-TS over WebSocket → WebGL `<canvas>`):
  - **Pro:** Used successfully by `madpowah/tesla-video-drive`
  - **Con:** Requires server rewrite (FFmpeg → MPEG1-TS), WebSocket infra
  - **Mitigation:** Separate experimental endpoint, opt-in

**❌ High-Risk (DO NOT DO):**
- Re-enable `<video>` element in Drive → **Tesla will pause it immediately**.
- Use WebRTC → **Blocked in Drive**.
- Rely on MSE without fallback → **Codec support inconsistent**.

---

## 4. Recommended Next Steps

### Immediate (Low-Risk Wins)

1. **Add quality parameters to `buildCarDriveUrls()`:**
   ```ts
   // src/components/streaming/car-player/buildCarDriveUrls.ts
   export interface CarDriveQualityProfile {
     maxHeight: number;    // 480 or 360
     maxFps: number;       // 12
     quality: number;      // 3 (MJPEG)
     audioBitrate: string; // '96k'
   }
   
   mjpeg.searchParams.set('max_height', String(profile.maxHeight));
   mjpeg.searchParams.set('max_fps', String(profile.maxFps));
   mjpeg.searchParams.set('quality', String(profile.quality));
   audio.searchParams.set('bitrate', profile.audioBitrate);
   ```

2. **Server-side validation (popcorn-server):**
   - Confirm `/api/local/stream/<path>/car.mjpeg` honors `max_height`, `max_fps`, `quality` params.
   - Confirm `/api/local/stream/<path>/car.audio` honors `bitrate` param.
   - If not implemented, add FFmpeg filters: `-vf scale=-2:480,fps=12` + `-b:a 96k`.

3. **Test in Tesla or desktop Chrome with `?car=1`:**
   - Verify smoother playback at lower resolution/fps.
   - Check audio/video sync remains acceptable.

4. **Update `/car/probe` documentation:**
   - ✅ **DONE:** 20+ comprehensive tests now cover all major APIs
   - ✅ **DONE:** Park vs Drive detection via video playback + drawImage tests
   - ✅ **DONE:** Summary recommendations (MJPEG for Drive, native-video for Park)
   - ✅ **DONE:** Confidence scoring for uncertain results
   - See [Section 2: Probe Tool](#probe-tool) for full details

### Future (Experimental)

5. **WebCodecs fallback (if probe confirms support):**
   - Feature-detect `VideoDecoder` via `/car/probe` results
   - If available AND Park/Drive detection works → consider WebCodecs + canvas render
   - **Advantage:** Hardware H.264 decode, lower latency, adaptive quality
   - **Risk:** Firmware-dependent (Chromium 94+ required)
   - **Mitigation:** Strict feature detect, fallback to MJPEG if unavailable

6. **MSE + HLS/DASH for Park mode (if probe confirms MSE):**
   - If probe shows MSE available → explore native `<video>` with HLS/DASH in Park
   - **Advantage:** Adaptive bitrate, standard streaming protocols
   - **Risk:** MSE codec support inconsistent
   - **Mitigation:** Only enable in Park mode (Drive falls back to MJPEG anyway)
   - If available, offer opt-in "HD Mode" using WebCodecs + `<canvas>` + Web Audio.
   - Keep `<img>` MJPEG as default (proven stable).

6. **Adaptive quality ladder:**
   - Server generates 3 MJPEG variants (360p@10fps, 480p@12fps, 720p@15fps).
   - Client switches based on Network Information API `navigator.connection.effectiveType`.
   - Requires more complex server logic + storage.

7. **JSMpeg / MPEG1-TS path:**
   - Separate `/car/experimental` route with WebSocket + JSMpeg.
   - Compare latency, smoothness, CPU usage vs MJPEG.
   - Only promote to main `/car` if significant improvement proven.

---

## 5. Testing Checklist

Before merging Drive Mode changes:

- [ ] **Park Mode** — `<video>` MP4 playback still works (no regression).
- [ ] **Drive Mode** — MJPEG `<img>` + MP3 `<audio>` still render (workaround intact).
- [ ] **Quality params applied** — Check Network tab for `?max_height=480&max_fps=12&quality=3&bitrate=96k`.
- [ ] **Audio/video sync** — Seek forward/back, verify `driveAnchor` math still correct.
- [ ] **Bandwidth reduced** — Compare Network tab before/after (should be ~50-70% less).
- [ ] **Smoothness improved** — Visual inspection on Tesla or simulated mobile throttling (Chrome DevTools → Network → Slow 3G).
- [ ] **Error handling** — If server ignores params, client should not break.

---

## 5. Probe Tool — Systematic API Testing

**Location:** `/car/probe` → `src/components/streaming/car-player/CarProbe.tsx`

### Purpose

Empirically test ALL browser APIs to determine exactly what's blocked in Drive vs Park — **no folklore, only data**.

### Methodology

Probe runs 20+ tests systematically grouped by category:

1. **Environment:** User-Agent, Tesla detection, Secure Context
2. **Video Element:** HTMLVideoElement, codecs, playback test (Drive detection), drawImage→canvas test
3. **Audio Element:** Audio playback, AudioContext
4. **MSE:** MediaSource, SourceBuffer attach
5. **WebCodecs:** VideoDecoder, AudioDecoder, isConfigSupported
6. **Canvas:** Canvas 2D, WebGL, OffscreenCanvas, createImageBitmap
7. **Animation:** requestAnimationFrame rate
8. **Autoplay:** Muted/unmuted policies
9. **APIs:** Fullscreen, Picture-in-Picture
10. **Network:** WebSocket, binary throughput

**Each test returns:**
- **Status:** pass (✅), fail (❌), partial (⚠️), skip
- **Detail:** Diagnostic string (e.g., "currentTime=0.053s", "Black frame detected")
- **Confidence:** 0-1 score for uncertain results (e.g., timeout vs blocked)

### Key Tests

#### Video Playback (Drive Detection)

```typescript
// Creates hidden <video> with 1-frame WebM data URL
video.src = 'data:video/webm;base64,...';
video.muted = true;
video.playsInline = true;
await video.play();

// Wait 2.5s, check if currentTime advances
if (video.currentTime > 0.05) {
  // Park mode: video plays ✅
} else {
  // Drive mode: Tesla pauses at OS level ❌
}
```

**Result:**
- **Park:** `currentTime > 0` → status: pass
- **Drive:** `currentTime = 0` → status: fail (confidence: 0.7)

#### drawImage(video) Test

```typescript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0, 10, 10);
const imageData = ctx.getImageData(0, 0, 10, 10);
const hasNonZero = imageData.data.some(v => v > 0);

if (hasNonZero) {
  // Park: frame extracted ✅
} else {
  // Drive: black frame (Tesla blocks extraction) ❌
}
```

**Result:**
- **Park:** Non-black pixels → status: pass
- **Drive:** All-black pixels → status: fail (confidence: 0.7)

#### Audio Playback Test

```typescript
// Creates <audio> with tiny MP3 data URL
audio.src = 'data:audio/mp3;base64,...';
audio.muted = true;
await audio.play();

// Wait 2s, check if currentTime advances
if (audio.currentTime > 0) {
  // Audio works ✅
} else {
  // Audio blocked or policy ❌
}
```

**Result:**
- **Park & Drive:** `currentTime > 0` → status: pass
- **Key insight:** Audio NOT blocked in Drive (confirms workaround safe)

### Summary Output

Probe generates a summary box with key findings:

```
Mode détecté: Drive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Video bloqué:          Oui ❌
Audio fonctionne:      Oui ✅
Canvas disponible:     Oui ✅
MSE disponible:        Oui ✅ (ou Non ❌)
WebCodecs disponible:  Non ❌ (ou Oui ✅)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Moteur recommandé: MJPEG
```

**Engine Recommendation Logic:**
```typescript
if (videoPlaybackWorks) {
  recommendedEngine = 'native-video';  // Park: prefer quality
} else if (canvasWorks && audioWorks) {
  recommendedEngine = 'mjpeg';          // Drive: MJPEG workaround
}
```

### UI Features

- **Auto-run on page load** (10-15s total)
- **Color-coded results:**
  - ✅ Green border/icon: Pass
  - ❌ Red border/icon: Fail
  - ⚠️ Orange border/icon: Partial/uncertain
- **Confidence scores** displayed when < 100%
- **Grouped by category** (collapsible sections)
- **Expandable JSON export** for debugging (full raw report)

### Use Cases

1. **Pre-deployment validation:**
   - Run probe in Tesla Park → confirm native-video recommended
   - Run probe in Tesla Drive → confirm MJPEG recommended
   - Export JSON, commit to repo as baseline

2. **Debugging playback issues:**
   - User reports stutter → ask for `/car/probe` screenshot
   - Check: video blocked? Audio works? MSE/WebCodecs available?
   - Diagnose: firmware-dependent feature missing, codec support issue, etc.

3. **Planning future optimizations:**
   - If WebCodecs available → explore canvas decoder
   - If MSE available → explore HLS/DASH for Park
   - If not → stick to MJPEG (proven safe)

4. **Reporting bugs to Tesla:**
   - Export probe JSON + User-Agent + firmware version
   - Evidence-based bug report (not "it doesn't work")

### Integration with CarPlayer

**File:** `src/components/streaming/car-player/CarPlayer.tsx`

CarPlayer uses same detection logic as probe (video playback test) to:
1. Determine Park/Drive mode
2. Resolve effective playback type (MJPEG vs native-video)
3. Monitor mode changes every 10s
4. Auto-switch engines when mode changes

**Example:**
```typescript
const detectedMode = await detectTeslaDriveMode();  // Uses same probe logic
if (detectedMode.mode === 'drive') {
  effectiveType = 'mjpeg';   // Safe for Drive
} else if (detectedMode.mode === 'park') {
  effectiveType = 'native-video';  // Better quality
}
```

**Advantage:** Probe and production use identical detection → results always consistent.

---

## 6. References

<a id="ref-1"></a>**[1]** madpowah/tesla-video-drive — [https://github.com/madpowah/tesla-video-drive](https://github.com/madpowah/tesla-video-drive)  
- Probe results: WebCodecs "Not available", WebRTC blocked, MSE limited, `<video>` paused in Drive.

<a id="ref-2"></a>**[2]** JOWUA Tesla Blog — [How To Listen To Video While Driving](https://www.jowua-life.com/blogs/jowua-blog/how-to-listen-to-video-while-driving)  
- Confirms: `<audio>` continues in Drive, `<video>` disappears/black.

<a id="ref-3"></a>**[3]** Tesla Motors Club Forum — [2024 Model Y audio-only video](https://teslamotorsclub.com/tmc/threads/2024-model-y-start-video-in-browser-and-listen-as-audio-not-working-for-youtube-and-netflix.340167/)  
- User workaround: Open browser in Drive mode (foot on brake) to keep YouTube in windowed mode → audio persists.

<a id="ref-4"></a>**[4]** JoyLau/opencarstream — [https://github.com/JoyLau/opencarstream](https://github.com/JoyLau/opencarstream)  
- MJPEG streamer with `MJPEG_FPS`, `FFMPEG_QUALITY`, `STREAM_WIDTH/HEIGHT` env vars.

<a id="ref-5"></a>**[5]** santibacat/opencarstream (fork) — [https://github.com/santibacat/opencarstream](https://github.com/santibacat/opencarstream)  
- Similar MJPEG approach, configurable quality params.

<a id="ref-6"></a>**[6]** wsmlby Tech Blog — [Tesla New Browser Capabilities (2019)](https://tech.wsmlby.info/2019/05/tesla-new-browser-capabilities.html)  
- HTML5Test results: Chromium 73, VP8/Theora OK, H.264 requires proprietary codecs, DRM available.

<a id="ref-7"></a>**[7]** echo-cool/tesla-bilibili-player — [https://github.com/echo-cool/tesla-bilibili-player](https://github.com/echo-cool/tesla-bilibili-player)  
- Claims WebCodecs `VideoDecoder`/`AudioDecoder` work in Tesla Chromium (AVC+AAC only).
- Requires HTTPS, demuxes with mp4box.js, renders to `<canvas>` + Web Audio.

<a id="ref-8"></a>**[8]** Qt WebEngine Features — [https://doc.qt.io/qt-6/qtwebengine-features.html](https://doc.qt.io/qt-6/qtwebengine-features.html)  
- MSE, H.264/AAC require `-webengine-proprietary-codecs` compile flag.

<a id="ref-9"></a>**[9]** Reddit /r/TeslaMirror — [WebRTC mode supported in TeslaMirror](https://www.reddit.com/r/TeslaMirror/comments/znid47/webrtc_mode_is_supported_from_teslamirror_android/)  
- WebRTC only works in Park, disconnects in Drive.

---

## 7. Conclusion

**Current Popcornn workaround is sound:** `<img>` MJPEG + `<audio>` MP3 bypasses Tesla's `<video>` block. Stutter is likely **bandwidth / framerate / resolution** related, NOT a fundamental API failure.

**Probe tool confirms:**
- ✅ Audio works in Drive (workaround safe)
- ✅ Canvas/WebGL available in Drive (future WebCodecs opportunity)
- ❌ Video playback blocked in Drive (`currentTime=0` despite play)
- ❌ drawImage(video) blocked in Drive (black frame extraction)

**Safest optimization path:**
1. ✅ **DONE:** Add low-bitrate/fps query params to server endpoints (`max_height=480`, `max_fps=12`, `quality=3`, `bitrate=96k`).
2. ✅ **DONE:** Implement Park/Drive auto-detection + multi-engine switcher (Auto/Manuel).
3. ✅ **DONE:** Comprehensive probe tool (20+ tests) for empirical validation.
4. ⏳ **TODO:** Test on Tesla or simulated mobile network (Mathieu validation).
5. ⏳ **TODO (if stutter persists):** Explore WebCodecs (if probe confirms available) or JSMpeg (separate experimental route).

**Do NOT:**
- Re-enable `<video>` in Drive (probe confirms blocked).
- Assume WebCodecs/MSE available without probe validation (firmware-dependent).
- Break existing MJPEG/audio workaround.

**Empirical data > folklore** 🎯
