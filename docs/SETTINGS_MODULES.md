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
