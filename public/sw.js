// Service Worker pour le cache intelligent des segments HLS et assets
// Fonctionne sur Web, Android (via WebView), et WebOS

const CACHE_NAME = 'hls-segments-v3'; // Changé v2 -> v3 pour forcer la mise à jour
const STATIC_CACHE_NAME = 'popcorn-static-v1';
const API_CACHE_NAME = 'popcorn-api-v1';
const SW_VERSION = 'v3'; // Version du Service Worker pour forcer la mise à jour
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB max (réduit pour éviter la saturation)
const SEGMENT_DURATION = 2; // 2 secondes par segment (selon la config FFmpeg)
const BUFFER_SECONDS = 60; // Garder 60 secondes de buffer (30 avant + 30 après la position actuelle)
const MAX_SEGMENTS_TO_KEEP = Math.ceil(BUFFER_SECONDS / SEGMENT_DURATION); // ~30 segments (seulement ce qui est nécessaire)
const API_CACHE_TTL = 60000; // 1 minute pour les réponses API

// Installer le Service Worker
self.addEventListener('install', (event) => {
  console.log(`[SW] Service Worker installé (version ${SW_VERSION})`);
  // Forcer l'activation immédiate et supprimer l'ancien cache
  event.waitUntil(
    Promise.all([
      // Supprimer tous les anciens caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            console.log('[SW] Suppression de l\'ancien cache:', name);
            return caches.delete(name);
          })
        );
      }),
      // Activer immédiatement
      self.skipWaiting()
    ])
  );
});

// Activer le Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activé');
  event.waitUntil(
    Promise.all([
      // Nettoyer les anciens caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE_NAME && name !== API_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Suppression de l\'ancien cache:', name);
              return caches.delete(name);
            })
        );
      }),
      // Forcer l'activation immédiate pour tous les clients
      self.clients.claim().then(() => {
        console.log('[SW] ✅ Service Worker activé pour tous les clients');
        // Notifier tous les clients que le SW est activé
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_ACTIVATED' });
          });
        });
      })
    ])
  );
});

// Intercepter les requêtes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const requestUrl = event.request.url;
  
  // Ne pas intercepter les requêtes cross-origin (sauf si nécessaire)
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // CRITIQUE: Ne PAS intercepter les requêtes API du tout - sortir AVANT tout traitement
  // Car les requêtes vers /api/local/stream/.../playlist.m3u8 doivent passer par le proxy Astro
  // Si on intercepte même sans event.respondWith(), le navigateur peut bloquer la requête
  // En sortant immédiatement (return), le Service Worker n'intercepte pas du tout la requête
  if (url.pathname.startsWith('/api/')) {
    return; // Sortir immédiatement - le Service Worker n'intercepte pas cette requête
  }
  
  // CRITIQUE: Ne pas intercepter les modules internes d'Astro et Vite
  // Ces modules sont nécessaires pour l'hydratation et les imports dynamiques
  if (url.pathname.startsWith('/@id/') || 
      url.pathname.startsWith('/@vite/') || 
      url.pathname.startsWith('/@astro/') ||
      url.pathname.includes('@id/') ||
      url.pathname.includes('@vite/') ||
      url.pathname.includes('@astro/') ||
      url.pathname.includes('before-hydration') ||
      url.pathname.includes('astro:scripts')) {
    return; // Ne pas intercepter les modules Astro/Vite
  }
  
  // IMPORTANT: Ne pas intercepter les fichiers TypeScript/JavaScript source
  // Les fichiers dans /src/, /node_modules/, ou commençant par /@ sont des fichiers source
  // Seulement intercepter les vrais segments HLS .ts (segment_0.ts, segment_1.ts, etc.)
  const isSourceFile = url.pathname.includes('/src/') || 
                       url.pathname.includes('/node_modules/') || 
                       url.pathname.startsWith('/@') ||
                       url.pathname.endsWith('.tsx') ||
                       (url.pathname.endsWith('.ts') && !url.pathname.includes('segment_') && !url.pathname.match(/\/\d+\.ts$/));
  
  if (isSourceFile) {
    return; // Ne pas intercepter les fichiers source
  }
  
  // Log seulement les requêtes importantes pour debug (pas toutes les requêtes)
  // Désactiver les logs verbeux en production
  const shouldLog = url.pathname.includes('segment_') || url.pathname.endsWith('.m3u8');
  if (shouldLog) {
    console.log('[SW] 🔍 Requête HLS interceptée:', {
      method: event.request.method,
      pathname: url.pathname,
      timestamp: new Date().toISOString()
    });
  }
  
  // Segments HLS (seulement pour les requêtes NON-API et NON-source)
  // Les requêtes vers /api/.../playlist.m3u8 sont déjà traitées comme API ci-dessus
  // Les fichiers source sont déjà exclus ci-dessus
  const isHlsSegment = url.pathname.endsWith('.ts') && (url.pathname.includes('segment_') || url.pathname.match(/\/\d+\.ts$/));
  const isHlsPlaylist = url.pathname.endsWith('.m3u8');
  
  if (isHlsSegment || isHlsPlaylist) {
    console.log('[SW] 🎬 Requête HLS détectée, redirection vers handleHLSRequest');
    event.respondWith(handleHLSRequest(event.request));
    return;
  }
  
  // Assets statiques (CSS, JS, images)
  if (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp')
  ) {
    event.respondWith(handleStaticRequest(event.request));
    return;
  }
  
  // Pages HTML (network first)
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(handlePageRequest(event.request));
    return;
  }
  
  console.log('[SW] ⏭️ Requête non interceptée (pas de pattern correspondant):', requestUrl);
});

