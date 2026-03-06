# Plan : mode « démo » invisible pour validation webOS, Android et Apple

## Objectif

Permettre aux équipes QA (LG webOS, Google Play, Apple App Store) de **valider l’application sans déployer de serveur Popcorn**. L’utilisateur qui teste doit avoir l’impression d’accéder à un indexeur / catalogue réel ; **aucune mention de « mode démo »** ne doit apparaître dans l’interface.

## Contraintes

- **Pas de serveur Popcorn** : le testeur ne configure pas et n’a pas accès à un backend Rust.
- **Expérience réaliste** : navigation catalogue, recherche, lecture vidéo doivent fonctionner de façon fluide.
- **Invisible** : pas de libellé « démo », « démo mode », « démo » dans l’UI.
- **Un seul flux** : soit l’app utilise le backend utilisateur (URL configurée), soit elle utilise le backend de validation (données simulées ou indexeur légal), sans que le testeur sache qu’il s’agit d’un « mode spécial ».

## Options de données pour le backend de validation

### Option A : Données simulées (recommandée)

- **Backend dédié** (ex. hébergé sur popcorn-web ou un petit service) qui :
  - Expose les **mêmes routes** que le backend Rust (ou un sous-ensemble suffisant).
  - Retourne un **catalogue fixe** (films / séries) avec posters, titres, synopsis, etc. (données type TMDB ou fictives mais crédibles).
  - **Recherche** : filtre ce catalogue (par titre, type) et renvoie des résultats au même format que l’API réelle.
  - **Lecture** : les URLs de stream pointent vers des **vidéos domaine public** (Big Buck Bunny, Sintel, Tears of Steel, etc.) ou un court extrait hébergé par vous.
- **Avantages** : contrôle total, pas de dépendance à un indexeur tiers, contenu 100 % légal et prévisible.
- **Inconvénient** : maintenir un jeu de données et un petit backend « miroir » de l’API client.

### Option B : Indexeur public avec contenu légal

- Utiliser un **indexeur ou API publique** qui fournit des torrents / médias **clairement légaux** (creative commons, domaine public).
- Le backend de validation fait **proxy** vers cet indexeur et adapte les réponses au format attendu par le client.
- **Avantages** : données « réelles », moins de maintenance de catalogue.
- **Inconvénients** : dépendance à un service tiers, disponibilité, conformité juridique selon les pays, et risque que le client affiche des noms d’indexeurs ou des détails qui pourraient sembler « techniques ».

### Recommandation

**Option A (données simulées)** : un backend de validation qui simule un indexeur avec un catalogue fixe et des streams vers des vidéos domaine public. Le testeur ne peut pas distinguer visuellement qu’il s’agit de données simulées.

---

## Architecture proposée

### 1. Backend de validation (« demo backend »)

- **Emplacement possible** : 
  - **popcorn-web** : routes API dédiées (ex. `/api/demo/...` ou un préfixe réservé) qui ne sont utilisées que lorsque le client est en « build store » et pointe vers ce backend.
  - Ou **microservice séparé** (ex. Vercel / Cloudflare Workers) qui expose les mêmes chemins que le client attend.
- **Comportement** :
  - Répond à un **sous-ensemble des routes** utilisées par le client pour le parcours : accueil, recherche, détail, lecture.
  - **Routes à implémenter (alignées sur le client)** :
    - `GET /api/client/health` → `{ "ok": true }` (ou équivalent).
    - `GET /api/torrents/list?category=films|series&sort=popular&limit=20&page=1&skip_indexer=true&lang=...` → liste d’entrées (même structure que le backend Rust).
    - `GET /api/indexers/search?q=...&type=...&lang=...` → résultats de recherche (même structure).
    - `GET /api/torrents/group/:slug` et `GET /api/torrents/group/by-tmdb/:id` → détail d’un film/série.
    - `GET /library` → tableau vide ou quelques éléments cohérents.
    - **Stream** : soit `GET /api/local/stream/.../playlist.m3u8` qui redirige ou proxie vers une URL HLS publique (Big Buck Bunny, etc.), soit le client en mode validation reçoit une URL de stream directe vers une vidéo domaine public.
  - **Catalogue** : JSON statique (films/séries avec `slug`, `tmdbId`, `cleanTitle`, `imageUrl`, `synopsis`, etc.) + recherche = filtre sur ce JSON.
  - **Streaming** : utiliser des URLs publiques HLS ou MP4 (Blender Foundation, etc.) pour que « Play » ouvre bien un lecteur et joue une vidéo.

