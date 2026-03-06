# Quota artifacts GitHub Actions (build Android)

## Erreur « Artifact storage quota has been hit »

Si le workflow **Android Build (APK + AAB)** échoue avec :

```text
Error: Failed to CreateArtifact: Artifact storage quota has been hit.
Unable to upload any new artifacts. Usage is recalculated every 6-12 hours.
```

le stockage d’artifacts du compte GitHub (Actions + Packages) est saturé.

## Limites selon le plan

| Plan | Stockage artifacts inclus |
|------|---------------------------|
| GitHub Free | 500 Mo |
| GitHub Pro | 1 Go |
| GitHub Team | 2 Go |

Les artifacts, le cache Actions et GitHub Packages **partagent** le même quota.

## Procédure

1. **Lancer le workflow « Clean old artifacts »**  
   Actions → **Clean old artifacts** → **Run workflow** (éventuellement réduire `retention_days`, ex. `3` ou `7`).

2. **Attendre 6 à 12 heures**  
   GitHub recalcule le quota toutes les 6–12 h. L’espace libéré par la suppression n’est pas visible tout de suite.

3. **Relancer le build Android**  
   Une fois le quota mis à jour, relancer le workflow Android Build.

## Réduire l’accumulation

- Le workflow Android utilise **`retention-days: 1`** sur les artifacts pour limiter l’accumulation.
- Le workflow **Clean old artifacts** tourne chaque lundi (cron) et peut être lancé manuellement. Par défaut il supprime les artifacts **plus vieux que 7 jours**.
- Les APK/AAB sont aussi attachés aux **GitHub Releases** ; une fois la release créée, les artifacts peuvent être supprimés tôt.

## Références

- [Billing GitHub Actions – Storage](https://docs.github.com/en/billing/managing-billing-for-github-actions#calculating-minute-and-storage-spending)
- Workflow cleanup : `.github/workflows/cleanup-artifacts.yml`
