/**
 * Liens de téléchargement stables (toujours la dernière version publiée).
 * Résolus côté popcornn.app (/download/<plateforme> → 302 vers l'asset GitHub de popcorn-client).
 * Utilisables par l'écran « Mets à jour Popcornn » (min-client-version) et les pages réglages.
 */
export const POPCORNN_SITE_URL = 'https://popcornn.app';

export const APP_DOWNLOAD_LINKS = {
  /** Page téléchargements complète. */
  page: `${POPCORNN_SITE_URL}/downloads`,
  /** APK Android complet (dernière version). */
  android: `${POPCORNN_SITE_URL}/download/android`,
  /** Opt-in tests Google Play (mises à jour automatiques via le Play Store). */
  androidPlayStore: 'https://play.google.com/apps/testing/com.popcornn.client.mobile',
  /** IPK webOS lite (com.popcorn.client.webos, ouvre client.popcornn.app). */
  webosLite: `${POPCORNN_SITE_URL}/download/webos`,
  /** IPK webOS native (com.popcorn.client.webos.native, UI embarquée). */
  webosNative: `${POPCORNN_SITE_URL}/download/webos-native`,
  /** Desktop (détection OS par User-Agent) / Windows / Linux. */
  desktop: `${POPCORNN_SITE_URL}/download/desktop`,
  windows: `${POPCORNN_SITE_URL}/download/windows`,
  linux: `${POPCORNN_SITE_URL}/download/linux`,
  /** Métadonnées JSON (versions + URLs d'assets) par plateforme. */
  latestJson: `${POPCORNN_SITE_URL}/download/latest.json`,
} as const;

export type AppDownloadPlatform = keyof typeof APP_DOWNLOAD_LINKS;