async function handleHLSRequest(request) {
  const url = new URL(request.url);
  console.log('[SW] 🎬 handleHLSRequest:', {
    method: request.method,
    url: request.url,
    pathname: url.pathname,
    timestamp: new Date().toISOString()
  });
  
  const cache = await caches.open(CACHE_NAME);
  
  // Ne pas mettre en cache les requêtes HEAD ou POST (l'API Cache ne les supporte pas)
  if (request.method !== 'GET') {
    // Pour HEAD et POST, passer directement au réseau sans cache
    console.log('[SW] 📤 Requête HEAD/POST, passage direct au réseau:', request.url);
    const startTime = Date.now();
    try {
      const response = await fetch(request);
      const elapsed = Date.now() - startTime;
      console.log('[SW] 📥 Réponse reçue après', elapsed, 'ms:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });
      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error('[SW] ❌ Erreur lors de la requête HEAD/POST après', elapsed, 'ms:', error);
      throw error;
    }
  }
  
  // Pour les playlists (.m3u8), toujours aller au réseau, NE JAMAIS mettre en cache.
  // Les playlists contiennent des URLs de segments avec file_id ; un cache obsolète
  // servirait un ancien file_id → 404 sur les segments → bufferStalledError.
  if (url.pathname.endsWith('.m3u8')) {
    try {
      return await fetch(request);
    } catch (error) {
      const cachedResponse = await cache.match(request);
      if (cachedResponse) return cachedResponse;
      throw error;
    }
  }
  
  // Pour les segments (.ts), utiliser le cache d'abord
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Vérifier si le cache est toujours valide avec une requête conditionnelle
    try {
      const networkResponse = await fetch(request, {
        headers: {
          'If-None-Match': cachedResponse.headers.get('ETag') || '',
        },
      });
      
      if (networkResponse.status === 304) {
        // Le cache est toujours valide
        return cachedResponse;
      }
      
      if (networkResponse.ok) {
        // Mettre à jour le cache
        cache.put(request, networkResponse.clone());
        return networkResponse;
      }
    } catch (error) {
      // Si le réseau échoue, utiliser le cache
      console.log('[SW] Réseau indisponible, utilisation du cache:', error);
      return cachedResponse;
    }
  }
  
  // Si pas dans le cache, récupérer depuis le réseau
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Mettre en cache seulement si on a de la place
      const cacheSize = await getCacheSize(cache);
      if (cacheSize < MAX_CACHE_SIZE) {
        cache.put(request, networkResponse.clone());
      } else {
        // Nettoyer le cache avant d'ajouter
        await cleanOldSegments(cache);
        cache.put(request, networkResponse.clone());
      }
    }
    return networkResponse;
  } catch (error) {
    // Si le réseau échoue et qu'on a un cache, l'utiliser
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Nettoyer les anciens segments pour garder seulement ceux nécessaires
async function cleanOldSegments(cache) {
  const keys = await cache.keys();
  const segments = keys.filter((key) => key.url.endsWith('.ts'));
  
  if (segments.length <= MAX_SEGMENTS_TO_KEEP) {
    return; // Pas besoin de nettoyer
  }
  
  // Trier par URL (les segments sont numérotés)
  segments.sort((a, b) => {
    const aNum = extractSegmentNumber(a.url);
    const bNum = extractSegmentNumber(b.url);
    return aNum - bNum;
  });
  
  // Garder seulement les N derniers segments (les plus récents)
  // Supprimer tous les segments plus anciens pour éviter la saturation mémoire
  const toDelete = segments.slice(0, segments.length - MAX_SEGMENTS_TO_KEEP);
  await Promise.all(toDelete.map((key) => cache.delete(key)));
  
  console.log(`[SW] 🧹 ${toDelete.length} segments supprimés du cache (${segments.length} -> ${MAX_SEGMENTS_TO_KEEP})`);
  
  // Vérifier aussi la taille totale du cache
  const cacheSize = await getCacheSize(cache);
  if (cacheSize > MAX_CACHE_SIZE) {
    // Si le cache dépasse encore la limite, supprimer les segments les plus anciens
    const remainingSegments = segments.slice(-MAX_SEGMENTS_TO_KEEP);
    const oldestSegments = segments.slice(0, segments.length - MAX_SEGMENTS_TO_KEEP);
    await Promise.all(oldestSegments.map((key) => cache.delete(key)));
    console.log(`[SW] 🧹 Nettoyage supplémentaire: cache de ${(cacheSize / 1024 / 1024).toFixed(2)} MB, suppression de ${oldestSegments.length} segments supplémentaires`);
  }
}

// Extraire le numéro du segment depuis l'URL
function extractSegmentNumber(url) {
  const match = url.match(/segment_(\d+)\.ts/);
  return match ? parseInt(match[1], 10) : 0;
}

// Calculer la taille du cache
async function getCacheSize(cache) {
  const keys = await cache.keys();
  let totalSize = 0;
  
  for (const key of keys) {
    const response = await cache.match(key);
    if (response) {
      const blob = await response.blob();
      totalSize += blob.size;
    }
  }
  
  return totalSize;
}

// Gérer les requêtes d'assets statiques (cache first)
async function handleStaticRequest(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    // Vérifier en arrière-plan si une nouvelle version existe
    fetch(request).then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
    }).catch(() => {
      // Ignorer les erreurs réseau
    });
    return cached;
  }
  
  // Si pas en cache, récupérer depuis le réseau
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Retourner une réponse d'erreur si le réseau échoue
    return new Response('Asset non disponible', { status: 503 });
  }
}

