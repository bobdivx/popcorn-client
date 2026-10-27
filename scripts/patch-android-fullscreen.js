#!/usr/bin/env node
/**
 * Patch MainActivity.kt (généré par `tauri android init`) : plein écran natif Android.
 *
 * Problème : wry (RustWebChromeClient.onShowCustomView) appelle immédiatement
 * `callback.onCustomViewHidden()` → tout `element.requestFullscreen()` est annulé aussitôt
 * dans la WebView Android (barres système visibles, pas de paysage).
 * RustWebChromeClient.kt est recopié par le build Rust de wry à chaque `tauri android build` :
 * on ne le modifie donc pas, on l'ENVELOPPE depuis MainActivity (délégation de toutes ses
 * surcharges : permissions, sélecteur de fichiers, dialogues JS, console, titre…).
 *
 * Ajouts dans MainActivity :
 *  - onShowCustomView / onHideCustomView réels : la vue plein écran est affichée par-dessus
 *    la WebView (DecorView), mode immersif (barres masquées, réapparition par balayage),
 *    écran maintenu allumé, orientation paysage (capteur) — sauf Android TV —, puis
 *    restauration de l'orientation précédente à la sortie ;
 *  - bouton Retour en plein écran = sortie du plein écran (pas de navigation arrière) ;
 *  - méthode publique `popcornnSetNativeFullscreen(Boolean)` appelée en JNI par la commande
 *    Tauri `set-native-fullscreen` (src-tauri/src/lib.rs) pour le repli CSS de useFullscreen.ts.
 * AndroidManifest : configChanges complété (orientation|screenSize|…) pour que la rotation
 * ne recrée pas l'activité (sinon rechargement de la WebView et arrêt de la lecture).
 *
 * Idempotent. Appelé par scripts/patch-android-manifest.js APRÈS patch-android-tv-webview.js
 * (réutilise son onWebViewCreate s'il existe), ou seul :
 *   node scripts/patch-android-fullscreen.js
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

export const FULLSCREEN_MARKER = 'popcornn-native-fullscreen';

function findFile(dir, fileName) {
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const found = findFile(p, fileName);
      if (found) return found;
    } else if (name === fileName) {
      return p;
    }
  }
  return null;
}

const IMPORTS = [
  'android.app.UiModeManager',
  'android.content.Context',
  'android.content.pm.ActivityInfo',
  'android.content.pm.PackageManager',
  'android.content.res.Configuration',
  'android.graphics.Bitmap',
  'android.graphics.Color',
  'android.net.Uri',
  'android.os.Build',
  'android.os.Message',
  'android.view.View',
  'android.view.ViewGroup',
  'android.view.WindowManager',
  'android.webkit.ConsoleMessage',
  'android.webkit.GeolocationPermissions',
  'android.webkit.JsPromptResult',
  'android.webkit.JsResult',
  'android.webkit.PermissionRequest',
  'android.webkit.ValueCallback',
  'android.webkit.WebChromeClient',
  'android.webkit.WebView',
  'android.widget.FrameLayout',
  'androidx.activity.OnBackPressedCallback',
  'androidx.core.view.WindowCompat',
  'androidx.core.view.WindowInsetsCompat',
  'androidx.core.view.WindowInsetsControllerCompat',
];

const ON_WEBVIEW_CREATE = `
  // ${FULLSCREEN_MARKER} : point d'entrée (pas d'onWebViewCreate existant)
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    popcornnInstallFullscreen(webView)
  }
`;

const ON_WINDOW_FOCUS_CHANGED = `
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Retour d'une autre app / d'un dialogue : les barres système peuvent être réapparues.
    if (hasFocus && popcornnImmersive) popcornnHideSystemBars()
  }
`;

const METHODS = `
  // ${FULLSCREEN_MARKER} : plein écran natif (voir scripts/patch-android-fullscreen.js)
  private var popcornnWebView: WebView? = null
  private var popcornnCustomView: View? = null
  private var popcornnCustomViewCallback: WebChromeClient.CustomViewCallback? = null
  private var popcornnBackCallback: OnBackPressedCallback? = null
  private var popcornnImmersive = false
  private var popcornnSavedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
  private var popcornnSavedCutoutMode = 0

  private fun popcornnInstallFullscreen(webView: WebView) {
    popcornnWebView = webView
    // wry pose son RustWebChromeClient juste APRÈS onWebViewCreate (même tâche du thread UI) :
    // on l'enveloppe à la tâche suivante.
    webView.post { popcornnWrapChromeClient(webView) }
  }

  private fun popcornnWrapChromeClient(webView: WebView) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return // getWebChromeClient() : API 26+
    val current = webView.webChromeClient ?: return
    if (current is PopcornnFullscreenChromeClient) return
    webView.webChromeClient = PopcornnFullscreenChromeClient(current)
  }

  /** Appelée en JNI par la commande Tauri « set-native-fullscreen » (thread quelconque). */
  fun popcornnSetNativeFullscreen(enabled: Boolean) {
    runOnUiThread {
      if (enabled) {
        popcornnSetImmersive(true)
      } else if (popcornnCustomView == null) {
        // Avec une vue plein écran Web active, la sortie passe par onHideCustomView
        // (document.exitFullscreen côté JS) : rien à faire ici.
        popcornnSetImmersive(false)
      }
    }
  }

  private fun popcornnIsTelevisionDevice(): Boolean {
    val uiModeManager = getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
    if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) return true
    return packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
  }

  private fun popcornnHideSystemBars() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }

  private fun popcornnSetImmersive(enabled: Boolean) {
    if (enabled) {
      if (!popcornnImmersive) {
        popcornnImmersive = true
        popcornnSavedOrientation = requestedOrientation
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          popcornnSavedCutoutMode = window.attributes.layoutInDisplayCutoutMode
          val attrs = window.attributes
          attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
          window.attributes = attrs
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (!popcornnIsTelevisionDevice()) {
          requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
      }
      popcornnHideSystemBars()
    } else {
      if (!popcornnImmersive) return
      popcornnImmersive = false
      WindowCompat.getInsetsController(window, window.decorView)
        .show(WindowInsetsCompat.Type.systemBars())
      window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val attrs = window.attributes
        attrs.layoutInDisplayCutoutMode = popcornnSavedCutoutMode
        window.attributes = attrs
      }
      requestedOrientation = popcornnSavedOrientation
    }
    popcornnUpdateBackCallback()
  }

  private fun popcornnUpdateBackCallback() {
    val active = popcornnImmersive || popcornnCustomView != null
    if (!active) {
      popcornnBackCallback?.isEnabled = false
      return
    }
    // (Ré)enregistré à chaque entrée : le dernier ajouté est prioritaire sur le callback
    // de l'AppPlugin Tauri (retour WebView / évènement back-button), quel que soit son ordre d'init.
    val callback = popcornnBackCallback ?: object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        popcornnExitFromBack()
      }
    }.also { popcornnBackCallback = it }
    callback.remove()
    callback.isEnabled = true
    onBackPressedDispatcher.addCallback(this, callback)
  }

  private fun popcornnShowCustomView(view: View, callback: WebChromeClient.CustomViewCallback) {
    if (popcornnCustomView != null) {
      callback.onCustomViewHidden()
      return
    }
    val decor = window.decorView as? FrameLayout
    if (decor == null) {
      callback.onCustomViewHidden()
      return
    }
    popcornnCustomView = view
    popcornnCustomViewCallback = callback
    view.setBackgroundColor(Color.BLACK)
    decor.addView(
      view,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    )
    popcornnSetImmersive(true)
  }

  private fun popcornnHideCustomView() {
    val view = popcornnCustomView ?: return
    popcornnCustomView = null
    (window.decorView as? FrameLayout)?.removeView(view)
    val callback = popcornnCustomViewCallback
    popcornnCustomViewCallback = null
    popcornnSetImmersive(false)
    callback?.onCustomViewHidden()
  }

  private fun popcornnExitFromBack() {
    if (popcornnCustomView != null) {
      // Fait sortir le document du plein écran → fullscreenchange côté JS.
      popcornnHideCustomView()
      return
    }
    if (popcornnImmersive) {
      popcornnSetImmersive(false)
      // Plein écran « CSS » (repli) : prévenir useFullscreen.ts pour qu'il nettoie son état.
      popcornnWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('popcornn:native-fullscreen-exit'))",
        null
      )
    }
  }

  /** Enveloppe le RustWebChromeClient de wry : seul le plein écran change, le reste est délégué. */
  inner class PopcornnFullscreenChromeClient(private val delegate: WebChromeClient) : WebChromeClient() {
    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
      if (view == null || callback == null) return
      popcornnShowCustomView(view, callback)
    }

    override fun onHideCustomView() {
      popcornnHideCustomView()
    }

    override fun onPermissionRequest(request: PermissionRequest?) = delegate.onPermissionRequest(request)
    override fun onPermissionRequestCanceled(request: PermissionRequest?) = delegate.onPermissionRequestCanceled(request)
    override fun getDefaultVideoPoster(): Bitmap? = delegate.defaultVideoPoster
    override fun getVideoLoadingProgressView(): View? = delegate.videoLoadingProgressView
    override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean =
      delegate.onJsAlert(view, url, message, result)
    override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean =
      delegate.onJsConfirm(view, url, message, result)
    override fun onJsPrompt(view: WebView?, url: String?, message: String?, defaultValue: String?, result: JsPromptResult?): Boolean =
      delegate.onJsPrompt(view, url, message, defaultValue, result)
    override fun onJsBeforeUnload(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean =
      delegate.onJsBeforeUnload(view, url, message, result)
    override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) =
      delegate.onGeolocationPermissionsShowPrompt(origin, callback)
    override fun onGeolocationPermissionsHidePrompt() = delegate.onGeolocationPermissionsHidePrompt()
    override fun onShowFileChooser(
      webView: WebView?,
      filePathCallback: ValueCallback<Array<Uri>>?,
      fileChooserParams: FileChooserParams?
    ): Boolean = delegate.onShowFileChooser(webView, filePathCallback, fileChooserParams)
    override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean = delegate.onConsoleMessage(consoleMessage)
    override fun onReceivedTitle(view: WebView?, title: String?) = delegate.onReceivedTitle(view, title)
    override fun onReceivedIcon(view: WebView?, icon: Bitmap?) = delegate.onReceivedIcon(view, icon)
    override fun onProgressChanged(view: WebView?, newProgress: Int) = delegate.onProgressChanged(view, newProgress)
    override fun onCreateWindow(view: WebView?, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message?): Boolean =
      delegate.onCreateWindow(view, isDialog, isUserGesture, resultMsg)
    override fun onCloseWindow(window: WebView?) = delegate.onCloseWindow(window)
    override fun onRequestFocus(view: WebView?) = delegate.onRequestFocus(view)
    override fun getVisitedHistory(callback: ValueCallback<Array<String>>?) = delegate.getVisitedHistory(callback)
  }
