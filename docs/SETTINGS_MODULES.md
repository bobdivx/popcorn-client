# Paramètres › Modules (`/settings/modules`)

Page d'administration des modules, construite avec les tuiles du hub des réglages
(`HubTile`, `HubAddTile`, `HubGrid`, `HubModal`) et l'habillage éditorial `.modules-hub`
(`src/styles/settings-hub.css`). Absente de la version store (`STORE_BLOCKED_ROUTE_PREFIXES`).

## Structure

1. **Modules installés** — une tuile par module de données (`GET /api/client/admin/modules`) et par
   module exécutable (`modules.process`, si le serveur les gère), puis la tuile **+ Ajouter un module**
   (formulaire URL ou installation vérifiée d'un module exécutable).
2. **Fonctions intégrées** — une tuile par capacité de `GET /api/client/capabilities` (`features`),
   plus les capacités fournies par un module installé (`provides`). Badge :
   - **Actif** : capacité à `true` ou module actif qui la fournit ;
   - **Désactivé** : présente mais à `false` (dépendance absente, module inactif) ;
   - **Non installé** : feature Cargo absente de `compiled_features` et aucun module ne la fournit.
   La modale de détail affiche ce que la fonction apporte, sa source (serveur ou module), un lien
   vers sa page de réglages et, si un module la fournit, l'accès à ses actions.
3. **Serveur et sécurité** — **Clés de confiance** (modules exécutables) et **Serveur connecté**
   (édition, version, plateforme).

## Ajouter une capacité

La liste vient du serveur : une nouvelle clé s'affiche automatiquement avec une tuile générique.
Pour lui donner un libellé, une icône et une page de réglages, ajouter une entrée à `META` dans
`src/components/settings/modules/ServerFeatures.tsx` (textes FR + EN). Les capacités retirées du
produit (`uploads`, `ratio_tools`) n'ont pas de tuile.

## Fonction → page de réglages

Bouton **Ouvrir les réglages** de la modale d'une fonction (`href` de `META`), plus d'éventuels
boutons secondaires (`links`) vers des réglages voisins de la même fonction. Un lien `?sub=` ouvre
directement la section concernée (modale) de la page ; « Retour » / « Fermer » revient à la page.
Un lien vers une route bloquée (version store, serveur sans module torrent) n'est pas affiché.

| Capacité | Fonction | Ouvrir les réglages | Liens secondaires |
| --- | --- | --- | --- |
| `player` | Lecteur | `/settings/playback` (Lecture) | — |
| `transcoding` | Transcodage | `/settings/maintenance?sub=transcodingConfig` | Transcodages en cours (`?sub=transcodeJobs`) |
| `library` | Bibliothèque | `/settings/library` (hub Bibliothèque) | — |
| `library_sources` | Sources de bibliothèque | `/settings/library-sources` (Dossiers externes) | — |
| `jellyfin` | Jellyfin | *aucune page client* : la modale l'indique, réglage dans le module | — |
| `discover` | Découverte | `/settings/tmdb` (clé / langue TMDB) | Rangées de découverte (`/settings/discover-sliders`) |
| `requests` | Demandes | `/settings/requests-admin` | — |
| `torrent` | Téléchargement torrent | `/settings/librqbit` (Client torrent) | Téléchargements (`/settings/downloads`) |
| `stream_torrent` | Lecture pendant le téléchargement | `/settings/playback?sub=streamingDownloadFull` | — |
| `indexers` | Indexers | `/settings/indexers` | Liste noire (`/settings/blacklist`) |
| `sync` | Synchronisation des indexers | `/settings/content?sub=sync` (Sync torrents) | Catégories synchronisées (`/settings/sync`) |
| `indexer_definitions` | Définitions d'indexers | `/settings/indexer-definitions` | — |
| `sharing`, `friends` | Partage / Amis | `/settings/friends` | — |
| `ai` | IA | `/settings/ai` | — |
| `car_lab` / `car` | Voiture (module activable) | `/car/lab` (labo) | — |
| `webos_deployment` / `webos` | Déploiement webOS | `/settings/webos-deployment` | — |

Avant octobre 2026, `jellyfin` pointait vers `/settings/library-sources` (comme `library_sources`),
`transcoding` vers `/settings/playback` (comme `player`), `torrent` et `stream_torrent` vers le hub
`/settings/downloads`, `discover` vers le hub `/settings/discovery` et `sync` vers le hub
`/settings/content` : plusieurs fonctions ouvraient la même page générale.

Aucune ancienne route de réglages n'est redirigée vers `/settings/library-sources` : le ménage de
l'administration (commits `aca255f6`…`5e4c0fa2`) a seulement retiré les tuiles de premier niveau
Contenu / Téléchargements / Découverte (catégories `content`, `downloads`, `discovery`, toujours
accessibles par URL) et fait revenir leurs pages vers Paramètres › Modules.

## Rattachement des pages de réglages aux modules

Décision d'octobre 2026 : chaque page de réglages appartient à la fonction sans laquelle elle n'a
pas d'effet. Une page dont le module manque n'est proposée nulle part (hub, menus, liens de la
modale, sections des hubs) et son URL redirige (administrateur → Paramètres › Modules avec le
message « Cette page nécessite le module … », autre utilisateur → accueil). Listes dans
`src/lib/distribution.ts` (`TORRENT_MODULE_ROUTE_PREFIXES`, `INDEXERS_MODULE_ROUTE_PREFIXES`,
`DISCOVER_ROUTE_PREFIXES`, `OPTIONAL_FEATURE_ROUTE_PREFIXES`).

| Page | Rattachée à | Raison |
| --- | --- | --- |
| `/settings/tmdb` | cœur | Clé / langue TMDB : métadonnées et affiches de la bibliothèque, utiles sans aucun module. |
| `/settings/discover-sliders` | `indexers` (+ `discover` non désactivé) | Les rangées de découverte n'existent que sur l'accueil « catalogue », servi par le module Indexers. Sans lui l'accueil montre la bibliothèque seule. |
| `/settings/blacklist` | `indexers` | La liste noire ne filtre que les résultats des indexers (recherche, catalogue, demandes). |
| `/settings/discovery` (hub) | `indexers` | Ses sections (rangées, demandes, liste noire, quotas de demandes) exigent toutes Indexers. Une section dont la page est masquée n'apparaît pas dans le hub (ex. demandes si `requests` est à `false`). |
| `/settings/content` (hub) | `indexers` | Indexers, catégories et planification de la synchro, import de .torrent en lot (lit la liste des indexers). TMDB y figure aussi mais reste accessible par `/settings/tmdb`. |
| `/settings/library-indexer` | `indexers` | Ancienne URL, redirige vers `/settings/indexers`. |
| `/car`, `/car/lab`, `/car/probe` | `car_lab` (module activable « Voiture ») | Masquées seulement si `car_lab` est explicitement à `false` : administrateur → Paramètres › Modules (« nécessite le module Voiture »), autre utilisateur → message sur la page. La lecture Tesla repasse alors par le lecteur classique. |

Toutes ces pages exigent aussi le moteur torrent (`torrent`), sauf `/settings/tmdb` et `/car*`.
Capacités inconnues (premier lancement, serveur ancien sans `GET /api/client/capabilities`) :
tout reste affiché (comportement historique).

Pages utilisateur selon les modules :

- **Recherche** (`/search`) : toujours proposée hors version store. Sans Indexers, elle cherche
  dans la bibliothèque locale (filtrage client de `GET /library` : films, séries, épisodes). Avec
  Indexers, la recherche complète a un onglet « Ma bibliothèque » (`/search?scope=library`).
- **Découverte** (`/discover`, `/plateformes`) : exige Indexers (sinon rien ne peut être demandé ni
  téléchargé) ; masquée aussi si `discover` est à `false`. Sans elle, l'accueil, Films et Séries
  montrent la bibliothèque seule (pas de rangées TMDB « du moment »).

## Mise en page

- Titres de page et de tuile : jamais tronqués (passage à la ligne) ; sous-titres de tuile limités
  à 3 lignes, source / version à 2 lignes. Les tuiles d'une rangée ont la même hauteur
  (`min-height`, pas de hauteur fixe).
- Gabarit des pages de réglages : `SettingsLayout` (`.settings-content-area` porte les marges)
  > `.ds-container` (sans marge propre) > `DsPageHeader` > contenu.
