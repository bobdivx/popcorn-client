/**
 * PROVISOIRE — Labo /car/lab : sous-titres texte rendus en overlay (pas de <track>, bloqué avec <video> en Drive).
 * Serveur : GET …/car.subs.json (pistes, ffprobe) et GET …/car.subs.vtt?track=<index>&seek=<s> (WebVTT progressif,
 * timestamps relatifs au seek, comme car.audio/car.mjpeg).
 */

export interface SubTrack {
  index: number;
  codec: string;
  language: string;
  title: string;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TEXT_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'microdvd', 'subviewer', 'subviewer1']);

export async function fetchSubTracks(listUrl: string, signal?: AbortSignal): Promise<{ tracks: SubTrack[]; imageOnly: number }> {
  const res = await fetch(listUrl, { cache: 'no-store', credentials: 'omit', signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { streams?: Array<{ index: number; codec_name?: string; tags?: Record<string, string> }> };
  const tracks: SubTrack[] = [];
  let imageOnly = 0;
  for (const s of json.streams || []) {
    const codec = (s.codec_name || '').toLowerCase();
    if (!TEXT_CODECS.has(codec)) {
      imageOnly++;
      continue;
    }
    const tags = s.tags || {};
    tracks.push({
      index: s.index,
      codec,
      language: tags.language || tags.LANGUAGE || '',
      title: tags.title || tags.TITLE || '',
    });
  }
  return { tracks, imageOnly };
}

function parseTs(t: string): number {
  const m = t.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return NaN;
  return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
}

function cleanText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Lecture progressive d'un WebVTT : les cues arrivent au fil de l'extraction FFmpeg. */
export class SubtitleStream {
  cues: Cue[] = [];
  error: string | null = null;
  done = false;
  private abort = new AbortController();
  private pending = '';

  constructor(private url: string) {}

  start(): void {
    void this.run();
  }

  stop(): void {
    try {
      this.abort.abort();
    } catch {
      // ignore
    }
  }

  /** Texte à afficher au temps relatif t (s depuis le seek). */
  textAt(t: number): string {
    const out: string[] = [];
    for (const c of this.cues) {
      if (c.start <= t && t < c.end) out.push(c.text);
    }
    return out.join('\n');
  }

  private parseBlocks(final: boolean): void {
    const norm = this.pending.replace(/\r\n?/g, '\n');
    const parts = norm.split(/\n{2,}/);
    this.pending = final ? '' : parts.pop() || '';
    for (const block of parts) {
      const lines = block.split('\n');
      const ti = lines.findIndex((l) => l.includes('-->'));
      if (ti < 0) continue;
      const [a, rest] = lines[ti].split('-->');
      const b = (rest || '').trim().split(/\s+/)[0];
      const start = parseTs(a);
      const end = parseTs(b);
      const text = cleanText(lines.slice(ti + 1));
      if (Number.isFinite(start) && Number.isFinite(end) && text) this.cues.push({ start, end, text });
    }
  }

  private async run(): Promise<void> {
    try {
      const res = await fetch(this.url, { cache: 'no-store', credentials: 'omit', signal: this.abort.signal });
      if (!res.ok || !res.body) {
        this.error = `Sous-titres HTTP ${res.status}`;
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder('utf-8');
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          this.pending += dec.decode(value, { stream: true });
          this.parseBlocks(false);
        }
      }
      this.pending += dec.decode();
      this.parseBlocks(true);
      this.done = true;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        this.error = `Sous-titres : ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }
}
