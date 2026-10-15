# Corrections QA LG Content Store (webOS)

## Round 3 — 2026-10-14 (QA Request soumis)

Après corrections Round 2, re-soumission effectuée via Seller Lounge automation.

| Champ | Valeur |
|-------|--------|
| Title | **Popcornn** |
| Tile | `#D1C4E9` |
| Icon store | `store-icon-400.png` RGB opaque |
| UX Scenario | v1.3 ZIP (+ Note for Tester) |
| IPK | **1.3.65** (`com.popcorn.client.webos_1.3.65_all.ipk`) |
| Defects Round 2 | **Resolved** (Issue modify) |
| Statut Seller Lounge | **QA Request** (Last Submission 2026-10-14) |

Suivi : `scripts/lg-seller-lounge/check-qa-status.mjs` (+ timer cloud `lg-webos-qa-suivi` toutes les 6 h).

> Note version : Seller Lounge avait déjà **1.3.64** ; **1.2.65** était refusé (downgrade). Package soumis = **1.3.65**.

---

## Round 2 — 2026-10-14 (pretest Failed) — Resolved

Source Seller Lounge → Defect Information (`prodId` 1292384, hist 227065).

| Issue ID | Priority | Problem | Status |
|----------|----------|---------|--------|
| **QA2026100724102** | P2 | **App Icon Background is transparent** | Resolved |
| **QA2026100724103** | P2 | **Insufficient UX scenario** | Resolved |

### Corrections dépôt (branche `cursor/webos-qa-popcornn-2c96`)

1. **Marque Popcornn (2 n)** — `webos/appinfo.json` title/vendor, titres UI, UX Scenario, descriptions RU.
2. **Icônes RGB opaque fond `#D1C4E9`** — `scripts/create-webos-icons-solid-bg.mjs`
3. **UX Scenario enrichi v1.3** — `webos/UX_Scenario_Popcorn_WebOS.html` + ZIP Seller Lounge.
4. **`.aresignore`** — exclut docs/PPT/screenshots du package IPK.
5. **`requiredACG: []`** dans `appinfo.json`.
6. Scripts automation : `scripts/lg-seller-lounge/`.

### Rebuild IPK

```bash
node scripts/create-webos-icons-solid-bg.mjs
# package clean (voir .aresignore) puis :
npx ares-package /tmp/webos-clean-pkg --no-minify -o .
```

---

## Round 1 — 2026-01-29 (v1.0.56) — Resolved

| Issue ID | Problem | Status |
|----------|---------|--------|
| QA2026012917968 | App Icon Background is not a solid color… | Resolved |
| QA2026012917970 | UX scenario description insufficient | Resolved |
| QA2026012917969 | Russian language descriptions | Resolved |
