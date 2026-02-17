# Corrections QA LG Content Store (webOS)

Ce document résume les corrections apportées suite au rejet QA LG (round 1, 2026-01-29, version 1.0.56).

## Défauts traités

### 1. QA2026012917968 – Icône : fond plein (0 % transparence)

**Problème :** *App Icon Background is not a solid color: App Icon Background must be a solid color (0% transparency) which complies with the tile color.*

**Corrections :**
- **CI (GitHub Actions)** : Le workflow `webos-build.yml` génère désormais les icônes avec ImageMagick en plaçant le logo sur un fond plein **#E50914** (couleur tuile Popcorn), sans transparence.
- **Build local** : Le script `scripts/webos/create-icons-solid-bg.mjs` (Node + sharp) génère `webos/icon.png` (80×80) et `webos/icon-large.png` (130×130) avec le même fond plein. Le script `scripts/webos/build.ps1` appelle ce script lors du build.
- **Exécution manuelle** : `node scripts/webos/create-icons-solid-bg.mjs` pour régénérer les icônes à tout moment.

### 2. QA2026012917970 – Document UX Scenario insuffisant

**Problème :** *The description provided for the UX scenario file is insufficient.*

**Corrections :**
- **Fichier** : `webos/UX_Scenario_Popcorn_WebOS.html`
- Ajout d’une section **Document Purpose and Scope**.
- Ajout d’un **tableau récapitulatif des scénarios** (1.1 Summary of Test Scenarios).
- Ajout de la section **8. Detailed Screen Descriptions** (écran par écran : splash, setup, login, home, search, detail, playback).
- Ajout de la section **9. Error Handling and Edge Cases** (réseau indisponible, identifiants invalides, session expirée, contenu vide, comportement du bouton Retour).
- Numérotation mise à jour (Contact = 11, version doc v1.1).

Soumettez le fichier HTML (ou le PDF/PPT exporté) mis à jour dans Seller Lounge avec la prochaine soumission QA.

### 3. QA2026012917969 – Descriptions en russe (loi mars 2026)

**Problème :** *Due to the enforcement of the Russian language enhancement law starting in March 2026 we kindly request our sellers to have their app descriptions translated into Russian if their apps are displayed in Russia.*

**Corrections :**
- **Fichier** : `webos/LG_SELLER_LOUNGE_RU_DESCRIPTIONS.md`
- Contient les textes en **russe** à coller dans Seller Lounge (titre, description courte, description longue).
- À renseigner dans **Seller Lounge > Application > Edit > Descriptions / Localisation** pour la langue **Russe (ru)**.

Aucune modification de code : action manuelle dans le Seller Lounge.

## Prochaines étapes

1. **Rebuild IPK** avec le workflow GitHub (ou `scripts/webos/build.ps1` local) pour obtenir des icônes à fond plein.
2. **Soumettre** le document UX Scenario enrichi (HTML ou export PDF/PPT) dans Seller Lounge avec la prochaine version.
3. **Ajouter** les descriptions en russe dans Seller Lounge (voir `webos/LG_SELLER_LOUNGE_RU_DESCRIPTIONS.md`).
4. **Resoumettre** l’application pour un nouveau round QA.
