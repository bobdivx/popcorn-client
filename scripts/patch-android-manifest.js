import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le manifest Android
// Note: Le chemin part de la racine du projet car le script est exécuté depuis la racine via npm
const manifestPath = path.resolve(process.cwd(), 'src-tauri/gen/android/app/src/main/AndroidManifest.xml');

console.log(`[Android Patch] Looking for AndroidManifest.xml at: ${manifestPath}`);

if (!fs.existsSync(manifestPath)) {
  console.log('[Android Patch] AndroidManifest.xml not found. Skipping patch.');
  console.log('[Android Patch] This is normal if the Android project has not been generated yet.');
  console.log('[Android Patch] Run "npm run tauri android init" or "npm run tauri android build" first.');
  process.exit(0);
}

try {
  let content = fs.readFileSync(manifestPath, 'utf-8');

  if (content.includes('android:usesCleartextTraffic="true"')) {
    console.log('[Android Patch] android:usesCleartextTraffic="true" is already present.');
    process.exit(0);
  }

  // Injecter l'attribut dans la balise <application>
  const appTagRegex = /<application\s+([^>]+)>/;
  const match = content.match(appTagRegex);

  if (match) {
    const newAppTag = `<application ${match[1]} android:usesCleartextTraffic="true">`;
    content = content.replace(match[0], newAppTag);
    fs.writeFileSync(manifestPath, content, 'utf-8');
    console.log('[Android Patch] Successfully added android:usesCleartextTraffic="true" to AndroidManifest.xml');
  } else {
    console.error('[Android Patch] Could not find <application> tag in AndroidManifest.xml');
    process.exit(1);
  }
} catch (error) {
  console.error('[Android Patch] Error reading or writing AndroidManifest.xml:', error);
  process.exit(1);
}
