# Corrections QA LG Content Store (webOS)

## Round 2 — 2026-10-14 (pretest Failed, v1.2.64 → v1.2.65)

Rejet pretest sans détail dans l’email : consulter **Seller Lounge → Application → Edit → Defect Info**.

### Corrections préparées dans le dépôt

1. **Nom de l’app : Popcornn (2 n)**  
   - `webos/appinfo.json` : `title`, `vendor`, `appDescription` → Popcornn  
   - Titres UI sources (`src/pages/**`, layouts) et artefacts `webos/*.html`  
   - UX Scenario + descriptions RU mises à jour  
   - **Action Seller Lounge** : Application Title = **Popcornn** (pas Popcorn)

2. **Icônes fond plein RGB (0 % transparence)**  
   - Script : `scripts/create-webos-icons-solid-bg.mjs`  
   - Fond / tile color : **`#D1C4E9`**  
   - Sortie : `webos/icon.png` (80×80) et `webos/icon-large.png` (130×130) en **PNG RGB** (plus de canal alpha)  
   - Store icon 400×400 : `webos/store-icon-400.png` (à uploader dans Seller Lounge ; exclu de l’IPK)  
   - Aligner la **tile color** Seller Lounge sur `#D1C4E9`

3. **Package IPK allégé**  
   - `webos/.aresignore` exclut docs Seller Lounge, PPT UX, screenshots Play Store, logos hors runtime, `intro.gif`

4. **UX Scenario**  
   - `webos/UX_Scenario_Popcorn_WebOS.html` : marque Popcornn, version app **1.2.65**, date oct. 2026  
   - À resoumettre (HTML ou PDF/PPT) dans Seller Lounge

### Checklist manuelle Seller Lounge avant resoumission

- [ ] Application Title = **Popcornn**
- [ ] Descriptions FR / EN / **RU** (voir `webos/LG_SELLER_LOUNGE_RU_DESCRIPTIONS.md`)
- [ ] App icon 400×400 = `store-icon-400.png` (fond `#D1C4E9`, sans transparence)
- [ ] Tile color = `#D1C4E9`
- [ ] UX Scenario document mis à jour
- [ ] Self-checklist rempli
- [ ] Pays d’affichage configurés (l’email indiquait Available Countries = 0)
- [ ] Compte de test UX Scenario toujours valide
- [ ] Coller le **Defect Info** exact pour toute correction fonctionnelle restante

---

## Round 1 — 2026-01-29 (v1.0.56)

### 1. QA2026012917968 – Icône : fond plein (0 % transparence)

**Problème :** *App Icon Background is not a solid color: App Icon Background must be a solid color (0% transparency) which complies with the tile color.*

**Corrections :** script d’icônes fond `#D1C4E9`, PNG RGB opaque (voir Round 2).

### 2. QA2026012917970 – Document UX Scenario insuffisant

**Corrections :** sections Purpose, summary table, Detailed Screen Descriptions, Error Handling (fichier HTML enrichi).

### 3. QA2026012917969 – Descriptions en russe

**Corrections :** `webos/LG_SELLER_LOUNGE_RU_DESCRIPTIONS.md` (titre désormais **Popcornn**).

## Prochaines étapes

1. Rebuild IPK : `cd webos && ares-package . --no-minify` (après `node scripts/create-webos-icons-solid-bg.mjs` si besoin).
2. Appliquer la checklist Seller Lounge ci-dessus.
3. Coller le Defect Info si de nouveaux défauts fonctionnels apparaissent.
4. Resoumettre pour un nouveau round QA.