### 2. Côté client (popcorn-client)

- **Détection du « build store »** :
  - Variable d’environnement ou flag de build (ex. `VITE_STORE_REVIEW=true` ou `VITE_DEMO_BACKEND_URL=https://...`) définie **uniquement** pour les builds soumis aux stores (webOS, Android, Apple).
  - En **dev / build normal** : ce flag n’est pas défini → comportement actuel (URL backend depuis config / localStorage).
- **URL du backend** :
  - Si **build store** et (aucune URL backend configurée **ou** politique « utiliser le backend de validation par défaut ») :  
    `getBackendUrl()` (ou équivalent) retourne l’URL du **backend de validation** (ex. `https://popcorn-vercel.vercel.app` ou une URL dédiée).
  - Sinon : comportement actuel (localStorage, env, défaut 127.0.0.1 / 10.0.2.2).
- **Pas de changement d’UI** : aucun texte « démo », « mode démo », « démo » ; l’utilisateur voit le même écran d’accueil, recherche, détail, lecteur.
- **Wizard de premier lancement** (si présent) :  
  En build store, on peut pré-remplir l’URL du serveur avec l’URL du backend de validation et ne pas afficher le champ (ou le rendre non éditable) pour que le testeur n’ait qu’à valider / continuer. Ou : pas de step « configuration serveur » du tout en build store, connexion directe au backend de validation.

### 3. Authentification

- **Option 1** : Le backend de validation accepte un **compte fixe** (ex. `lg-test@popcorn-app.com` / mot de passe) et renvoie des tokens / user_id comme le vrai backend, pour que le client ne change pas de flux.
- **Option 2** : Backend de validation **sans auth** : les routes catalogue/search/stream ne nécessitent pas de token ; le client en build store ne fait pas d’appel login (ou login factice qui renvoie toujours succès). À adapter selon combien de chemins du client dépendent d’un `user_id` ou token.

Recommandation : **Option 1** (compte fixe) pour limiter les branches spécifiques dans le client.

---

## Par plateforme

| Plateforme   | Build / soumission                    | Comportement souhaité                                      |
|-------------|--------------------------------------|------------------------------------------------------------|
| **webOS**   | Build IPK pour LG Content Store      | Au premier lancement (ou sans config), utiliser le backend de validation ; pas de mention démo. |
| **Android** | Build APK/AAB pour Play Store        | Idem : build « store » → backend de validation par défaut. |
| **Apple**   | Build pour App Store / tvOS          | Idem.                                                      |

Une seule **URL de backend de validation** pour toutes les plateformes (ex. `https://popcorn-vercel.vercel.app` avec préfixe `/api/demo` ou sous-domaine dédié).

---

## Phases d’implémentation suggérées

### Phase 1 : Backend de validation (données simulées)

1. Définir le **format des réponses** pour chaque route utilisée par le client (en s’appuyant sur `server-api/dashboard.ts`, `media.ts`, `library.ts`, et les routes streaming).
2. Créer un **catalogue statique** (10–20 films, 5–10 séries) avec slugs, titres, posters (URLs publiques ou hébergées), synopsis.
3. Implémenter les routes (sur popcorn-web ou microservice) :
   - `GET /api/client/health`
   - `GET /api/torrents/list?...`
   - `GET /api/indexers/search?...`
   - `GET /api/torrents/group/:slug` et `by-tmdb/:id`
   - `GET /library`
4. Pour le **stream** : une route qui renvoie une **redirection 302** ou une **URL directe** vers une vidéo domaine public (HLS ou MP4), ou un proxy court vers celle-ci, pour que le lecteur du client affiche bien une vidéo.

### Phase 2 : Client – build « store » et URL de validation

1. Introduire une **variable de build** (ex. `VITE_STORE_REVIEW` ou `VITE_DEMO_BACKEND_URL`) utilisée uniquement pour les builds webOS / Android / Apple destinés aux stores.
2. Dans **backend-config** (ou équivalent) :  
   - Si build store et (pas d’URL backend en localStorage / pas de config) → retourner l’URL du backend de validation.  
   - Sinon → comportement actuel.
3. Adapter le **wizard de premier lancement** pour les builds store : pré-remplir ou masquer la configuration serveur, et utiliser directement le backend de validation.
4. Vérifier que **nulle part** dans l’UI il n’y a de mention « démo » ou « mode démo ».

