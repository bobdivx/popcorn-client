// node --test scripts/patch-android-fullscreen.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { patchMainActivitySource, patchManifestConfigChanges, FULLSCREEN_MARKER } from './patch-android-fullscreen.js';

const TEMPLATE = `package com.popcornn.client.mobile

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }
}
`;

const count = (s, needle) => s.split(needle).length - 1;

test('ajoute onWebViewCreate + wrapper sans doublon, idempotent', () => {
  const { src, changed } = patchMainActivitySource(TEMPLATE);
  assert.equal(changed, true);
  assert.equal(count(src, 'override fun onWebViewCreate('), 1);
  assert.equal(count(src, 'popcornnInstallFullscreen(webView)'), 1);
  assert.match(src, /inner class PopcornnFullscreenChromeClient/);
  assert.match(src, /fun popcornnSetNativeFullscreen\(enabled: Boolean\)/);
  assert.match(src, /override fun onWindowFocusChanged/);
  assert.equal(count(src, 'import android.webkit.WebView\n'), 1);
  assert.ok(src.trimEnd().endsWith('}'));
  const again = patchMainActivitySource(src);
  assert.equal(again.changed, false);
  assert.equal(again.src, src);
});

test('se branche dans le onWebViewCreate du patch TV', () => {
  const tv = TEMPLATE.replace(
    /\}\n$/,
    `
  // popcornn-tv-webview
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    if (!isPopcornnTelevision()) return
  }
}
`
  ).replace('import android.os.Bundle', 'import android.os.Bundle\nimport android.webkit.WebView');
  const { src } = patchMainActivitySource(tv);
  assert.equal(count(src, 'override fun onWebViewCreate('), 1);
  assert.match(src, /super\.onWebViewCreate\(webView\)\n\s+popcornnInstallFullscreen\(webView\) \/\/ popcornn-native-fullscreen\n\s+if \(!isPopcornnTelevision\(\)\) return/);
  assert.equal(count(src, 'import android.webkit.WebView\n'), 1);
  assert.ok(src.includes(FULLSCREEN_MARKER));
});

test('classe sans corps', () => {
  const { src } = patchMainActivitySource('package a.b\n\nclass MainActivity : TauriActivity()\n');
  assert.match(src, /class MainActivity : TauriActivity\(\) \{\n[\s\S]*override fun onWebViewCreate[\s\S]*\}$/);
});

test('ne duplique pas onWindowFocusChanged existant', () => {
  const src0 = TEMPLATE.replace(/\}\n$/, '  override fun onWindowFocusChanged(hasFocus: Boolean) {\n    super.onWindowFocusChanged(hasFocus)\n  }\n}\n');
  const { src } = patchMainActivitySource(src0);
  assert.equal(count(src, 'fun onWindowFocusChanged('), 1);
});

test('configChanges complété sans doublon', () => {
  const xml = `<activity\n    android:configChanges="orientation|keyboardHidden|screenSize|locale"\n    android:name=".MainActivity">\n</activity>`;
  const r = patchManifestConfigChanges(xml);
  assert.equal(r.changed, true);
  assert.match(r.content, /android:configChanges="orientation\|keyboardHidden\|screenSize\|locale\|screenLayout\|smallestScreenSize"/);
  assert.equal(patchManifestConfigChanges(r.content).changed, false);
  const none = patchManifestConfigChanges('<activity android:name=".MainActivity">');
  assert.match(none.content, /configChanges="orientation\|screenSize\|screenLayout\|smallestScreenSize\|keyboardHidden"/);
});
