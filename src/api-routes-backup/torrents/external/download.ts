export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { getBackendUrlAsync } from '../../../../lib/backend-url.js';

/**
 * Route proxy pour télécharger un torrent externe
 * Fait un proxy vers le backend Rust /api/torrents/external/download
 */
export const GET: APIRoute = async ({ url, request }) => {
  // Vérifier l'authentification
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Non authentifié' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer les paramètres de la requête
    const requestUrl = new URL(url);
    const torrentUrl = requestUrl.searchParams.get('url');
    const torrentName = requestUrl.searchParams.get('torrentName');
    const indexerId = requestUrl.searchParams.get('indexerId');
    const indexerName = requestUrl.searchParams.get('indexerName');
    const guid = requestUrl.searchParams.get('guid');

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:36',message:'Paramètres reçus dans le proxy Astro',data:{torrentUrl:torrentUrl?.substring(0,100),torrentName,indexerId,indexerName,guid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!torrentUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Le paramètre "url" est requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Construire l'URL du backend avec les paramètres
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = new URL(`${backendUrl}/api/torrents/external/download`);
    backendApiUrl.searchParams.set('url', torrentUrl);
    if (torrentName) {
      backendApiUrl.searchParams.set('torrentName', torrentName);
    }
    if (indexerId) {
      backendApiUrl.searchParams.set('indexerId', indexerId);
    }
    if (indexerName) {
      backendApiUrl.searchParams.set('indexerName', indexerName);
    }
    if (guid) {
      backendApiUrl.searchParams.set('guid', guid);
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:62',message:'URL backend construite avec paramètres',data:{backendUrl,fullUrl:backendApiUrl.toString().substring(0,200),hasIndexerId:!!indexerId,hasIndexerName:!!indexerName,hasGuid:!!guid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    console.log(`[TORRENTS] 📥 Téléchargement torrent externe depuis: ${backendApiUrl.toString()}`);

    // Préparer les headers à transmettre (incluant les headers personnalisés pour le streaming)
    const headersToForward: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    };

    // Transmettre les headers personnalisés si présents
    const forStreaming = request.headers.get('X-For-Streaming');
    if (forStreaming) {
      headersToForward['X-For-Streaming'] = forStreaming;
    }
    const userId = request.headers.get('X-User-ID');
    if (userId) {
      headersToForward['X-User-ID'] = userId;
    }
    const deviceId = request.headers.get('X-Device-ID');
    if (deviceId) {
      headersToForward['X-Device-ID'] = deviceId;
    }
    const downloadType = request.headers.get('X-Download-Type');
    if (downloadType) {
      headersToForward['X-Download-Type'] = downloadType;
    }
    const customPath = request.headers.get('X-Custom-Download-Path');
    if (customPath) {
      headersToForward['X-Custom-Download-Path'] = customPath;
    }

    // Faire la requête vers le backend Rust
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // Timeout de 60 secondes pour le téléchargement
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl.toString(), {
        method: 'GET',
        headers: headersToForward,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:96',message:'Erreur fetch vers backend',data:{error:fetchError instanceof Error ? fetchError.message : String(fetchError),url:backendApiUrl.toString().substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error(`[TORRENTS] Erreur lors de la requête vers ${backendApiUrl.toString()}:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: `Le backend Rust ne répond pas dans les 60 secondes.`,
          }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:109',message:'Réponse backend reçue AVANT parsing',data:{status:response.status,statusText:response.statusText,ok:response.ok,headers:Object.fromEntries(response.headers.entries())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Vérifier le Content-Type de la réponse
    const contentType = response.headers.get('content-type') || '';
    
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:137',message:'Vérification Content-Type réponse backend',data:{status:response.status,contentType,isBittorrent:contentType.includes('bittorrent') || contentType.includes('octet-stream'),isJson:contentType.includes('json')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Si c'est un fichier torrent binaire, le transmettre tel quel
    if (contentType.includes('bittorrent') || contentType.includes('octet-stream') || contentType.includes('application/x-bittorrent')) {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:142',message:'Réponse binaire torrent détectée, transmission directe',data:{contentType,status:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const torrentBlob = await response.blob();
      
      // Copier les headers personnalisés du backend (notamment X-Torrent-Added et X-Torrent-Info-Hash)
      const responseHeaders: HeadersInit = {
        'Content-Type': contentType || 'application/x-bittorrent',
        'Content-Disposition': `attachment; filename="${torrentName || 'torrent'}.torrent"`,
      };
      const torrentAdded = response.headers.get('X-Torrent-Added');
      const torrentInfoHash = response.headers.get('X-Torrent-Info-Hash');
      if (torrentAdded) {
        responseHeaders['X-Torrent-Added'] = torrentAdded;
      }
      if (torrentInfoHash) {
        responseHeaders['X-Torrent-Info-Hash'] = torrentInfoHash;
      }
      
      // Retourner le fichier torrent binaire directement
      return new Response(torrentBlob, {
        status: response.status,
        headers: responseHeaders,
      });
    }
    
    // Sinon, traiter comme JSON (pour les erreurs)
    let responseData;
    try {
      if (!response.ok) {
        // Si ce n'est pas OK, lire le texte pour l'erreur
        const text = await response.text();
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:157',message:'Réponse non-OK, lecture texte',data:{status:response.status,contentType,textPreview:text.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return new Response(
          JSON.stringify({
            success: false,
            error: 'BackendError',
            message: `Le backend a retourné une erreur (status ${response.status}): ${text.substring(0, 200)}`,
          }),
          { status: response.status || 502, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Essayer de parser comme JSON
      responseData = await response.json();
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:170',message:'Réponse backend parsée comme JSON',data:{status:response.status,hasData:!!responseData,error:responseData?.error,message:responseData?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (jsonError) {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'download.ts:173',message:'Erreur parsing JSON réponse backend',data:{status:response.status,error:jsonError instanceof Error ? jsonError.message : String(jsonError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Si ce n'est pas du JSON, essayer de lire le texte
      let text = '';
      try {
        text = await response.text();
      } catch (textError) {
        text = `Erreur lors de la lecture de la réponse: ${textError instanceof Error ? textError.message : String(textError)}`;
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidResponse',
          message: `Le backend a retourné une réponse invalide (status ${response.status}): ${text.substring(0, 200)}`,
        }),
        { status: response.status || 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Retourner la réponse JSON du backend
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[TORRENTS] Erreur lors du téléchargement du torrent externe:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalError',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors du téléchargement du torrent',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
