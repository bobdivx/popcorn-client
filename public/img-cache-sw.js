/*
 * Popcornn — cache d'images durable (affiches, backdrops, logos TMDB et logos de plateformes).
 *
 * Volontairement minimal : ce Service Worker n'intercepte QUE les images image.tmdb.org.
 * Pages, JS, API, flux HLS… ne passent jamais par lui (pas de respondWith, et routage
 * statique « réseau » pour les navigations quand le navigateur le supporte).
 *
 * Pourquoi un cache à part : le cache HTTP du navigateur est partagé avec les segments HLS
 * (servis « immutable » et volumineux) ; sur TV / WebView il est vite évincé et les affiches
 * se rechargent. Le Cache API est un stockage séparé, borné ici en taille et en durée.
 *
 * ES5 uniquement (Chromium webOS / anciens WebView).
 */
// v2 (1.4.23) : purge des copies de la v1 (régression images cassées) — l'activation supprime
// tout cache « popcorn-img-* » différent de IMG_CACHE.
var IMG_CACHE = 'popcorn-img-v2';
var MAX_ENTRIES = 700;
var MAX_BYTES = 80 * 1024 * 1024; // 80 Mo
var TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
var REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // ré-horodater les images encore utilisées (≈ LRU)
var H_TIME = 'x-popcorn-cached-at';
var H_SIZE = 'x-popcorn-size';

self.addEventListener('install', function (event) {
  try {
    // Static routing (Chromium 123+) : les navigations ne réveillent même pas le SW.
    if (event.addRoutes) {
      var routes = [
        [{ condition: { requestMode: 'navigate' }, source: 'network' }],
        // Tout ce qui n'est pas une image (API, segments HLS, scripts…) contourne le SW.
        [{ condition: { not: { requestDestination: 'image' } }, source: 'network' }],
      ];
      routes.forEach(function (r) {
        try {
          event.waitUntil(Promise.resolve(event.addRoutes(r)).catch(function () {}));
        } catch (e) {}
      });
    }
  } catch (e) {}
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then(function (names) {
          return Promise.all(
            names
              .filter(function (n) {
                return n.indexOf('popcorn-img-') === 0 && n !== IMG_CACHE;
              })
              .map(function (n) {
                return caches.delete(n);
              })
          );
        })
        .catch(function () {}),
      self.clients.claim(),
    ])
  );
});

function isTmdbImage(request) {
  if (request.method !== 'GET') return false;
  if (request.headers.get('range')) return false;
  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return false;
  }
  return url.hostname === 'image.tmdb.org' && url.pathname.indexOf('/t/p/') === 0;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!isTmdbImage(request)) return; // tout le reste : comportement réseau normal
  event.respondWith(cacheFirst(request));
});

function cacheFirst(request) {
  var key = request.url;
  return caches
    .open(IMG_CACHE)
    .then(function (cache) {
      return cache.match(key).then(function (hit) {
        // Copie inutilisable (vide, pas une image) : supprimée puis retéléchargée.
        if (hit && !isUsable(hit)) {
          cache.delete(key).catch(function () {});
          hit = null;
        }
        if (hit) {
          var at = Number(hit.headers.get(H_TIME)) || 0;
          var age = Date.now() - at;
          if (age < TTL_MS) {
            if (age > REFRESH_AFTER_MS) touch(cache, key, hit.clone());
            return hit;
          }
          // Expirée : on retélécharge, l'ancienne copie sert de secours hors ligne.
          return fetchAndStore(cache, key).then(
            function (res) {
              return res && res.ok ? res : hit;
            },
            function () {
              return hit;
            }
          );
        }
        // Échec du téléchargement CORS : requête d'origine de la page (comportement sans SW).
        return fetchAndStore(cache, key).then(
          function (res) {
            return res && res.ok ? res : fetch(request);
          },
          function () {
            return fetch(request);
          }
        );
      });
    })
    .catch(function () {
      return fetch(request);
    });
}

