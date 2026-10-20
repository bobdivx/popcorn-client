#!/usr/bin/env node
/**
 * Patch MainActivity.kt (généré par `tauri android init`) pour Android TV / Google TV.
 *
 * Problème : la WebView Android TV expose un viewport CSS de 960×540 (écran 1080p en xhdpi)
 * et, par défaut, wry/Tauri n'active pas useWideViewPort → la meta viewport est ignorée.
 * L'UI TV (pensée pour 1920×1080, comme webOS) s'affichait donc ~2× trop grande.
 *
 * Sur TV uniquement (UiModeManager TELEVISION ou feature leanback) :
 *  - useWideViewPort + loadWithOverviewMode : la meta `width=1920` posée par
 *    src/components/tv/TvViewportScript.astro est respectée et mise à l'échelle de l'écran ;
 *  - textZoom = 100 : pas d'agrandissement du texte par la taille de police système ;
 *  - jeton UA « PopcornnTV/1 » : détection TV fiable côté web, quel que soit le modèle.
 * Téléphones / tablettes : aucun changement.
 *
 * Idempotent. Appelé par scripts/patch-android-manifest.js (étape CI popcorn-tauri), ou seul :
 *   node scripts/patch-android-tv-webview.js
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const MARKER = 'popcornn-tv-webview';

function findMainActivity(dir) {
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const found = findMainActivity(p);
      if (found) return found;
    } else if (name === 'MainActivity.kt') {
      return p;
    }
  }
  return null;
}

const IMPORTS = [
  'android.app.UiModeManager',
  'android.content.Context',
  'android.content.pm.PackageManager',
  'android.content.res.Configuration',
  'android.webkit.WebView',
];

const METHODS = `
  // ${MARKER} : UI TV en 1920×1080 CSS comme webOS (voir scripts/patch-android-tv-webview.js)
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    if (!isPopcornnTelevision()) return
    val settings = webView.settings
    settings.textZoom = 100
    settings.useWideViewPort = true
    settings.loadWithOverviewMode = true
    settings.setSupportZoom(false)
    settings.builtInZoomControls = false
    settings.displayZoomControls = false
    val ua = settings.userAgentString ?: ""
    if (!ua.contains("PopcornnTV")) {
      settings.userAgentString = "$ua PopcornnTV/1"
    }
  }

  private fun isPopcornnTelevision(): Boolean {
    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
    return packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
  }
`;

export function patchAndroidTvWebView(projectRoot = process.cwd()) {
  const javaDir = join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'java');
  const file = findMainActivity(javaDir);
  if (!file) {
    throw new Error(`MainActivity.kt introuvable sous ${javaDir} (lancer tauri android init avant)`);
  }
  let src = readFileSync(file, 'utf-8');
  if (src.includes(MARKER)) {
    console.log(`✅ MainActivity déjà patchée (TV WebView) : ${file}`);
    return file;
  }

  const pkgMatch = src.match(/^\s*package\s+([\w.]+)\s*$/m);
  if (!pkgMatch) throw new Error(`package introuvable dans ${file}`);

  // Imports manquants, juste après la déclaration package.
  const missing = IMPORTS.filter((imp) => !new RegExp(`^\\s*import\\s+${imp.replace(/\./g, '\\.')}\\s*$`, 'm').test(src));
  if (missing.length) {
    src = src.replace(pkgMatch[0], `${pkgMatch[0]}\n\n${missing.map((i) => `import ${i}`).join('\n')}`);
  }

  // Classe avec corps : insérer avant l'accolade fermante finale. Sans corps : en ajouter un.
  const classRe = /class\s+MainActivity\s*:\s*TauriActivity\(\)\s*(\{)?/;
  const cm = src.match(classRe);
  if (!cm) throw new Error(`class MainActivity : TauriActivity() introuvable dans ${file}`);
  if (cm[1]) {
    const lastBrace = src.lastIndexOf('}');
    if (lastBrace < cm.index) throw new Error(`accolade fermante de MainActivity introuvable dans ${file}`);
    src = `${src.slice(0, lastBrace).replace(/\s*$/, '\n')}${METHODS}}\n`;
  } else {
    src = src.replace(classRe, `class MainActivity : TauriActivity() {${METHODS}}`);
  }

  writeFileSync(file, src, 'utf-8');
  console.log(`🔧 MainActivity patchée pour Android TV (viewport 1920, textZoom 100, UA PopcornnTV) : ${file}`);
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    patchAndroidTvWebView();
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
