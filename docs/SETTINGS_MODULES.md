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
| `indexers` | Indexers | `/settings/indexers` | — |
| `sync` | Synchronisation des indexers | `/settings/content?sub=sync` (Sync torrents) | Catégories synchronisées (`/settings/sync`) |
| `indexer_definitions` | Définitions d'indexers | `/settings/indexer-definitions` | — |
| `sharing`, `friends` | Partage / Amis | `/settings/friends` | — |
| `ai` | IA | `/settings/ai` | — |
| `car_lab` / `car` | Car lab | `/car/lab` | — |
| `webos_deployment` / `webos` | Déploiement webOS | `/settings/webos-deployment` | — |

Avant octobre 2026, `jellyfin` pointait vers `/settings/library-sources` (comme `library_sources`),
`transcoding` vers `/settings/playback` (comme `player`), `torrent` et `stream_torrent` vers le hub
`/settings/downloads`, `discover` vers le hub `/settings/discovery` et `sync` vers le hub
`/settings/content` : plusieurs fonctions ouvraient la même page générale.

Aucune ancienne route de réglages n'est redirigée vers `/settings/library-sources` : le ménage de
l'administration (commits `aca255f6`…`5e4c0fa2`) a seulement retiré les tuiles de premier niveau
Contenu / Téléchargements / Découverte (catégories `content`, `downloads`, `discovery`, toujours
accessibles par URL) et fait revenir leurs pages vers Paramètres › Modules.

## Mise en page

- Titres de page et de tuile : jamais tronqués (passage à la ligne) ; sous-titres de tuile limités
  à 3 lignes, source / version à 2 lignes. Les tuiles d'une rangée ont la même hauteur
  (`min-height`, pas de hauteur fixe).
- Gabarit des pages de réglages : `SettingsLayout` (`.settings-content-area` porte les marges)
  > `.ds-container` (sans marge propre) > `DsPageHeader` > contenu.
