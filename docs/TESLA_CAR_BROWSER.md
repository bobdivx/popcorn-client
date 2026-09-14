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

| API / Feature                  | Parked | Drive | Notes / Sources                                      |
|--------------------------------|:------:|:-----:|------------------------------------------------------|
| **`<video>` element**          | ✅      | ❌     | Paused at OS level in Drive, last frame frozen, audio continues [[1]](#ref-1) [[2]](#ref-2) |
| **`<audio>` element**          | ✅      | ✅     | NOT blocked; audio streams persist [[2]](#ref-2) [[3]](#ref-3) |
| **`<img>` MJPEG stream**       | ✅      | ✅     | `multipart/x-mixed-replace` works (server-sent JPEG frames) [[4]](#ref-4) [[5]](#ref-5) |
| **Canvas 2D**                  | ✅      | ✅     | Available [[1]](#ref-1) |
| **WebGL / WebGL2**             | ✅      | ✅     | Available, performance varies [[1]](#ref-1) [[6]](#ref-6) |
| **WebSocket**                  | ✅      | ✅     | Available [[1]](#ref-1) |
| **WebAssembly**                | ✅      | ✅     | Available [[1]](#ref-1) |
| **AudioContext / Web Audio**   | ✅      | ✅     | Available [[7]](#ref-7) |
| **MediaSource Extensions (MSE)** | ✅ | ⚠️    | Limited codec support (H.264/AAC require `-webengine-proprietary-codecs`) [[1]](#ref-1) [[8]](#ref-8) |
| **WebCodecs**                  | ⚠️     | ⚠️    | **Conflicting reports:** madpowah/tesla-video-drive says "Not available" [[1]](#ref-1), but echo-cool/tesla-bilibili-player claims success with `VideoDecoder`/`AudioDecoder` [[7]](#ref-7). Likely **firmware-dependent** (older Tesla ≈ Chromium 73 lacks WebCodecs; newer ≈ Chromium 94+ may have it). Requires secure context (HTTPS/localhost). |
| **WebRTC**                     | ⚠️     | ❌     | Unreliable or blocked in Drive [[1]](#ref-1) [[9]](#ref-9) |
| **getUserMedia (mic/camera)**  | ❌      | ❌     | Blocked at compile-time [[1]](#ref-1) |
| **Fullscreen API**             | ✅      | ⚠️    | Available but may behave differently [[8]](#ref-8) |
| **Picture-in-Picture**         | ?      | ?     | Not documented in sources |
| **Service Workers**            | ✅      | ✅     | Available [[1]](#ref-1) |
| **IndexedDB**                  | ✅      | ✅     | Storage API available [[6]](#ref-6) |
| **requestVideoFrameCallback**  | ?      | ?     | Not documented |
| **OffscreenCanvas**            | ?      | ?     | Not documented |
| **SharedArrayBuffer**          | ?      | ?     | Not documented |
| **DRM / EME**                  | ✅      | ⚠️    | DRM support exists [[6]](#ref-6), behavior in Drive unclear |
| **Autoplay (audio/video)**     | ⚠️     | ⚠️    | Likely requires user gesture (tap) [[7]](#ref-7) |

**Legend:**  
✅ Available  
⚠️ Partially available / firmware-dependent / requires configuration  
❌ Blocked  
? Undocumented

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

Tests:
- User-Agent, Tesla detection
- `HTMLVideoElement`, codec support (H.264, AAC, VP8, HLS)
- MSE, WebCodecs, AudioContext, WebSocket, WebGL

**Use case:** Validate browser capabilities before debugging playback issues.

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

4. **Update `/car/probe` (optional):**
   - Add `createImageBitmap`, `OffscreenCanvas`, `SharedArrayBuffer` checks.
   - Add codec test for `canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"')` (HEVC).
   - Log results to help debug future firmware changes.

### Future (Experimental)

5. **WebCodecs fallback (if supported):**
   - Feature-detect `VideoDecoder` on `/car/probe`.
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

**Safest optimization path:**
1. Add low-bitrate/fps query params to server endpoints (`max_height=480`, `max_fps=12`, `quality=3`, `bitrate=96k`).
2. Test on Tesla or simulated mobile network.
3. If insufficient, explore WebCodecs (feature-detect first) or JSMpeg (separate experimental route).

**Do NOT:**
- Re-enable `<video>` in Drive (blocked).
- Assume WebCodecs available without feature detection (firmware-dependent).
- Break existing MJPEG/audio workaround.
