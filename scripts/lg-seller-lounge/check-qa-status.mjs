#!/usr/bin/env node
/**
 * Suivi QA LG Seller Lounge (Popcornn / com.popcorn.client.webos).
 *
 * Secrets via env uniquement :
 *   LG_EMAIL, LG_PASS
 *   LG_LOGIN_URL (optionnel)
 *   LG_PROD_ID (défaut 1292384)
 *   LG_OUT_DIR (défaut /tmp/lg-qa-status)
 *
 * Exit codes :
 *   0 = statut lu
 *   2 = credentials manquants
 *   3 = erreur login / réseau
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.env.LG_OUT_DIR || '/tmp/lg-qa-status';
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = process.env.LG_EMAIL;
const PASS = process.env.LG_PASS;
const PROD_ID = process.env.LG_PROD_ID || '1292384';
const LOGIN_URL =
  process.env.LG_LOGIN_URL ||
  'https://fr.lgemembers.com/lgacc/service/v1/signin?country=FR&language=fr&svc_code=SVC320&callback_url=https%3A%2F%2Fseller.lgappstv.com%2Fseller%2Fmain%2FsignInEmpUser.lge';

if (!EMAIL || !PASS) {
  console.error('LG_EMAIL / LG_PASS required');
  process.exit(2);
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--no-sandbox'],
});
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.setDefaultTimeout(90000);

try {
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[type="text"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASS);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null),
    page
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
      .first()
      .click(),
  ]);
  await page.waitForTimeout(2000);
  await page.goto(
    'https://seller.lgappstv.com/seller/appmgmt/application/appInfo/RetrieveApplicationList.lge',
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForTimeout(1500);
  await page.locator('#cookiescript_accept').click({ timeout: 3000 }).catch(() => {});

  const listText = await page.innerText('body');
  const statusLines = listText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) =>
      /Popcorn|QA |Last |Draft|Request|Reject|Approved|Submission|Processing|Packaging/i.test(l),
    );

  const defects = await page.evaluate(async (prodId) => {
    async function post(url, data) {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: new URLSearchParams(data).toString(),
        credentials: 'include',
      });
      return r.text();
    }
    const histHtml = await post('/seller/appmgmt/application/appInfo/PopQaHist.do', { prodId });
    const m = histHtml.match(/showFileNote\('(\d+)',\s*'(\d+)'\)/);
    let fileNote = '';
    if (m) {
      fileNote = await post('/seller/appmgmt/appstatus/PopFileNote.do', {
        appId: m[1],
        histNo: m[2],
      });
    }
    return {
      histPlain: histHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
      defectsPlain: fileNote.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
    };
  }, PROD_ID);

  const summary = {
    at: new Date().toISOString(),
    prodId: PROD_ID,
    statusLines,
    qaHistory: defects.histPlain,
    openDefects: defects.defectsPlain,
  };
  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, 'status.txt'), statusLines.join('\n') + '\n\n' + defects.histPlain);
  console.log(JSON.stringify(summary, null, 2));
} catch (err) {
  console.error(err);
  process.exit(3);
} finally {
  await browser.close();
}
