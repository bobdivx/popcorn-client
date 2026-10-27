import { describe, it, expect, afterEach } from 'vitest';
import { hasBackendUrl, hasDeploymentBackend, isUsableCloudBackendUrl, setBackendUrl } from './backend-config';

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';

function setUA(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setUA(DESKTOP_UA);
});

describe('premier lancement : aucune URL serveur', () => {
  it("stockage vide → ni URL configurée ni backend de déploiement (IndexRedirect va sur /setup)", () => {
    expect(hasBackendUrl()).toBe(false);
    expect(hasDeploymentBackend()).toBe(false);
  });

  it('URL enregistrée (Quick Connect / config.json) → configurée', () => {
    setBackendUrl('https://popcorn.example.org');
    expect(hasBackendUrl()).toBe(true);
  });
});

describe('isUsableCloudBackendUrl', () => {
  it('accepte une URL publique ou LAN, partout', () => {
    setUA(ANDROID_UA);
    expect(isUsableCloudBackendUrl('https://popcorn.example.org')).toBe(true);
    expect(isUsableCloudBackendUrl('http://192.168.1.20:3000')).toBe(true);
  });

  it('refuse une adresse de bouclage sur Android (serveur embarqué d’un PC)', () => {
    setUA(ANDROID_UA);
    expect(isUsableCloudBackendUrl('http://127.0.0.1:3000')).toBe(false);
    expect(isUsableCloudBackendUrl('http://localhost:3000')).toBe(false);
    expect(isUsableCloudBackendUrl('http://0.0.0.0:3000')).toBe(false);
  });

  it('garde le bouclage hors Android (desktop / web local)', () => {
    setUA(DESKTOP_UA);
    expect(isUsableCloudBackendUrl('http://127.0.0.1:3000')).toBe(true);
  });

  it('refuse vide / invalide', () => {
    expect(isUsableCloudBackendUrl('')).toBe(false);
    expect(isUsableCloudBackendUrl(null)).toBe(false);
    expect(isUsableCloudBackendUrl('ftp://x.org')).toBe(false);
  });
});
