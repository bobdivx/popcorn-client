/**
 * Ancrage horizontal des tuiles browse : paysage actif toujours au bord gauche.
 * Les rangées courtes (2–3 cartes) n’ont pas assez de scrollWidth sans spacer.
 */

function forceReflow(el: HTMLElement) {
  void el.offsetWidth;
}

/** Spacer final assez large pour pouvoir scroller n’importe quelle carte jusqu’à gauche. */
export function ensureBrowseScrollSpacer(carousel: HTMLElement) {
  let spacer = carousel.querySelector(':scope > [data-browse-scroll-spacer]') as HTMLElement | null;
  if (!spacer) {
    spacer = document.createElement('div');
    spacer.setAttribute('data-browse-scroll-spacer', '');
    spacer.setAttribute('aria-hidden', 'true');
    spacer.style.cssText =
      'flex:0 0 auto;height:1px;pointer-events:none;visibility:hidden;overflow:hidden;';
    carousel.appendChild(spacer);
  }
  // Largeur ≥ viewport : garantit maxScroll même avec 2 cartes
  const needed = Math.ceil(Math.max(carousel.clientWidth, window.innerWidth));
  if (spacer.style.width !== `${needed}px`) {
    spacer.style.width = `${needed}px`;
    forceReflow(carousel);
  }
  return spacer;
}

/**
 * Scroll immédiat pour coller le bord gauche du slot à l’ancre (padding du carrousel).
 * Utilise la somme des largeurs des frères précédents (fiable après expand paysage).
 */
export function reanchorBrowseSlot(slot: HTMLElement) {
  const carousel = slot.closest('[data-carousel]') as HTMLElement | null;
  if (!carousel) return;

  ensureBrowseScrollSpacer(carousel);
  carousel.classList.remove('scroll-smooth');
  carousel.style.scrollBehavior = 'auto';

  const padLeft = parseFloat(getComputedStyle(carousel).paddingLeft) || 0;
  const gapRaw = getComputedStyle(carousel).gap || getComputedStyle(carousel).columnGap || '0';
  const gap = parseFloat(gapRaw) || 0;

  let offset = 0;
  for (const child of Array.from(carousel.children) as HTMLElement[]) {
    if (child === slot) break;
    if (child.hasAttribute('data-browse-scroll-spacer')) continue;
    offset += child.offsetWidth + gap;
  }

  // Cible : bord gauche du slot = padding gauche du carrousel
  let target = offset;
  // Si offsetLeft est fiable (offsetParent ≈ carousel), croiser la mesure
  if (slot.offsetParent === carousel || carousel.contains(slot.offsetParent)) {
    const viaOffset = Math.max(0, slot.offsetLeft - padLeft);
    // Préférer offsetLeft quand il est cohérent (±2px avec la somme)
    if (Math.abs(viaOffset - offset) <= 2) target = viaOffset;
  }

  forceReflow(carousel);
  const maxScroll = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
  const clamped = Math.max(0, Math.min(maxScroll, target));
  carousel.scrollLeft = clamped;

  // 2e passe après layout (expand 16:9 peut arriver 1 frame plus tard)
  requestAnimationFrame(() => {
    ensureBrowseScrollSpacer(carousel);
    let offset2 = 0;
    for (const child of Array.from(carousel.children) as HTMLElement[]) {
      if (child === slot) break;
      if (child.hasAttribute('data-browse-scroll-spacer')) continue;
      offset2 += child.offsetWidth + gap;
    }
    const max2 = Math.max(0, carousel.scrollWidth - carousel.clientWidth);
    const next = Math.max(0, Math.min(max2, offset2));
    if (Math.abs(carousel.scrollLeft - next) >= 1) {
      carousel.scrollLeft = next;
    }
  });
}

/** Rangée entière visible (pas coupée en bas / sous la navbar). */
export function ensureBrowseRowInView(fromEl: HTMLElement) {
  const carousel = fromEl.closest('[data-carousel]') as HTMLElement | null;
  const row = (carousel?.parentElement as HTMLElement | null) || carousel || fromEl;
  const rect = row.getBoundingClientRect();
  const navEl = document.querySelector('nav[data-tv-site-header], nav.navbar-tv, header nav, nav');
  const navBottom = navEl?.getBoundingClientRect().bottom ?? 72;
  const viewBottom = window.innerHeight - 20;

  let dy = 0;
  if (rect.bottom > viewBottom) dy = rect.bottom - viewBottom;
  else if (rect.top < navBottom + 12) dy = rect.top - (navBottom + 12);
  if (Math.abs(dy) < 2) return;

  const main = document.querySelector('main.app-main') as HTMLElement | null;
  if (main && main.scrollHeight > main.clientHeight + 10) {
    main.scrollTop += dy;
  } else {
    window.scrollBy(0, dy);
  }
}
