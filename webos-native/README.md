# Popcornn Native (webOS) — beta

App webOS **séparée** de l'app « lite » `com.popcorn.client.webos` (qui ne fait que charger https://client.popcornn.app).

- App id : `com.popcorn.client.webos.native` — titre « Popcornn Native »
- Service JS embarqué : `com.popcorn.client.webos.native.service`

Pourquoi un service ? Les apps webOS packagées tournent en `file://` et y bloquent les `<script type="module">`
(îlots Astro). Le service sert l'UI bundlée (build Astro de `dist/`) sur `http://127.0.0.1:18687`
et le lanceur (`launcher/index.html`) y bascule l'app. Tout est local : aucune UI chargée depuis Internet.
Le backend est celui configuré dans l'app (écran de configuration / réglages serveur), en URL absolue ;
le serveur Popcornn renvoie l'origine en CORS (mirror_request), donc `http://127.0.0.1:18687` est accepté.

Build : workflow `.github/workflows/webos-native.yml` → artefact + pre-release GitHub `webos-native-v<version>`.

Installation (TV en mode développeur) :
```
ares-setup-device            # ajouter la TV (IP, port 9922, passphrase du Developer Mode)
ares-install -d <tv> com.popcorn.client.webos.native_<version>_all.ipk
ares-launch  -d <tv> com.popcorn.client.webos.native
```
Ne touche pas à `com.popcorn.client.webos` (id différent).