// Gérer les requêtes API (stale-while-revalidate)
async function handleAPIRequest(request) {
  const url = new URL(request.url);
  console.log('[SW] 🔌 handleAPIRequest:', {
    method: request.method,
    url: request.url,
    pathname: url.pathname,
    timestamp: new Date().toISOString()
  });
  
  // Ne pas mettre en cache les requêtes HEAD ou POST (l'API Cache ne les supporte pas)
  if (request.method !== 'GET') {
    // Pour HEAD et POST, passer directement au réseau sans cache
    console.log('[SW] 📤 Requête API HEAD/POST, passage direct au réseau:', request.url);
    const startTime = Date.now();
    try {
      const response = await fetch(request);
      const elapsed = Date.now() - startTime;
      console.log('[SW] 📥 Réponse API reçue après', elapsed, 'ms:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });
      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error('[SW] ❌ Erreur lors de la requête API HEAD/POST après', elapsed, 'ms:', error);
      throw error;
    }
  }
  
  const cache = await caches.open(API_CACHE_NAME);
  const cached = await cache.match(request);
  
  // Toujours essayer le réseau en parallèle
  const networkPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      // Mettre en cache avec timestamp dans les headers (seulement pour GET)
      const responseClone = response.clone();
      const newHeaders = new Headers(responseClone.headers);
      newHeaders.set('sw-cache-date', Date.now().toString());
      const responseWithTimestamp = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: newHeaders,
      });
      cache.put(request, responseWithTimestamp);
    }
    return response;
  }).catch(() => {
    // Si le réseau échoue, retourner le cache si disponible
    return cached || new Response('API non disponible', { status: 503 });
  });
  
  // Retourner le cache immédiatement s'il existe, sinon attendre le réseau
  if (cached) {
    // Vérifier l'âge du cache
    const cacheDate = cached.headers.get('sw-cache-date');
    if (cacheDate) {
      const age = Date.now() - parseInt(cacheDate, 10);
      if (age < API_CACHE_TTL) {
        // Cache encore valide, retourner immédiatement
        networkPromise.catch(() => {}); // Ignorer les erreurs réseau
        return cached;
      }
    } else {
      // Pas de timestamp, considérer comme valide pour cette requête
      networkPromise.catch(() => {});
      return cached;
    }
  }
  
  return networkPromise;
}

