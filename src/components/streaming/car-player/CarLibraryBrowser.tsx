import { useEffect, useMemo, useState } from 'preact/hooks';
import { Film, Search, Tv } from 'lucide-preact';
import { serverApi } from '../../../lib/client/server-api';
import type { LibraryMedia } from '../../Library';

export interface CarLibraryPick {
  slug: string;
  path?: string | null;
  infoHash?: string | null;
  title: string;
  posterUrl?: string | null;
}

interface CarLibraryBrowserProps {
  onSelect: (pick: CarLibraryPick) => void;
}

type FilterTab = 'all' | 'movie' | 'tv';

function isSeries(item: LibraryMedia): boolean {
  return item.category === 'SERIES' || item.tmdb_type === 'tv' || item.tmdb_type === 'series';
}

function isMovie(item: LibraryMedia): boolean {
  return item.category === 'FILMS' || item.tmdb_type === 'movie' || (!isSeries(item) && !!item.tmdb_id);
}

function displayTitle(item: LibraryMedia): string {
  return (item.name || item.slug || item.info_hash || 'Sans titre').trim();
}

function buildPick(item: LibraryMedia): CarLibraryPick | null {
  const slug = (item.slug || item.info_hash || '').trim();
  if (!slug) return null;
  return {
    slug,
    path: item.download_path || null,
    infoHash: item.info_hash || null,
    title: displayTitle(item),
    posterUrl: item.poster_url || item.hero_image_url || null,
  };
}

export default function CarLibraryBrowser({ onSelect }: CarLibraryBrowserProps) {
  const [items, setItems] = useState<LibraryMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FilterTab>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await serverApi.getLibrary();
        if (cancelled) return;
        if (!res.success) {
          setError(res.message || 'Impossible de charger la bibliothèque.');
          setItems([]);
          return;
        }
        const list = Array.isArray(res.data) ? (res.data as unknown as LibraryMedia[]) : [];
        const playable = list.filter(
          (item) =>
            item &&
            item.exists !== false &&
            !item.__shared &&
            !!(item.download_path || item.info_hash || item.slug),
        );
        setItems(playable);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (tab === 'movie' && !isMovie(item)) return false;
        if (tab === 'tv' && !isSeries(item)) return false;
        if (!q) return true;
        const hay = `${displayTitle(item)} ${item.release_date || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), 'fr', { sensitivity: 'base' }));
  }, [items, query, tab]);

  return (
    <div className="tesla-car-root tesla-car-lib">
      <header className="tesla-car-lib__header">
        <div className="tesla-car-lib__brand">
          <div className="tesla-car-lib__brand-left">
            <p className="tesla-car-lib__eyebrow">Popcornn</p>
            <h1 className="tesla-car-lib__title">Theater</h1>
          </div>
          <a href="/car/probe" className="tesla-car-link-quiet">
            Diagnostic
          </a>
        </div>

        <div className="tesla-car-lib__search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onInput={(e) => setQuery((e.currentTarget as HTMLInputElement).value)}
            placeholder="Rechercher dans la bibliothèque"
            aria-label="Rechercher"
          />
        </div>

        <div className="tesla-car-lib__tabs" role="tablist">
          {(
            [
              ['all', 'Tout'],
              ['movie', 'Films'],
              ['tv', 'Séries'],
            ] as Array<[FilterTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`tesla-car-tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <main className="tesla-car-lib__main">
        {loading && <p className="tesla-car-lib__status">Chargement…</p>}
        {!loading && error && <p className="tesla-car-lib__status is-error">{error}</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="tesla-car-lib__status">Aucun média dans la bibliothèque.</p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <ul className="tesla-car-grid">
            {filtered.map((item) => {
              const title = displayTitle(item);
              const series = isSeries(item);
              return (
                <li key={`${item.info_hash}-${item.download_path || item.slug || title}`}>
                  <button
                    type="button"
                    className="tesla-car-card"
                    onClick={() => {
                      const pick = buildPick(item);
                      if (pick) onSelect(pick);
                    }}
                  >
                    <div className="tesla-car-card__poster">
                      {item.poster_url ? (
                        <img src={item.poster_url} alt="" loading="lazy" />
                      ) : (
                        <div className="tesla-car-card__poster-fallback">
                          {series ? <Tv size={40} strokeWidth={1.25} /> : <Film size={40} strokeWidth={1.25} />}
                        </div>
                      )}
                    </div>
                    <div className="tesla-car-card__meta">
                      <p className="tesla-car-card__name">{title}</p>
                      <p className="tesla-car-card__sub">
                        {series ? 'Série' : 'Film'}
                        {item.release_date ? ` · ${String(item.release_date).slice(0, 4)}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
