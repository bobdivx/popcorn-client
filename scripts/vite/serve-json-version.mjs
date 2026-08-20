import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const rootVersion = join(root, 'VERSION.json');
const publicVersion = join(root, 'public', 'VERSION.json');
const publicJsonVersion = join(root, 'public', 'json', 'version');

function versionSource() {
  if (existsSync(rootVersion)) return rootVersion;
  if (existsSync(publicVersion)) return publicVersion;
  return null;
}

function readVersionJson() {
  const file = versionSource();
  return file ? readFileSync(file) : null;
}

function copyPublicVersion() {
  const src = versionSource();
  if (!src) return;
  mkdirSync(join(root, 'public', 'json'), { recursive: true });
  copyFileSync(src, publicVersion);
  copyFileSync(src, publicJsonVersion);
}

function isVersionProbe(url) {
  const path = url?.split('?')[0]?.replace(/\/$/, '') || '';
  return path === '/json/version';
}

function handle(req, res, next) {
  if (!isVersionProbe(req.url)) {
    next();
    return;
  }
  const body = readVersionJson();
  if (!body) {
    res.statusCode = 204;
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(body);
}

/**
 * Chrome / Cursor sondent /json/version (protocole DevTools).
 * Sans cette route, Astro compile une page 404 (plusieurs secondes au 1er hit).
 */
export function serveJsonVersion() {
  return {
    name: 'serve-json-version',
    buildStart() {
      copyPublicVersion();
    },
    configureServer(server) {
      copyPublicVersion();
      server.middlewares.use(handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
  };
}
