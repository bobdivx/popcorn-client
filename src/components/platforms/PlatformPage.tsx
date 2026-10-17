import { useEffect, useMemo, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import type { ContentItem } from '../../lib/client/types';
import { PageContainer } from '../page-model/PageContainer';
import { CarouselSection } from '../page-model/CarouselSection';
import { TitlePreviewCard } from '../page-model/TitlePreviewCard';
import BrowseRowReveal from '../motion/BrowseRowReveal';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { buildSuggestionUrl } from '../dashboard/utils/highlights';
import {
  loadPlatform,
  loadPlatformRow,
  platformTitleToItem,
  providerLogoUrl,
  type PlatformContentItem,
  type PlatformRowDef,
  type StreamingPlatform,
} from '../../lib/platforms';

/** Rangées chargées en parallèle (le serveur vérifie la disponibilité FR titre par titre). */
const ROW_CONCURRENCY = 4;
/** Rangée masquée sous ce seuil (catalogue trop maigre pour ce genre). */
const MIN_ROW_ITEMS = 4;

interface PlatformPageProps {
  slug: string;
}

type RowState = Record<string, PlatformContentItem[] | null | undefined>;

function badgeFor(item: PlatformContentItem, en: boolean): { label: string; tone: 'ok' | 'neutral' } | null {
  if (item.inLibrary) return { label: en ? 'Available' : 'Disponible', tone: 'ok' };
  if (item.exclusivity === 'original') return { label: 'Original', tone: 'neutral' };
  if (item.exclusivity === 'exclusive') return { label: en ? 'Exclusive' : 'Exclusif', tone: 'neutral' };
  return null;
}

/** Page d'une plateforme : logo, « Exclusivités <Plateforme> » puis carrousels par genre (FR). */
export default function PlatformPage({ slug }: PlatformPageProps) {
  const { language } = useI18n();
  const en = language === 'en';
  const [platform, setPlatform] = useState<StreamingPlatform | null>(null);
  const [rowDefs, setRowDefs] = useState<PlatformRowDef[]>([]);
  const [rows, setRows] = useState<RowState>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setRows({});
    loadPlatform(slug, language)
      .then((meta) => {
        if (cancelled) return;
        if (!meta) {
          setStatus('error');
          return;
        }
        setPlatform(meta.platform);
        setRowDefs(meta.rows);
        setStatus('ready');

        // Chargement progressif des rangées (ordre conservé à l'affichage).
        const queue = [...meta.rows];
        const worker = async () => {
          while (!cancelled && queue.length > 0) {
            const def = queue.shift()!;
            const raw = await loadPlatformRow(slug, def, language);
            if (cancelled) return;
            const items = (raw ?? [])
              .map(platformTitleToItem)
              .filter((x): x is PlatformContentItem => x != null);
            setRows((prev) => ({ ...prev, [def.id]: items }));
          }
        };
        for (let i = 0; i < ROW_CONCURRENCY; i++) void worker();
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug, language]);

  /** Fiche du titre ; on garde l'origine (from/fromP) pour que Retour revienne ici même sans historique. */
  const handleNavigate = (item: ContentItem) => {
    const url = buildSuggestionUrl(item, 'plateformes');
    const extra = [/[?&]from=/.test(url) ? '' : 'from=plateformes', `fromP=${encodeURIComponent(slug)}`]
      .filter(Boolean)
      .join('&');
    window.location.href = `${url}${url.includes('?') ? '&' : '?'}${extra}`;
  };

  const exclusives = rows['exclusives'] ?? [];
  const heroItems = useMemo(
    () => exclusives.filter((i) => Boolean(i.backdrop)).slice(0, 6),
    [exclusives]
  );

  /** Rangées chargées et suffisamment fournies, dans l'ordre défini par le serveur. */
  const visibleRows = useMemo(() => {
    const out: Array<{ def: PlatformRowDef; items: PlatformContentItem[] }> = [];
    for (const def of rowDefs) {
      const items = rows[def.id];
      if (!items) continue;
      if (items.length >= (def.kind === 'exclusives' ? 1 : MIN_ROW_ITEMS)) out.push({ def, items });
    }
    return out;
  }, [rowDefs, rows]);

  const pendingRows = rowDefs.filter((d) => rows[d.id] === undefined).length;
  const name = platform?.name ?? '';
  const logo = providerLogoUrl(platform?.logo_path, 'w300');

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page="plateforme" data-tv-back-href="/plateformes/">
        <div className="pt-4 sm:pt-6">
          <TorrentCardsShadowLoader rows={3} showHero />
        </div>
      </div>
    );
  }

  if (status === 'error' || !platform) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center" data-page="plateforme" data-tv-back-href="/plateformes/">
        <h1 className="text-2xl font-bold mb-3 text-white">
          {en ? 'This platform is unavailable.' : 'Cette plateforme est indisponible.'}
        </h1>
        <a href="/plateformes/" className="text-[var(--ed-accent,#f2545b)] hover:opacity-80 font-medium" tabIndex={0} data-focusable data-tv-initial-focus>
          {en ? 'Back to platforms' : 'Retour aux plateformes'}
        </a>
      </div>
    );
  }

  return (
    <PageContainer
      pageId={`plateforme-${slug}`}
      heroItems={heroItems}
      onHeroPlay={handleNavigate}
      onHeroPrimaryAction={handleNavigate}
      heroPrimaryButtonLabel={en ? 'Open' : 'Voir la fiche'}
    >
      {/* Retour télécommande sans historique (lien direct) → grille des plateformes */}
      <span hidden aria-hidden="true" data-tv-back-href="/plateformes/" />
      <header className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-6 sm:pt-8 pb-6 tv:pb-8">
        <div className="flex items-center gap-4 sm:gap-5 tv:gap-8">
          {logo ? (
            <img
              src={logo}
              alt={name}
              className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 tv:w-32 tv:h-32 rounded-2xl object-cover border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            />
          ) : null}
          <div className="min-w-0">
            <p className="ed-kicker text-[11px] sm:text-xs tv:text-base uppercase tracking-[0.24em] text-[var(--ed-accent,#f2545b)]">
              {en ? 'Streaming · France' : 'Streaming · France'}
            </p>
            <h1 className="ed-title text-3xl sm:text-4xl md:text-5xl tv:text-6xl font-semibold tracking-[0.02em] text-white truncate">
              {name}
            </h1>
            <span className="ed-rule block mt-3 h-px w-16 tv:w-24 bg-[var(--ed-accent,#f2545b)]/80" aria-hidden />
          </div>
        </div>
      </header>

      <div className="pb-8 tv:pb-12 pt-1 overflow-visible">
        {visibleRows.map(({ def, items }) => (
          <BrowseRowReveal key={def.id} rowId={`platform-${slug}-${def.id}`}>
            <CarouselSection title={def.title}>
              {items.map((item) => {
                const badge = badgeFor(item, en);
                return (
                  <TitlePreviewCard
                    key={`${def.id}:${item.id}`}
                    item={item}
                    onNavigate={handleNavigate}
                    badge={badge?.label ?? null}
                    badgeTone={badge?.tone ?? 'neutral'}
                  />
                );
              })}
            </CarouselSection>
          </BrowseRowReveal>
        ))}

        {pendingRows > 0 ? (
          <TorrentCardsShadowLoader rows={visibleRows.length === 0 ? 2 : 1} />
        ) : visibleRows.length === 0 ? (
          <section className="mx-4 sm:mx-6 lg:mx-16 tv:mx-24 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
            <p className="text-lg font-semibold text-white">
              {en ? 'No titles found for this platform.' : 'Aucun titre trouvé pour cette plateforme.'}
            </p>
          </section>
        ) : null}

        <p className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-2 text-[11px] tv:text-sm text-white/35 tracking-wide">
          <a href="https://www.justwatch.com/fr" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 hover:underline" tabIndex={-1}>
            {en ? 'Availability data: JustWatch' : 'Données de disponibilité : JustWatch'}
          </a>
          {' · '}
          {en
            ? '“Exclusive” = the only subscription offer in France (approximation).'
            : '« Exclusif » = seule offre d’abonnement en France (approximation).'}
        </p>
      </div>
    </PageContainer>
  );
}
