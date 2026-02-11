# Matrice E2E lecture / seek (lecteur HLS multi-plateformes)

## Objectif

Valider la lecture et le seek sur toutes les cibles (Web, Tauri, TV) et pour chaque type de source (local_, UNC, ami, torrent).

## Observabilité client

Le lecteur émet des événements personnalisés `popcorn-playback` sur `window` pour chaque étape :

- `source_selected` : source et mode (direct / hls)
- `seek_native` : seek sans reload backend (position en secondes)
- `seek_reload` : seek avec reload backend (force_vod + seek=)
- `retry_503` : retry après 503/202 (attempt)
- `fallback_direct_to_hls` : bascule direct → HLS
- `fallback_message_shown`
- `error`

Les tests E2E peuvent écouter ces événements pour vérifier le flux sans dépendre des logs.

```ts
window.addEventListener('popcorn-playback', (e: CustomEvent) => {
  const { step, sourceType, mode, position, attempt } = e.detail;
  // ...
});
```

## Plateformes

| Plateforme    | Environnement de test recommandé | Notes                          |
|---------------|-----------------------------------|--------------------------------|
| Web desktop   | Playwright / Vitest (jsdom)       | Même code que Tauri webview    |
| Web mobile    | Playwright (viewport mobile)      | Touch, contrôles adaptés       |
| Tauri desktop | Tauri + WebDriver ou test in-app | Fenêtre native, pas de CORS     |
| TV (WebOS/Android TV) | Device ou émulateur         | Navigation clavier, focus       |

## Cas obligatoires

À valider sur au moins une plateforme par combinaison raisonnable :

1. **Média local (`local_<id>`)**  
   - Lecture démarre, durée affichée.  
   - Seek : natif uniquement (pas de reloadWithSeek).  
   - Pas de 503 en boucle.

2. **UNC / réseau**  
   - Même politique seek que local_ (natif).  
   - Stream direct ou HLS selon disponibilité.

3. **Bibliothèque d’ami (`streamBackendUrl`)**  
   - Toutes les requêtes (playlist, duration, cache) vont vers l’URL ami.  
   - Seek natif uniquement.

4. **Seek**  
   - Avant buffer : seek natif.  
   - Pendant/après buffer (au-delà de ~20 s) : selon `canUseSeekReload` (reload backend pour torrent classique, natif pour local_/UNC/ami).

5. **Reprise position sauvegardée**  
   - Après ouverture d’un média, position restaurée (tmdb ou torrent) dans la marge attendue.

6. **Fallback direct → HLS**  
   - Une seule bascule, message utilisateur affiché, puis lecture HLS.

## Exécution

- **Web** : `npm run test` (Vitest) pour les tests unitaires / intégration ; Playwright à ajouter si besoin pour E2E navigateur.
- **Tauri** : tests in-app ou E2E Tauri quand configurés.
- **TV** : scripts manuels ou CI sur device/émulateur (voir `scripts/android-smoke-test.ps1`, WebOS).