`;

const CONFIG_CHANGES_REQUIRED = [
  'orientation',
  'screenSize',
  'screenLayout',
  'smallestScreenSize',
  'keyboardHidden',
];

/** Ajoute les configChanges nécessaires à l'activité principale (rotation sans recréation). */
export function patchManifestConfigChanges(content) {
  const activityRe = /<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>/s;
  const m = content.match(activityRe);
  if (!m) return { content, changed: false, reason: 'activité MainActivity introuvable' };
  const tag = m[0];
  let newTag;
  const ccRe = /android:configChanges="([^"]*)"/;
  const cc = tag.match(ccRe);
  if (cc) {
    const current = cc[1].split('|').map((s) => s.trim()).filter(Boolean);
    const missing = CONFIG_CHANGES_REQUIRED.filter((v) => !current.includes(v));
    if (!missing.length) return { content, changed: false };
    newTag = tag.replace(ccRe, `android:configChanges="${[...current, ...missing].join('|')}"`);
  } else {
    newTag = tag.replace(/<activity\b/, `<activity android:configChanges="${CONFIG_CHANGES_REQUIRED.join('|')}"`);
  }
  return { content: content.replace(tag, newTag), changed: true };
}

/** Transforme le source Kotlin de MainActivity (pur, testable). */
export function patchMainActivitySource(src) {
  if (src.includes(FULLSCREEN_MARKER)) return { src, changed: false };

  const pkgMatch = src.match(/^\s*package\s+([\w.]+)\s*$/m);
  if (!pkgMatch) throw new Error('package introuvable dans MainActivity.kt');

  const missing = IMPORTS.filter(
    (imp) => !new RegExp(`^\\s*import\\s+${imp.replace(/\./g, '\\.')}\\s*$`, 'm').test(src)
  );
  if (missing.length) {
    src = src.replace(pkgMatch[0], `${pkgMatch[0]}\n\n${missing.map((i) => `import ${i}`).join('\n')}`);
  }

  const classRe = /class\s+MainActivity\s*:\s*TauriActivity\(\)\s*(\{)?/;
  if (!classRe.test(src)) throw new Error('class MainActivity : TauriActivity() introuvable');

  let methods = METHODS;
  // onWebViewCreate existant (patch TV) : y brancher l'installation juste après super.
  const existingCreate = /(override\s+fun\s+onWebViewCreate\(\s*(\w+)\s*:\s*WebView\s*\)\s*\{[^\n]*\n)([ \t]*)(super\.onWebViewCreate\(\s*\2\s*\)[^\n]*\n)/;
  const ec = src.match(existingCreate);
  if (ec) {
    src = src.replace(existingCreate, `$1$3$4$3popcornnInstallFullscreen($2) // ${FULLSCREEN_MARKER}\n`);
  } else if (/override\s+fun\s+onWebViewCreate\s*\(/.test(src)) {
    throw new Error('onWebViewCreate existant sans appel super reconnu : branchement impossible');
  } else {
    methods = ON_WEBVIEW_CREATE + methods;
  }
  if (!/fun\s+onWindowFocusChanged\s*\(/.test(src)) methods += ON_WINDOW_FOCUS_CHANGED;

  const cm = src.match(classRe);
  if (cm[1]) {
    const lastBrace = src.lastIndexOf('}');
    if (lastBrace < cm.index) throw new Error('accolade fermante de MainActivity introuvable');
    src = `${src.slice(0, lastBrace).replace(/\s*$/, '\n')}${methods}}\n`;
  } else {
    src = src.replace(classRe, `class MainActivity : TauriActivity() {${methods}}`);
  }
  return { src, changed: true };
}

export function patchAndroidFullscreen(projectRoot = process.cwd()) {
  const appMain = join(projectRoot, 'src-tauri', 'gen', 'android', 'app', 'src', 'main');
  const file = findFile(join(appMain, 'java'), 'MainActivity.kt');
  if (!file) {
    throw new Error(`MainActivity.kt introuvable sous ${appMain}/java (lancer tauri android init avant)`);
  }
  const { src, changed } = patchMainActivitySource(readFileSync(file, 'utf-8'));
  if (changed) {
    writeFileSync(file, src, 'utf-8');
    console.log(`🔧 MainActivity patchée (plein écran natif : onShowCustomView, immersif, paysage) : ${file}`);
  } else {
    console.log(`✅ MainActivity déjà patchée (plein écran natif) : ${file}`);
  }

  const manifestPath = join(appMain, 'AndroidManifest.xml');
  if (existsSync(manifestPath)) {
    const res = patchManifestConfigChanges(readFileSync(manifestPath, 'utf-8'));
    if (res.changed) {
      writeFileSync(manifestPath, res.content, 'utf-8');
      console.log('🔧 AndroidManifest : configChanges complété (rotation sans recréation de l\'activité)');
    } else if (res.reason) {
      console.warn(`⚠️ AndroidManifest : ${res.reason} (configChanges non vérifié)`);
    }
  }
  return file;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    patchAndroidFullscreen();
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
