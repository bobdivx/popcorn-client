# LG Seller Lounge — automation Popcornn

Scripts Playwright pour mettre à jour l’app `com.popcorn.client.webos` (prodId `1292384`) et suivre la QA.

## Secrets (jamais en git)

```bash
export LG_EMAIL='…'
export LG_PASS='…'
# optionnel
export LG_LOGIN_URL='https://fr.lgemembers.com/lgacc/service/v1/signin?…'
export LG_PROD_ID=1292384
```

## Assets locaux

- Icône store 400×400 opaque : `webos/store-icon-400.png` (fond `#D1C4E9`)
- UX Scenario v1.3 : `webos/UX_Scenario_Popcornn_WebOS_v1.3.zip`
- IPK courant : `com.popcorn.client.webos_1.3.65_all.ipk`  
  (version **> 1.3.64** déjà présente sur Seller Lounge ; 1.2.65 était refusé en downgrade)

## Commandes

```bash
# Régénérer icônes RGB opaques
node scripts/create-webos-icons-solid-bg.mjs

# Packager IPK
npx ares-package /tmp/webos-clean-pkg --no-minify -o .

# Mise à jour + soumission QA (titre, tile, icon, UX, IPK, defects, Confirm)
NODE_PATH=/path/to/playwright/node_modules \
  node scripts/lg-seller-lounge/submit-qa.mjs

# Suivi statut QA
NODE_PATH=/path/to/playwright/node_modules \
  node scripts/lg-seller-lounge/check-qa-status.mjs
```

## Checklist Seller Lounge (résumé)

1. Title = **Popcornn**, tile **#D1C4E9**, icon 400×400 opaque RGB
2. UX Scenario ZIP/PDF v1.3 + Note for Tester
3. IPK version > dernière version listée
4. Defect Info → Resolve (Issue modify) pour chaque Open
5. SUBMIT → cocher les 3 accords → Confirm → « Do you want to request QA? »
