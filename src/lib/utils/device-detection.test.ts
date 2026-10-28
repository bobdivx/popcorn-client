import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAndroidTV, isTVPlatform } from './device-detection';

const WINDOWS_WEBVIEW2_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const ANDROID_TV_WEBVIEW_UA =
  'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Safari/537.36';

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
}

describe('device-detection — app Tauri 2 sans __TAURI_METADATA__', () => {
  beforeEach(() => {
    (window as any).__TAURI_INTERNALS__ = {};
    delete (window as any).__TAURI_METADATA__;
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-tv-viewport');
  });
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    sessionStorage.clear();
  });

  it("l'app PC Windows en grand écran n'est pas une TV", () => {
    setUA(WINDOWS_WEBVIEW2_UA);
    setViewport(2560, 1369);
    expect(isAndroidTV()).toBe(false);
    expect(isTVPlatform()).toBe(false);
  });

  it("l'app Android en résolution TV reste détectée comme TV", () => {
    setUA(ANDROID_TV_WEBVIEW_UA);
    setViewport(1920, 1080);
    expect(isAndroidTV()).toBe(true);
  });
});
