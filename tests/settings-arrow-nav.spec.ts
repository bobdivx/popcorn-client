import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:4326';

async function focusInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return { tag: 'BODY', text: '', inNav: false, inContent: false, inHeader: false };
    }
    return {
      tag: el.tagName,
      text: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      inNav: Boolean(el.closest('[data-tv-settings-nav]')),
      inContent: Boolean(el.closest('[data-tv-settings-content]')),
      inHeader: Boolean(el.closest('[data-tv-site-header]')),
    };
  });
}

async function gotoSettingsOrSkip(page: Page, path = '/settings') {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  if (/\/login|\/register/.test(page.url())) {
    test.skip(true, 'Session login requise pour tester /settings');
  }
  await page.waitForSelector('[data-tv-settings-container]', { timeout: 12000 });
  await page.waitForSelector('[data-tv-settings-nav] a, [data-tv-settings-nav] button', { timeout: 12000 });
}

test.describe('Settings arrow navigation', () => {
  test('sidebar Down stays in nav until last item', async ({ page }) => {
    await gotoSettingsOrSkip(page);

    const navLinks = page.locator('[data-tv-settings-nav] a, [data-tv-settings-nav] button');
    const navCount = await navLinks.count();
    await navLinks.first().focus();
    expect((await focusInfo(page)).inNav).toBe(true);

    const steps = Math.max(1, Math.min(navCount, 8));
    for (let i = 0; i < steps; i++) {
      await page.keyboard.press('ArrowDown');
      const info = await focusInfo(page);
      if (i < navCount - 1) {
        expect(info.inNav, `Down ${i + 1} should stay in nav, got: ${info.tag} ${info.text}`).toBe(true);
      } else {
        expect(
          info.inNav || info.inContent,
          `Down from last nav item should stay in nav or enter content, got: ${info.tag} ${info.text}`,
        ).toBe(true);
      }
    }
  });

  test('Right from sidebar enters content, Left returns to nav', async ({ page }) => {
    await gotoSettingsOrSkip(page);

    await page.locator('[data-tv-settings-nav] a, [data-tv-settings-nav] button').first().focus();
    await page.keyboard.press('ArrowRight');
    const afterRight = await focusInfo(page);
    const contentFocusable = await page.locator('[data-tv-settings-content] a, [data-tv-settings-content] button').count();
    if (contentFocusable === 0) {
      expect(afterRight.inNav, 'Empty content: Right should keep nav focus').toBe(true);
      return;
    }
    expect(afterRight.inContent, `Right should enter content, got: ${afterRight.text}`).toBe(true);
    expect(afterRight.inNav).toBe(false);

    await page.keyboard.press('ArrowLeft');
    const afterLeft = await focusInfo(page);
    expect(afterLeft.inNav, `Left from content edge should return to nav, got: ${afterLeft.text}`).toBe(true);
  });

  test('overview grid: Left stays on previous card before jumping to sidebar', async ({ page }) => {
    await gotoSettingsOrSkip(page);
    const cards = page.locator('[data-tv-settings-content] [data-settings-card], [data-tv-settings-content] a.sc-nav-link');
    await cards.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const count = await cards.count();
    test.skip(count < 2, 'Pas assez de cartes overview (session guest ou permissions)');

    await cards.nth(1).focus();
    const start = await focusInfo(page);
    expect(start.inContent).toBe(true);

    await page.keyboard.press('ArrowLeft');
    const mid = await focusInfo(page);
    expect(mid.inContent, `Left from 2nd card should stay in content, got nav=${mid.inNav} text=${mid.text}`).toBe(true);
    expect(mid.text).not.toBe(start.text);

    await cards.first().focus();
    await page.keyboard.press('ArrowLeft');
    const toNav = await focusInfo(page);
    expect(toNav.inNav, `Left from first column should go to sidebar, got: ${toNav.text}`).toBe(true);
  });

  test('theme chips: Left/Right stay on the row', async ({ page }) => {
    await gotoSettingsOrSkip(page, '/settings/ui-preferences?sub=theme');
    const chips = page.locator('[data-tv-settings-content] button');
    await chips.first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    const n = await chips.count();
    test.skip(n < 3, 'Pas assez de boutons thème (session guest ou permissions)');

    await chips.nth(n - 2).focus();
    const start = await focusInfo(page);
    expect(start.inContent).toBe(true);

    await page.keyboard.press('ArrowLeft');
    const left = await focusInfo(page);
    expect(left.inContent, `Left on theme row should stay in content, got nav=${left.inNav} ${left.text}`).toBe(true);

    await page.keyboard.press('ArrowRight');
    const right = await focusInfo(page);
    expect(right.inContent).toBe(true);
  });
});