function isUsable(res) {
  if (!res || res.status !== 200) return false;
  var type = res.headers.get('Content-Type') || '';
  if (type && type.indexOf('image/') !== 0) return false;
  var size = res.headers.get(H_SIZE);
  return size === null || Number(size) > 0;
}

function stamp(blob, contentType) {
  var headers = new Headers();
  headers.set('Content-Type', contentType || blob.type || 'image/jpeg');
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set(H_TIME, String(Date.now()));
  headers.set(H_SIZE, String(blob.size));
  return new Response(blob, { status: 200, statusText: 'OK', headers: headers });
}

function touch(cache, key, response) {
  response
    .blob()
    .then(function (blob) {
      return cache.put(key, stamp(blob, response.headers.get('Content-Type')));
    })
    .catch(function () {});
}

function fetchCors(key) {
  return fetch(key, { mode: 'cors', credentials: 'omit' }).catch(function () {
    // Image déjà dans le cache HTTP mais chargée sans CORS (avant l'activation du SW) :
    // la copie n'a pas l'en-tête Access-Control-Allow-Origin → on la recharge une fois.
    return fetch(key, { mode: 'cors', credentials: 'omit', cache: 'reload' });
  });
}

function fetchAndStore(cache, key) {
  // CORS (TMDB répond Access-Control-Allow-Origin: *) : réponse lisible, taille réelle,
  // pas de réponse « opaque » (comptée ~7 Mo par Chrome dans le quota).
  return fetchCors(key).then(function (res) {
    if (!res || res.status !== 200 || res.type === 'opaque') return res;
    var type = res.headers.get('Content-Type') || '';
    if (type && type.indexOf('image/') !== 0) return res;
    return res
      .clone()
      .blob()
      .then(function (blob) {
        if (!blob || !blob.size) return;
        return cache.put(key, stamp(blob, type)).then(
          function () {
            scheduleTrim(cache);
          },
          function () {
            // Quota dépassé : purge agressive, l'image est servie quand même.
            return trim(cache, true);
          }
        );
      })
      .then(
        function () {
          return res;
        },
        function () {
          return res;
        }
      );
  });
}

var trimTimer = null;
function scheduleTrim(cache) {
  if (trimTimer) return;
  trimTimer = setTimeout(function () {
    trimTimer = null;
    trim(cache, false);
  }, 5000);
}

/** Supprime les entrées expirées puis les plus anciennes au-delà des plafonds (nombre / octets). */
function trim(cache, aggressive) {
  var maxEntries = aggressive ? Math.floor(MAX_ENTRIES * 0.7) : MAX_ENTRIES;
  var maxBytes = aggressive ? Math.floor(MAX_BYTES * 0.7) : MAX_BYTES;
  return cache
    .keys()
    .then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          return cache.match(k).then(function (r) {
            return {
              key: k,
              at: r ? Number(r.headers.get(H_TIME)) || 0 : 0,
              size: r ? Number(r.headers.get(H_SIZE)) || 0 : 0,
            };
          });
        })
      );
    })
    .then(function (rows) {
      rows.sort(function (a, b) {
        return a.at - b.at;
      });
      var now = Date.now();
      var count = rows.length;
      var total = 0;
      var i;
      for (i = 0; i < rows.length; i++) total += rows[i].size;
      var victims = [];
      for (i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (now - row.at > TTL_MS || count > maxEntries || total > maxBytes) {
          victims.push(row.key);
          count -= 1;
          total -= row.size;
        }
      }
      return Promise.all(
        victims.map(function (k) {
          return cache.delete(k);
        })
      );
    })
    .catch(function () {});
}

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'popcorn-img-cache-clear') {
    event.waitUntil(caches.delete(IMG_CACHE));
  }
  // Page de 1re visite restée non contrôlée (navigation pendant l'installation) : la prendre maintenant.
  if (data.type === 'popcorn-img-claim') {
    event.waitUntil(self.clients.claim().catch(function () {}));
  }
});
