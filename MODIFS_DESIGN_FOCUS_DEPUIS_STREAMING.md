# Modifications design et focus depuis le merge « STREAMING FONCTIONNEL »

**Commit de référence :** `Merge dev into main: STREAMING FONCTIONNEL`  
- **popcorn-client :** `243dea3` (18 févr. 2026)  
- **popcorn-server :** `94e1949d` (18 févr. 2026)

---

## popcorn-client (design / focus / UI)

Les commits ci-dessous concernent l’interface, le focus, la navigation TV, le dashboard ou le lecteur.

| Commit    | Description |
|-----------|-------------|
| `c26fc22` | fix: mises à jour UI, player, téléchargements et pages |
| `e0eed26` | player TV: gauche/droite = seek par défaut, navigation uniquement avec haut/bas + audit |
| `a1da9b9` | **design: halo blanc scintillant norme (focus/clic)** - header, cartes torrent, TV |
| `1c5e55c` | seetings (réglages / settings) |
| `257b7da` | webOS: lanceur client cloud/local, clientUrl QR, origine client (cloud/local) et header X-Popcorn-Client-Origin |
| `2bea9f1` | CORS: n'envoyer X-Popcorn-Client-Origin qu'en same-origin |
| `b08789e` | Dashboard: Reprendre/Revoir, badge indexer, masquage déjà vus, fix saut de rendu |
| `5594b06` | webOS: masquage auto des contrôles lecteur + lanceur, icônes, carousel |
| `82b4ed2` | Carousel TV: même ligne gauche/droite, carte jamais coupée (scroll adapté) |
| `277f40d` | Mobile: scroll vertical sur la page quand le doigt est sur une torrent card (pan-x pan-y) |
| `7b1c7bc` | Carousel: carte jamais coupée en web et webOS, scroll fluide en web |
| `c090379` | feat(webOS): mode build Natif (app complète embarquée) |
| `214cf74` | feat(sync): client sync globale, Dashboard écoute popcorn:torrents-cleared |
| `503588c` | **feat: dashboard hero buttons, sync toolbar responsive, webos and dashboard fixes** |
| `1fd0e4c` | sync/indexers: médias par genre TMDB dans modale, nom indexer toolbar supprimé, **badge En cours intégré à la carte** |
| `0ee095d` | dashboard: badge genres, titres sans populaires, fix lastSyncProgressRef, fast torrents min_seeds |
| `d95dd1f` | **fix(tv): navigation dashboard films/séries - focus ancré, carousel défile** |
| `8d5c8d2` | feat: bannière serveur hors ligne + réduction des logs connexion/timeout |
| `9916fa7` | **fix(tv): navigation telecommande - FAB exclu en bas, scope video controle gauche/droite, latence webOS** |
| `46d6d9d` | Lecteur: format d'image dans menu Paramètres + défaut sans bandes noires (cover) |
| `6758c5a` | fix(backend): séparation mon serveur / serveur ami + menu versions et mises à jour |
| `6e24a4a` | fix(client): backend URL, fix bug trimmed localStorage, retrait mentions tierces |
| `3938ae8` | fix(settings): stabilité sliders & notifications |

---

## popcorn-server

Aucun commit depuis le merge ne porte explicitement sur le « design » ou le « focus » (côté backend : sync, torrents, CI, health, etc.). Les changements sont fonctionnels / infra.

---

## Retour local à la date du merge

Pour revenir à l’état de ce merge en local :

- **popcorn-client :** `git checkout dev` puis `git reset --hard 243dea362718549bba47fa8df8123eed2d64bfca`
- **popcorn-server :** `git checkout dev` puis `git reset --hard 94e1949d97a64a1c822b932387b219c9b3dc5e48`

Attention : toute modification locale non commitée sera perdue (ou faire `git stash` avant le reset si vous voulez la retrouver plus tard).
