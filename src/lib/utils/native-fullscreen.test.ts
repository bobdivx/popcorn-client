import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

async function load() {
  vi.resetModules();
  return import('./native-fullscreen');
}

describe('native-fullscreen', () => {
  beforeEach(() => {
    invoke.mockReset();
  });
  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    setUA(DESKTOP_UA);
  });

  it('web (hors Tauri) : aucun invoke, retourne false', async () => {
    setUA(ANDROID_UA);
    const m = await load();
    expect(m.isTauriAndroid()).toBe(false);
    expect(await m.setNativeFullscreen(true)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('Tauri desktop : aucun invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(DESKTOP_UA);
    const m = await load();
    expect(await m.setNativeFullscreen(true)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('Tauri Android : entrée puis sortie via la commande set-native-fullscreen', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(ANDROID_UA);
    invoke.mockResolvedValue(true);
    const m = await load();
    expect(await m.setNativeFullscreen(true)).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('set-native-fullscreen', { enabled: true });
    expect(m.isNativeFullscreenActive()).toBe(true);
    expect(await m.setNativeFullscreen(false)).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('set-native-fullscreen', { enabled: false });
    expect(m.isNativeFullscreenActive()).toBe(false);
  });

  it('sortie sans entrée préalable : pas d’invoke inutile', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(ANDROID_UA);
    const m = await load();
    expect(await m.setNativeFullscreen(false)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sortie demandée pendant une entrée en vol : transmise', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(ANDROID_UA);
    let resolveEnter: (v: boolean) => void = () => {};
    invoke.mockImplementationOnce(() => new Promise<boolean>((r) => (resolveEnter = r)));
    invoke.mockResolvedValueOnce(true);
    // Imports dynamiques concurrents : vitest peut résoudre le vrai @tauri-apps/api/core,
    // qui passe par __TAURI_INTERNALS__.invoke → on y branche aussi le mock.
    (window as any).__TAURI_INTERNALS__ = { invoke: (cmd: string, args: unknown) => invoke(cmd, args) };
    const m = await load();
    const enter = m.setNativeFullscreen(true);
    const exit = m.setNativeFullscreen(false);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    resolveEnter(true);
    await Promise.all([enter, exit]);
    expect(invoke).toHaveBeenLastCalledWith('set-native-fullscreen', { enabled: false });
    expect(m.isNativeFullscreenActive()).toBe(false);
  });

  it('ancienne APK (commande inconnue) : ne lève pas, retourne false', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(ANDROID_UA);
    invoke.mockRejectedValue(new Error('command set-native-fullscreen not found'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await load();
    expect(await m.setNativeFullscreen(true)).toBe(false);
    expect(m.isNativeFullscreenActive()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('évènement Retour natif : callback appelé et état remis à zéro', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    setUA(ANDROID_UA);
    invoke.mockResolvedValue(true);
    const m = await load();
    await m.setNativeFullscreen(true);
    const cb = vi.fn();
    const off = m.onNativeFullscreenExit(cb);
    window.dispatchEvent(new CustomEvent(m.NATIVE_FULLSCREEN_EXIT_EVENT));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(m.isNativeFullscreenActive()).toBe(false);
    off();
    window.dispatchEvent(new CustomEvent(m.NATIVE_FULLSCREEN_EXIT_EVENT));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
