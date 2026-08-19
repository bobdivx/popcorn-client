import { useEffect, useState } from 'preact/hooks';
import { getBackendUrl } from '../../../../lib/backend-url';

interface PlaybackLogsResponse {
  success?: boolean;
  data?: { file_id?: string; lines?: string[]; needles?: string[] };
}

export default function PlaybackLogsPage() {
  const [lines, setLines] = useState<string[]>([]);
  const [title, setTitle] = useState('Logs lecture');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const backend = (params.get('backend') || getBackendUrl() || '').replace(/\/$/, '');
    const q = params.get('q') || params.get('file_id') || '';
    const path = params.get('path') || '';
    const infoHash = params.get('info_hash') || '';
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (path) qs.set('path', path);
    if (infoHash) qs.set('info_hash', infoHash);
    if (!backend) {
      setError('URL backend inconnue');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${backend}/api/local/playback/logs?${qs.toString()}`);
        const json = (await res.json()) as PlaybackLogsResponse;
        if (cancelled) return;
        setTitle(json.data?.file_id || q || 'Logs lecture');
        setLines(json.data?.lines || []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur réseau');
      }
    };
    void load();
    const id = window.setInterval(() => {
      void load();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen bg-page text-white p-4 sm:p-8">
      <h1 className="text-xl font-semibold mb-2">{title}</h1>
      <p className="text-white/50 text-sm mb-4">Logs backend filtrés pour la vidéo en cours (rafraîchi toutes les 4 s).</p>
      {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}
      <pre className="text-xs bg-black/50 border border-white/10 rounded-xl p-4 overflow-auto max-h-[75vh] whitespace-pre-wrap font-mono text-white/80">
        {lines.length ? lines.join('\n') : 'Aucun log pour cette vidéo.'}
      </pre>
    </div>
  );
}
