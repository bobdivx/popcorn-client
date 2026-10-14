# Corrections QA LG Content Store (webOS)

## Round 2 — 2026-10-14 (pretest Failed)

Source Seller Lounge → App QA History → Defect Information (`prodId` 1292384, hist 227065).  
App list title encore **Popcorn** ; package soumis encore listé en **1.0.56** (Last Submission 2026-09-20).

| Issue ID | Priority | Problem | Status |
|----------|----------|---------|--------|
| **QA2026100724102** | P2 | **App Icon Background is transparent** | Open |
| **QA2026100724103** | P2 | **Insufficient UX scenario** | Open |

Note testeur : rejet au **pretest** (pas encore de QA technique fonctionnelle).

### Corrections dépôt (branche `cursor/webos-qa-popcornn-2c96`)

1. **Marque Popcornn (2 n)** — `webos/appinfo.json` title/vendor, titres UI, UX Scenario, descriptions RU.
2. **Icônes RGB opaque fond `#D1C4E9`** — `scripts/create-webos-icons-solid-bg.mjs`  
   - IPK : `webos/icon.png` (80), `webos/icon-large.png` (130)  
   - Store : `webos/store-icon-400.png` (400×400, **à uploader** dans Seller Lounge)
3. **UX Scenario enrichi v1.3** — `webos/UX_Scenario_Popcorn_WebOS.html` (scénarios, critères d’acceptation, mapping télécommande, écrans, erreurs, policy).
4. **`.aresignore`** — exclut docs/PPT/screenshots du package IPK.

### Actions obligatoires Seller Lounge (manuel)

1. **Application Title** = `Popcornn` (pas Popcorn).
2. Remplacer l’**App Icon 400×400** par `webos/store-icon-400.png` (fond plein, 0 % transparence).
3. **Tile color** = `#D1C4E9` (identique au fond icône).
4. Re-uploader le **UX Scenario** HTML (ou export PDF) v1.3.
5. Vérifier descriptions **RU** (`webos/LG_SELLER_LOUNGE_RU_DESCRIPTIONS.md`).
6. Soumettre un **nouvel IPK** (version > 1.0.56, ex. **1.2.65**) — l’historique QA montre encore 1.0.56.
7. Vérifier les **pays d’affichage** (l’email indiquait Available Countries = 0).

### Rebuild IPK

```bash
node scripts/create-webos-icons-solid-bg.mjs
cd webos && ares-package . --no-minify
```

---

## Round 1 — 2026-01-29 (v1.0.56) — Resolved dans Seller Lounge

| Issue ID | Problem | Status |
|----------|---------|--------|
| QA2026012917968 | App Icon Background is not a solid color… | Resolved |
| QA2026012917970 | UX scenario description insufficient | Resolved |
| QA2026012917969 | Russian language descriptions | Resolved |

Le round 2 a rouvert des variantes **icon transparent** + **UX scenario insufficient** : les assets / documents effectivement uploadés le 2026-09-20 n’étaient probablement pas à jour, ou l’icône Store 400×400 restait transparente.
