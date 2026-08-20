#!/usr/bin/env node

/**
 * Popcorn CLI — Orchestrateur de build et de développement
 * Centralise la logique des scripts pour alléger le package.json.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === 'help') {
  printHelp();
  process.exit(0);
}

function binPath(name) {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return path.join(ROOT, 'node_modules', '.bin', `${name}${ext}`);
}

/** Exécute un binaire local (node_modules/.bin), jamais npx (évite un Astro isolé du projet). */
function runBin(name, binArgs = [], options = {}) {
  const bin = binPath(name);
  if (!existsSync(bin)) {
    console.error(`\x1b[31m[Popcorn CLI] « ${name} » introuvable. Exécutez « npm install » dans popcorn-client.\x1b[0m`);
    process.exit(1);
  }
  return run(bin, binArgs, options);
}

function run(cmd, args = [], options = {}) {
  console.log(`\x1b[35m[Popcorn CLI]\x1b[0m Exécution : ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT,
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runPS(scriptPath, scriptArgs = []) {
  return run('powershell', ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...scriptArgs]);
}

const commands = {
  // --- Développement ---
  dev: () => runBin('astro', ['dev', '--port', '4326', '--host']),
  'dev:tauri': () => {
    process.env.TAURI_PLATFORM = 'desktop';
    runBin('tauri', ['dev']);
  },
  'dev:clean': () => {
    run('node', ['-e', '"const fs=require(\'fs\'); try { fs.rmSync(\'node_modules/.vite\', { recursive: true, force: true }); } catch(e) {}"']);
    commands.dev();
  },

  // --- Build ---
  build: () => {
    const target = args[1] || 'web';
    const isTV = args.includes('--tv');
    const isDemo = args.includes('--demo');
    const isAAB = args.includes('--aab');

    switch (target) {
      case 'web':
        runBin('astro', ['build']);
        break;
      case 'windows':
        process.env.TAURI_PLATFORM = 'desktop';
        runBin('tauri', ['build', '--target', 'x86_64-pc-windows-msvc']);
        break;
      case 'android':
        const psArgs = [];
        if (isDemo) psArgs.push('-Demo');
        if (isTV) psArgs.push('tv');
        else psArgs.push('mobile');
        if (isAAB) psArgs.push('aab');
        runPS('scripts/android/build/build.ps1', psArgs);
        break;
      case 'ios':
        process.env.TAURI_PLATFORM = 'ios';
        const config = isDemo ? ['-c', 'src-tauri/tauri.ios.conf.json'] : [];
        runBin('tauri', ['ios', 'build', '--ci', ...config]);
        break;
      case 'webos':
        const webosCmd = isDemo ? '-Demo -Native' : '-Native';
        run('powershell', ['-ExecutionPolicy', 'Bypass', '-Command', `"Set-Location (Join-Path (Split-Path (Get-Location)) 'popcorn-tauri'); .\\webos\\scripts\\build.ps1 ${webosCmd}"`]);
        break;
      default:
        console.error(`Cible de build inconnue : ${target}`);
        process.exit(1);
    }
  },

  // --- Installation ---
  install: () => {
    const target = args[1];
    const isTV = args.includes('--tv');
    if (target === 'android') {
      runPS('scripts/android/install/install.ps1', [isTV ? 'tv' : 'mobile']);
    } else {
      console.error('Installation uniquement supportée pour android via ce CLI.');
    }
  },

  // --- Maintenance ---
  clean: () => runPS('scripts/cleanup-artifacts.ps1'),
  setup: () => runPS('scripts/android/setup/setup.ps1'),
  check: () => runPS('scripts/android/setup/check.ps1'),
  test: () => runBin('vitest', ['run']),
  preview: () => runBin('astro', ['preview']),
  smoke: () => {
    const target = args[1] || 'backend';
    if (target === 'backend') {
      run('node', ['scripts/smoke-backend.mjs', '--backend', 'http://127.0.0.1:3000']);
    } else if (target === 'playback') {
      run('node', ['scripts/playback-smoke.mjs', ...args.slice(2)]);
    } else if (target === 'android') {
      const isTV = args.includes('--tv');
      runPS('scripts/android-smoke-test.ps1', ['-Variant', isTV ? 'tv' : 'mobile', '-BackendUrl', 'http://127.0.0.1:3000']);
    }
  },
};

if (commands[command]) {
  commands[command]();
} else {
  console.error(`Commande inconnue : ${command}`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  console.log(`
\x1b[1mPopcorn CLI — Usage:\x1b[0m
  npm run popcorn <commande> [options]

\x1b[1mCommandes :\x1b[0m
  \x1b[32mdev\x1b[0m              Démarrer le serveur Astro (Web)
  \x1b[32mdev:tauri\x1b[0m        Démarrer Tauri en mode Desktop
  \x1b[32mbuild <target>\x1b[0m   Build pour une plateforme :
                   - web (défaut)
                   - windows
                   - android (options: --tv, --demo, --aab)
                   - ios (options: --demo)
                   - webos
  \x1b[32minstall android\x1b[0m  Installer l'APK sur un appareil (--tv pour TV)
  \x1b[32msetup\x1b[0m            Configurer l'environnement Android
  \x1b[32mclean\x1b[0m            Nettoyer les artefacts de build
  \x1b[32mtest\x1b[0m             Lancer les tests unitaires
  \x1b[32msmoke playback\x1b[0m   Smoke lecture HLS (backend + navigateur)
  \x1b[32msmoke playback\x1b[0m   Smoke lecture HLS (backend + navigateur)

\x1b[1mExemples :\x1b[0m
  npm run popcorn build android --tv
  npm run popcorn install android --tv
  npm run popcorn dev
  `);
}
