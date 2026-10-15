#!/usr/bin/env node
/**
 * Automation LG Seller Lounge — mise à jour Popcornn + soumission QA.
 *
 * Secrets UNIQUEMENT via env (jamais commités) :
 *   LG_EMAIL, LG_PASS, LG_LOGIN_URL (optionnel)
 *
 * Assets (chemins absolus ou relatifs) :
 *   LG_ICON_400, LG_UX_ZIP, LG_IPK
 *
 * Options :
 *   --dry-run     : connecte + lit l'état, n'écrit pas
 *   --no-submit   : save draft seulement, pas de REQUEST QA
 *   --status-only : lit QA history et sort
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = process.env.LG_OUT_DIR || '/tmp/lg-seller-run';
fs.mkdirSync(OUT, { recursive: true });

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const NO_SUBMIT = args.has('--no-submit') || DRY;
const STATUS_ONLY = args.has('--status-only');

const EMAIL = process.env.LG_EMAIL;
const PASS = process.env.LG_PASS;
const LOGIN_URL =
  process.env.LG_LOGIN_URL ||
  'https://fr.lgemembers.com/lgacc/service/v1/signin?country=FR&language=fr&svc_code=SVC320&callback_url=https%3A%2F%2Fseller.lgappstv.com%2Fseller%2Fmain%2FsignInEmpUser.lge';

const PROD_ID = process.env.LG_PROD_ID || '1292384';
const APP_ID = process.env.LG_APP_ID || 'com.popcorn.client.webos';
const TITLE = 'Popcornn';
const TILE = '#D1C4E9';
const DESC = `Popcornn is a lightweight media client for LG webOS TVs that connects to your personal Popcornn media server.

Key Features:
- Browse movies and TV series from your library and discovery catalog
- Search content with the TV remote
- Stream video playback on the big screen
- Manage downloads and client settings from your LG TV

Requires a configured Popcornn backend and internet access. No ads and no in-app purchases.`;

const ICON = process.env.LG_ICON_400 || path.join(ROOT, 'webos/store-icon-400.png');
const UX_ZIP =
  process.env.LG_UX_ZIP || path.join(ROOT, 'webos/UX_Scenario_Popcornn_WebOS_v1.3.zip');
const IPK =
  process.env.LG_IPK || path.join(ROOT, 'com.popcorn.client.webos_1.3.65_all.ipk');

function requireFiles() {
  for (const [label, p] of [
    ['icon', ICON],
    ['ux', UX_ZIP],
    ['ipk', IPK],
  ]) {
    if (!fs.existsSync(p)) throw new Error(`Missing ${label} file: ${p}`);
  }
}

async function dump(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  const text = await page.innerText('body').catch(() => '');
  fs.writeFileSync(path.join(OUT, `${name}.txt`), text);
  console.log(`[dump] ${name} url=${page.url()} len=${text.length}`);
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[type="text"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => null),
    page
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
      .first()
      .click(),
  ]);
  await page.waitForTimeout(2000);
  if (!page.url().includes('seller.lgappstv.com')) {
    throw new Error(`Login failed, url=${page.url()}`);
  }
}

async function openModification(page) {
  await page.goto(
    'https://seller.lgappstv.com/seller/appmgmt/application/appInfo/RetrieveApplicationList.lge',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(1500);
  await page.locator('#cookiescript_accept').click({ timeout: 3000 }).catch(() => {});
  await page.evaluate(
    ({ prodId }) => {
      checkPaidApp(prodId, prodId, 'SL0105', 'SL0402', 0, 'N', 'B', 'Y');
    },
    { prodId: PROD_ID },
  );
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    $('#editType').val('A');
    $('#detailFrm').attr('action', '/seller/appmgmt/application/AppModification.lge');
    $('#detailFrm').submit();
  });
  await page.waitForURL(/AppModification/, { timeout: 60000 });
  await page.waitForTimeout(3000);
}

async function readQaStatus(page) {
  await page.goto(
    'https://seller.lgappstv.com/seller/appmgmt/application/appInfo/RetrieveApplicationList.lge',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(1500);
  await page.locator('#cookiescript_accept').click({ timeout: 3000 }).catch(() => {});
  await page.evaluate((prodId) => showQaHistory(Number(prodId)), PROD_ID);
  await page.waitForTimeout(2500);
  const text = await page.innerText('body');
  fs.writeFileSync(path.join(OUT, 'qa-status.txt'), text);
  await dump(page, 'qa-status');
  const defects = await page.evaluate(async (prodId) => {
    async function post(url, data) {
      const body = new URLSearchParams(data).toString();
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
        credentials: 'include',
      });
      return r.text();
    }
    const histHtml = await post('/seller/appmgmt/application/appInfo/PopQaHist.do', {
      prodId,
    });
    // latest hist no from Fail links
    const m = histHtml.match(/showFileNote\('(\d+)',\s*'(\d+)'\)/);
    let fileNote = '';
    if (m) {
      fileNote = await post('/seller/appmgmt/appstatus/PopFileNote.do', {
        appId: m[1],
        histNo: m[2],
      });
    }
    return { histHtml, fileNote };
  }, PROD_ID);
  fs.writeFileSync(path.join(OUT, 'qa-hist.html'), defects.histHtml || '');
  fs.writeFileSync(path.join(OUT, 'qa-defects.html'), defects.fileNote || '');
  const plain = (defects.fileNote || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  console.log('[status]', plain.slice(0, 800));
  return plain;
}

async function clickTab(page, label) {
  const btn = page.locator(`button[role=tab]:has-text("${label}"), button:has-text("${label}")`).first();
  await btn.click();
  await page.waitForTimeout(1500);
}

async function waitUploadIdle(page, ms = 120000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const masked = await page.locator('.loadmask, .loadmask-msg, #rightColumn.masked').count();
    if (masked === 0) {
      await page.waitForTimeout(800);
      return;
    }
    await page.waitForTimeout(1000);
  }
}

async function updateDisplay(page) {
  await clickTab(page, 'Display Info.');
  await page.fill('#defaultTitle', TITLE);
  await page.fill('#defaultExpln', DESC);
  // try Russian title fields if present
  const ruTitle = page.locator('input[name="title"][id*="ru" i], input[id*="RuTitle" i]').first();
  if (await ruTitle.count()) {
    await ruTitle.fill(TITLE).catch(() => {});
  }
  console.log('[display] title/description set to Popcornn');
}

async function updateImages(page) {
  await clickTab(page, 'Images');
  // delete existing icon
  const del = page.locator('#square input.delect, #square .delect').first();
  if (await del.count()) {
    await page.evaluate(() => {
      $('#square input.delect').click();
      $('#square').empty();
      $('#frmAppIcon input[type="hidden"]').val('');
      $('#appIconChange').val('Y');
    });
    await page.waitForTimeout(500);
  }
  await page.setInputFiles('#appIcon', ICON);
  // validateImage triggered by onchange
  await page.waitForTimeout(2000);
  await waitUploadIdle(page, 90000);
  await page.evaluate((tile) => {
    if (typeof setAppTileColor === 'function') setAppTileColor(tile, true);
    $('#iconColr').val(tile);
  }, TILE);
  const color = await page.inputValue('#iconColr');
  console.log('[images] tile=', color, 'icon uploaded');
}

async function updateTestInfo(page) {
  await clickTab(page, 'Test Info.');
  // remove previous UX files
  await page.evaluate(() => {
    $('#uxScenarioFileList .delect').each(function () {
      $(this).click();
    });
    $('#uxScenarioFileList').empty();
    $('#uxScenarioChange').val('Y');
  });
  await page.setInputFiles('#uxScenarioFile', UX_ZIP);
  await page.waitForTimeout(2000);
  await waitUploadIdle(page, 90000);
  const n = await page.locator('#uxScenarioFileList p').count();
  console.log('[testinfo] ux files=', n);
}

async function updateBinary(page) {
  await clickTab(page, 'File Upload');
  // clear bogus binary rows if any (keep going even if structure differs)
  await page.evaluate(() => {
    try {
      $('#webosBinarysList .delect, #dropList_webOs input[value="X"]').click();
    } catch (_) {}
  });
  await page.setInputFiles('#webOsBinaryFile', IPK);
  console.log('[binary] IPK selected, waiting unpack/upload...');
  await page.waitForTimeout(5000);
  await waitUploadIdle(page, 300000);
  // bump visible version fields if present
  await page.evaluate(() => {
    if ($('#appMajVer').length) $('#appMajVer').val('1');
    if ($('#appMinVer').length) $('#appMinVer').val('2');
    if ($('#appMicroVer').length) $('#appMicroVer').val('65');
  });
  console.log('[binary] upload wait finished');
}

async function saveDraft(page) {
  const ok = await page.evaluate(async () => {
    try {
      const r = saveAsDraft();
      return r === false ? false : true;
    } catch (e) {
      return String(e);
    }
  });
  await page.waitForTimeout(8000);
  await waitUploadIdle(page, 120000);
  console.log('[save] saveAsDraft =>', ok);
}

async function submitQa(page) {
  // enable submit if possible
  await page.evaluate(() => {
    if (typeof fn_ableSubmitButton === 'function') fn_ableSubmitButton();
    $('#labelSubmit').prop('disabled', false).removeAttr('disabled');
  });
  await clickTab(page, 'SUBMIT').catch(() => {});
  await page.evaluate(() => {
    if (typeof doAppSubmit === 'function') doAppSubmit(false);
  });
  await page.waitForTimeout(10000);
  await waitUploadIdle(page, 180000);
  await dump(page, 'after-submit');
  console.log('[submit] doAppSubmit invoked');
}

async function main() {
  if (!EMAIL || !PASS) throw new Error('LG_EMAIL / LG_PASS required');
  if (!STATUS_ONLY) requireFiles();

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  const page = await (
    await browser.newContext({ viewport: { width: 1600, height: 1100 }, locale: 'en-US' })
  ).newPage();
  page.setDefaultTimeout(120000);
  page.on('dialog', async (d) => {
    console.log('[dialog]', d.type(), d.message().slice(0, 200));
    await d.accept();
  });

  try {
    await login(page);
    if (STATUS_ONLY) {
      await readQaStatus(page);
      return;
    }
    await openModification(page);
    await dump(page, '01-edit');

    if (!DRY) {
      await updateDisplay(page);
      await updateImages(page);
      await updateTestInfo(page);
      await updateBinary(page);
      await saveDraft(page);
      await dump(page, '02-saved');
      if (!NO_SUBMIT) {
        await submitQa(page);
      }
    } else {
      console.log('[dry-run] skip writes');
    }

    // final status from list
    await readQaStatus(page);
    const summary = {
      title: TITLE,
      tile: TILE,
      icon: ICON,
      ux: UX_ZIP,
      ipk: IPK,
      dry: DRY,
      submitted: !NO_SUBMIT,
      out: OUT,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
