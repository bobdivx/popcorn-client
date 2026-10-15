# Configuration des variables d'environnement

## Fichier .env

Créez un fichier `.env` à la racine du projet `popcorn-vercel` avec la configuration suivante :

```env
# URL du serveur Popcorn (OBLIGATOIRE pour le client)
PUBLIC_SERVER_URL=http://10.1.0.86:8080
```

### Pour le développement local

Si votre serveur Popcorn tourne sur une autre machine :

```env
PUBLIC_SERVER_URL=http://VOTRE_IP:8080
```

### Pour la production

```env
PUBLIC_SERVER_URL=https://votre-serveur.com
```

### Chromecast (Styled Media Receiver)

Après enregistrement dans la [Cast Developer Console](https://cast.google.com/publish) :

```env
# Optionnel — défaut code = 3F212CD6 (Styled Media Receiver Popcorn, Cast Console)
PUBLIC_CAST_RECEIVER_APP_ID=3F212CD6
```

Skin URL déclarée dans la console :

`https://client.popcornn.app/cast/receiver.css`

Tant que le statut est **Non publié**, seuls les appareils enregistrés (ex. Google TV) peuvent lancer ce receiver.

## Ports par défaut

- **Serveur Popcorn (backend)** : Port `8080` (par défaut)
- **Client Astro (dev)** : Port `4321` (uniquement pour le développement web)

## Important

- La variable `PUBLIC_SERVER_URL` est injectée dans le build Tauri
- Vous pouvez aussi configurer l'URL du serveur dans l'interface (page Paramètres)
- L'URL configurée dans l'interface a priorité sur la variable d'environnement