// Gérer les requêtes de pages (network first)
async function handlePageRequest(request) {
  try {
    // Essayer le réseau d'abord
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Si le réseau échoue, essayer le cache
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    // Sinon, retourner une page offline
    return new Response('Hors ligne', { status: 503 });
  }
}

// Nettoyer le cache API périodiquement
setInterval(async () => {
  const cache = await caches.open(API_CACHE_NAME);
  const keys = await cache.keys();
  const now = Date.now();
  
  for (const key of keys) {
    const response = await cache.match(key);
    if (response) {
      const cacheDate = response.headers.get('sw-cache-date');
      if (cacheDate) {
        const age = now - parseInt(cacheDate, 10);
        if (age > API_CACHE_TTL) {
          await cache.delete(key);
        }
      }
    }
  }
}, 60000); // Toutes les minutes

// Nettoyer le cache HLS périodiquement (plus fréquemment pour éviter la saturation)
setInterval(async () => {
  const cache = await caches.open(CACHE_NAME);
  await cleanOldSegments(cache);
  
  // Vérifier aussi la taille totale du cache
  const cacheSize = await getCacheSize(cache);
  if (cacheSize > MAX_CACHE_SIZE) {
    console.warn(`[SW] ⚠️ Cache HLS trop volumineux: ${(cacheSize / 1024 / 1024).toFixed(2)} MB (limite: ${(MAX_CACHE_SIZE / 1024 / 1024).toFixed(2)} MB)`);
    // Nettoyer plus agressivement
    const keys = await cache.keys();
    const segments = keys.filter((key) => key.url.endsWith('.ts'));
    if (segments.length > MAX_SEGMENTS_TO_KEEP) {
      segments.sort((a, b) => {
        const aNum = extractSegmentNumber(a.url);
        const bNum = extractSegmentNumber(b.url);
        return aNum - bNum;
      });
      // Garder seulement la moitié des segments autorisés
      const toKeep = Math.floor(MAX_SEGMENTS_TO_KEEP / 2);
      const toDelete = segments.slice(0, segments.length - toKeep);
      await Promise.all(toDelete.map((key) => cache.delete(key)));
      console.log(`[SW] 🧹 Nettoyage agressif: ${toDelete.length} segments supprimés`);
    }
  }
}, 30000); // Toutes les 30 secondes (plus fréquent pour éviter la saturation)
