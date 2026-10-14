/* Popcornn Native — service JS webOS.
   Sert l'UI (dossier ./www, build Astro statique) sur le port 18687 (0.0.0.0 : lecture des mesures /__perf depuis le LAN).
   Compatible avec les vieux Node embarqués des TV (ES5, modules natifs uniquement). */
var Service = require('webos-service');
var http = require('http');
var fs = require('fs');
var path = require('path');

var SERVICE_ID = 'com.popcorn.client.webos.native.service';
var PORT = 18687;
var ROOT = path.join(__dirname, 'www');
var service = new Service(SERVICE_ID);
var server = null;
var keepAlive = null;

var TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json'
};

function send(res, status, file) {
  var ext = path.extname(file).toLowerCase();
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { return notFound(res); }
    var headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size };
    headers['Cache-Control'] = file.indexOf(path.sep + '_astro' + path.sep) !== -1 ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(status, headers);
    fs.createReadStream(file).pipe(res);
  });
}
function notFound(res) {
  var f = path.join(ROOT, '404.html');
  fs.stat(f, function (err) {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    send(res, 404, f);
  });
}
function resolveFile(urlPath, cb) {
  var p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (e) { p = urlPath; }
  var full = path.normalize(path.join(ROOT, p));
  if (full.indexOf(ROOT) !== 0) return cb(null);
  fs.stat(full, function (err, st) {
    if (!err && st.isFile()) return cb(full);
    var idx = path.join(full, 'index.html');
    fs.stat(idx, function (e2, st2) {
      if (!e2 && st2.isFile()) return cb(idx);
      var html = full.replace(/\/$/, '') + '.html';
      fs.stat(html, function (e3, st3) { cb(!e3 && st3.isFile() ? html : null); });
    });
  });
}
// Rapports de fluidité (perf.js) : gardés en mémoire, lisibles depuis le LAN pour la mesure.
var perfReports = [];
function handlePerf(req, res) {
  var h = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
  if (req.method === 'POST') {
    var body = '';
    req.on('data', function (c) { if (body.length < 200000) body += c; });
    req.on('end', function () {
      try { perfReports.push(JSON.parse(body)); } catch (e) {}
      if (perfReports.length > 20) perfReports.shift();
      res.writeHead(204, h); res.end();
    });
    return;
  }
  if (req.url.indexOf('clear') !== -1) perfReports = [];
  res.writeHead(200, h); res.end(JSON.stringify(perfReports));
}
function startServer(done) {
  if (server) return done(null);
  server = http.createServer(function (req, res) {
    if (req.url.indexOf('/__popcornn_ping') === 0) {
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      return res.end('ok');
    }
    if (req.url.indexOf('/__perf') === 0 && req.url.indexOf('/__perf.js') !== 0) return handlePerf(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    resolveFile(req.url, function (file) { if (!file) return notFound(res); send(res, 200, file); });
  });
  server.on('error', function (e) {
    if (e && e.code === 'EADDRINUSE') { return done(null); } // déjà lancé par une instance précédente
    server = null; done(e);
  });
  server.listen(PORT, '0.0.0.0', function () { done(null); });
}
function ensureKeepAlive() {
  if (keepAlive || !service.activityManager) return;
  try { service.activityManager.create('popcornnNativeKeepAlive', function (activity) { keepAlive = activity; }); } catch (e) {}
}

service.register('start', function (message) {
  ensureKeepAlive();
  startServer(function (err) {
    if (err) return message.respond({ returnValue: false, errorText: String(err) });
    message.respond({ returnValue: true, port: PORT, url: 'http://127.0.0.1:' + PORT + '/' });
  });
});
service.register('stop', function (message) {
  if (keepAlive && service.activityManager) { try { service.activityManager.complete(keepAlive, function () {}); } catch (e) {} keepAlive = null; }
  if (server) { try { server.close(); } catch (e) {} server = null; }
  message.respond({ returnValue: true });
});
