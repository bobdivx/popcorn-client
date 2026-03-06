# Utilisation des Runners GitHub Actions

## Runners disponibles

Les workflows de `popcorn-client` utilisent `runs-on: self-hosted`, ce qui signifie qu'ils peuvent utiliser **n'importe quel runner disponible** :

1. **Runners CasaOS** - Runners configurés sur votre serveur CasaOS
2. **Runners Docker locaux** - Runners configurés sur votre machine locale (via Docker)

## Comment ça fonctionne

Quand un workflow utilise `runs-on: self-hosted`, GitHub Actions :
- **Sélectionne automatiquement** un runner disponible parmi tous les runners en ligne
- Utilise le **premier runner disponible** qui correspond aux critères
- Si un runner est occupé, utilise le suivant disponible

## Workflows consolidés

### Android Mobile Build (`android-mobile-build.yml`)

Ce workflow regroupe les builds APK et AAB en séquence :

1. **Job 1: `build-apk-mobile`** - Build l'APK Mobile
   - S'exécute en premier
   - Utilise `runs-on: self-hosted` (peut utiliser CasaOS ou local)

2. **Job 2: `build-aab-mobile`** - Build l'AAB Mobile
   - S'exécute **après** l'APK (grâce à `needs: build-apk-mobile`)
   - Utilise `runs-on: self-hosted` (peut utiliser CasaOS ou local)

### Android TV Build (`android-tv-build-consolidated.yml`)

Ce workflow regroupe les builds APK et AAB TV en séquence :

1. **Job 1: `build-apk-tv`** - Build l'APK TV
   - S'exécute en premier
   - Utilise `runs-on: self-hosted` (peut utiliser CasaOS ou local)

2. **Job 2: `build-aab-tv`** - Build l'AAB TV
   - S'exécute **après** l'APK (grâce à `needs: build-apk-tv`)
   - Utilise `runs-on: self-hosted` (peut utiliser CasaOS ou local)

## Avantages des workflows consolidés

✅ **Séquence garantie** : Les AAB sont toujours construits après les APK
✅ **Réutilisation des dépendances** : Les deux jobs peuvent partager le même runner si disponible
✅ **Meilleure organisation** : Un seul workflow pour Mobile et un seul pour TV
✅ **Flexibilité** : Peut utiliser n'importe quel runner disponible (CasaOS ou local)

## Workflows existants (à conserver ou supprimer)

Les workflows suivants existent toujours et peuvent être utilisés séparément si nécessaire :

- `android-build.yml` - Build APK Mobile uniquement
- `android-build-aab-mobile.yml` - Build AAB Mobile uniquement
- `android-tv-build.yml` - Build APK TV uniquement
- `android-build-aab-tv.yml` - Build AAB TV uniquement

**Recommandation** : Utiliser les workflows consolidés pour une meilleure organisation.

## Vérifier les runners disponibles

Pour voir tous les runners disponibles :

1. Allez sur https://github.com/bobdivx/popcorn-client/settings/actions/runners
2. Vous devriez voir :
   - Les runners CasaOS (s'ils sont configurés)
   - Le runner Docker local (`docker-runner-client`) avec les labels `docker,local,windows`

## Utilisation avec labels (optionnel)

Si vous voulez forcer l'utilisation d'un runner spécifique, vous pouvez modifier les workflows pour utiliser des labels :

```yaml
# Utiliser uniquement les runners Docker locaux
runs-on: [self-hosted, docker]

# Utiliser uniquement les runners CasaOS
runs-on: [self-hosted, casaos]

# Utiliser n'importe quel runner (par défaut)
runs-on: self-hosted
```

Par défaut, les workflows utilisent `runs-on: self-hosted` sans labels, ce qui permet d'utiliser n'importe quel runner disponible.
