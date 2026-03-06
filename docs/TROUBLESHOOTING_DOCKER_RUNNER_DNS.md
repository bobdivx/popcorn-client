# Runner self-hosted : impossible de joindre Docker Hub (DNS)

## Contexte

Le workflow **Build and Publish Frontend Docker Image** (`docker-publish-frontend.yml`) s’exécute sur un **runner self-hosted**.  
L’étape **Verify Docker Hub reachability** échoue avec :

```
❌ Impossible de joindre Docker Hub (registry-1.docker.io).
Cause typique sur runner self-hosted: DNS (ex. 10.1.0.1:53 connection refused).
```

Cela indique que la machine qui héberge le runner ne peut pas résoudre ou joindre `registry-1.docker.io`, souvent à cause d’un **DNS système ou Docker défaillant** (ex. résolveur `10.1.0.1` qui ne répond pas).

---

## 1. Vérifier l’accès depuis le runner

Sur la **machine qui héberge le runner** (en SSH ou console) :

```bash
# Test direct
curl -sf --max-time 15 -o /dev/null "https://registry-1.docker.io/v2/" && echo "OK" || echo "Échec"

# Vérifier le DNS utilisé
cat /etc/resolv.conf
```

Si `curl` échoue alors que l’hôte a bien Internet, le problème vient très probablement du **DNS** (résolution de `registry-1.docker.io`).

---

## 2. Configurer le DNS du démon Docker

Pour que **Docker** (et donc le build d’images) utilise un DNS fiable, configurez le démon :

1. **Éditer** (ou créer) `/etc/docker/daemon.json` :

   ```json
   {
     "dns": ["8.8.8.8", "1.1.1.1"]
   }
   ```

   Si le fichier existe déjà, ajoutez uniquement la clé `"dns"` sans casser le JSON (virgules, accolades).

2. **Redémarrer le démon Docker** :

   ```bash
   sudo systemctl restart docker
   ```

3. **Relancer le job** sur GitHub Actions.

---

## 3. Corriger le DNS système (alternative)

Si vous préférez que toute la machine utilise un DNS fonctionnel :

- **Sous Linux** : modifier `/etc/resolv.conf` ou la config de votre client DHCP/NetworkManager pour utiliser des résolveurs valides (ex. `8.8.8.8`, `1.1.1.1`) au lieu du résolveur actuel (ex. `10.1.0.1`) qui ne répond pas.
- **Sous ZimaOS / CasaOS** : vérifier les paramètres réseau (DNS) dans l’interface ou en ligne de commande pour remplacer le résolveur défaillant.

Une fois le DNS système corrigé, le runner et Docker pourront joindre Docker Hub sans modifier `daemon.json`, mais la solution § 2 reste la plus ciblée pour Docker seul.

---

## 4. Vérification après correction

Sur l’hôte du runner :

```bash
# Avec Docker
docker run --rm alpine sh -c "nslookup registry-1.docker.io"

# Ou avec curl (comme dans le workflow)
curl -sf --max-time 15 -o /dev/null "https://registry-1.docker.io/v2/" && echo "✅ Docker Hub joignable"
```

Si ces commandes réussissent, le prochain run du workflow **Verify Docker Hub reachability** devrait passer.
