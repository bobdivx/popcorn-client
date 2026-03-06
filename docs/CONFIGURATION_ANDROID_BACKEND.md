# Configuration du Backend sur Android

## Problème : "Le backend n'est pas accessible"

Si vous voyez ce message au démarrage de l'application Android, c'est que l'URL du backend n'est pas correctement configurée.

## Solution : Configurer l'URL du backend

### Étape 1 : Trouver l'IP de votre machine

L'application Android doit se connecter au backend Rust qui tourne sur votre PC. Vous devez utiliser l'**IP locale** de votre machine, pas `localhost` ou `127.0.0.1`.

#### Sur Windows :
1. Ouvrez **Invite de commandes** (CMD)
2. Tapez : `ipconfig`
3. Cherchez **"Adresse IPv4"** dans la section de votre carte réseau Wi-Fi
4. Exemple : `192.168.1.100`

#### Sur Linux :
1. Ouvrez un terminal
2. Tapez : `ip addr` ou `ifconfig`
3. Cherchez l'adresse IP de votre interface réseau (généralement `wlan0` ou `eth0`)
4. Exemple : `192.168.1.100`

#### Sur Mac :
1. Ouvrez un terminal
2. Tapez : `ifconfig | grep "inet "`
3. Cherchez l'adresse IP de votre interface réseau
4. Exemple : `192.168.1.100`

### Étape 2 : Vérifier que le backend est démarré

Assurez-vous que le backend Rust est démarré sur votre machine :

```bash
# Le backend doit être accessible sur http://VOTRE_IP:3000
# Par exemple : http://192.168.1.100:3000
```

### Étape 3 : Configurer l'URL dans l'application

1. **Au premier lancement**, l'application devrait vous rediriger automatiquement vers la page de configuration (`/setup`)
2. Si ce n'est pas le cas, allez dans **Paramètres** → **Configuration** → **Setup**
3. Dans le champ **"URL du Backend Rust"**, entrez :
   - Format : `http://VOTRE_IP:3000`
   - Exemple : `http://192.168.1.100:3000`
4. Cliquez sur **"Tester la connexion"** pour vérifier
5. Si le test réussit, cliquez sur **"Suivant"**

### Étape 4 : Vérifier la connexion réseau

**Important :** Votre mobile et votre PC doivent être sur le **même réseau Wi-Fi**.

- ✅ **Correct** : Mobile et PC sur le même Wi-Fi (ex: `192.168.1.x`)
- ❌ **Incorrect** : Mobile sur Wi-Fi, PC sur Ethernet (réseaux différents)
- ❌ **Incorrect** : Mobile sur données 4G/5G, PC sur Wi-Fi

### Étape 5 : Vérifier le firewall

Sur Windows, le firewall peut bloquer les connexions entrantes :

1. Ouvrez **Pare-feu Windows Defender**
2. Cliquez sur **"Paramètres avancés"**
3. Créez une règle de trafic entrant pour le port **3000** (TCP)
4. Autorisez les connexions depuis votre réseau local

## Valeurs par défaut

- **Émulateur Android** : `http://10.0.2.2:3000` (fonctionne automatiquement)
- **Appareil physique Android** : Vous devez configurer l'IP manuellement

## Dépannage

### L'application ne se connecte pas

1. **Vérifiez l'IP** : Assurez-vous que l'IP est correcte (pas `10.0.2.2` sur appareil physique)
2. **Vérifiez le réseau** : Mobile et PC sur le même Wi-Fi
3. **Vérifiez le backend** : Le backend Rust est démarré sur le port 3000
4. **Vérifiez le firewall** : Le port 3000 n'est pas bloqué
5. **Testez depuis le mobile** : Ouvrez un navigateur sur votre mobile et allez sur `http://VOTRE_IP:3000/api/client/health`

### L'application redirige vers /setup

C'est normal au premier lancement. Suivez les étapes ci-dessus pour configurer l'URL du backend.

### Comment changer l'URL plus tard

1. Allez dans **Paramètres** → **Configuration** → **Setup**
2. Modifiez l'URL du backend
3. Cliquez sur **"Tester la connexion"**
4. Si le test réussit, l'URL est sauvegardée automatiquement

## Exemples d'URLs

- ✅ `http://192.168.1.100:3000` (IP locale, appareil physique)
- ✅ `http://10.0.2.2:3000` (émulateur Android uniquement)
- ❌ `http://127.0.0.1:3000` (ne fonctionne pas sur Android)
- ❌ `http://localhost:3000` (ne fonctionne pas sur Android)