### Phase 3 : Builds par plateforme

1. **webOS** : dans le workflow ou script de build, définir `VITE_DEMO_BACKEND_URL=...` (ou équivalent) et s’assurer que l’IPK soumis à LG utilise ce backend par défaut.
2. **Android** : idem pour le build Play Store (variant ou env de build).
3. **Apple** : idem pour le build App Store / tvOS.

### Phase 4 : Tests et QA

1. Tester le parcours complet **sans** serveur Popcorn : lancement → accueil → recherche → détail → lecture.
2. Vérifier que les comptes de test (ex. LG, Google, Apple) documentés dans les notes pour les reviewers pointent bien vers cette expérience (backend de validation).
3. Mettre à jour les **documents UX Scenario** (ex. webOS) et les **notes pour les reviewers** (Android, Apple) pour indiquer qu’aucune configuration serveur n’est requise et que l’app est prête à l’usage après installation.

---

## Données et contenu légal pour la simulation

- **Films / séries** : titres et métadonnées fictives ou issues de TMDB (conformément à leurs conditions d’utilisation) pour un catalogue crédible.
- **Posters** : URLs TMDB (si licence ok) ou images libres de droits / placeholders.
- **Vidéos de lecture** :
  - [Big Buck Bunny](https://peach.blender.org/download/) (CC BY 3.0)
  - [Sintel](https://durian.blender.org/download/) (CC BY 3.0)
  - [Tears of Steel](https://mango.blender.org/download/) (CC BY 3.0)  
  Ou hébergement d’un extrait court (HLS/MP4) sur votre propre domaine / CDN pour un contrôle total.

---

## Résumé

- **Backend de validation** : catalogue simulé + recherche par filtre + streams vers vidéos domaine public ; API alignée sur ce que le client appelle déjà.
- **Client** : en build « store », utiliser par défaut ce backend sans afficher « démo » ; un seul flux utilisateur.
- **Stores** : webOS, Android, Apple utilisent la même logique et la même URL de backend de validation pour que les testeurs valident l’app sans déployer de serveur Popcorn.

---

## Implémentation réalisée

### Backend de validation (popcorn-web)

- **Catalogue démo** : `popcorn-web/src/lib/demo-catalog.ts` — films/séries domaine public (Big Buck Bunny, Sintel, etc.), recherche par filtre, format aligné sur le backend Rust.
- **Routes API** (toutes sous `popcorn-web/src/pages/`):
  - `api/client/health.ts` — GET health
  - `api/client/torrents/[id].ts` — GET torrent (état « completed » pour les infoHash démo)
  - `api/client/torrents/[id]/files.ts` — GET fichiers (un fichier `demo/play` pour le stream)
  - `api/torrents/list.ts` — GET liste films/séries
  - `api/indexers/search.ts` — GET recherche
  - `api/torrents/group/[slug].ts` — GET détail par slug
  - `api/torrents/group/by-tmdb/[tmdbId].ts` — GET détail par tmdb_id
  - `library.ts` — GET bibliothèque (vide)
  - `api/local/stream/[[...path]].ts` — GET redirection vers flux HLS domaine public (Big Buck Bunny) pour toute requête `playlist.m3u8`.

### Client (popcorn-client)

- **backend-config.ts** : si `VITE_DEMO_BACKEND_URL` ou `PUBLIC_DEMO_BACKEND_URL` est défini et qu’aucune URL n’est en localStorage, cette URL est utilisée comme backend. Aucune mention « démo » dans l’UI.

### Activation pour les builds store

Lors du build du client pour soumission aux stores (webOS, Android, Apple), définir :

- `VITE_DEMO_BACKEND_URL` ou `PUBLIC_DEMO_BACKEND_URL` = URL du site popcorn-web (ex. `https://popcorn-vercel.vercel.app`), **sans** slash final.

Exemple (PowerShell) avant build :

```powershell
$env:PUBLIC_DEMO_BACKEND_URL = "https://popcorn-vercel.vercel.app"
npm run build
```

Ou dans un fichier `.env` à la racine de popcorn-client (à ne pas commiter avec une URL de prod si sensible) :

```
PUBLIC_DEMO_BACKEND_URL=https://popcorn-vercel.vercel.app
```

Les builds webOS / Android / Apple qui utilisent ce env verront l’app se connecter au backend de validation au premier lancement (sans configuration serveur). Le testeur peut parcourir le catalogue, rechercher et lire une vidéo (redirection vers un flux domaine public).
