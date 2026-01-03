# popcorn-vercel

Application d'authentification basique pour Popcorn, déployée sur Vercel.

## Description

Application Astro avec Preact pour la gestion de l'authentification via codes de parrainage. Utilise Turso (LibSQL) comme base de données.

## Fonctionnalités

- Page de login avec formulaire (email, password, code de parrainage)
- Validation du code de parrainage via API
- Connexion à Turso pour valider les codes
- Design moderne avec Tailwind CSS

## Installation

```bash
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
TURSO_DATABASE_URL=libsql://votre-database-url.turso.io
TURSO_AUTH_TOKEN=votre-auth-token
JWT_SECRET=votre-jwt-secret-optionnel
```

**Important :**
- Le fichier `.env` doit être à la racine du projet (`D:\Github\popcorn-vercel\.env`)
- Pas d'espaces autour du signe `=`
- Pas de guillemets autour des valeurs
- Redémarrez le serveur de développement après avoir créé/modifié le fichier `.env`

## Développement

```bash
npm run dev
```

L'application sera accessible sur `http://localhost:4321`

## Build

```bash
npm run build
```

## Déploiement

L'application est configurée pour être déployée sur Vercel avec l'adapter serverless.

## Structure

```
popcorn-vercel/
├── public/
│   └── favicon.svg            # Favicon de l'application
├── src/
│   ├── components/
│   │   └── LoginForm.tsx      # Composant Preact pour le formulaire de login
│   ├── layouts/
│   │   └── Layout.astro       # Layout de base
│   ├── lib/
│   │   └── db/
│   │       └── turso.ts       # Connexion à Turso
│   └── pages/
│       ├── index.astro        # Redirige vers /login
│       ├── login.astro        # Page de login
│       └── api/
│           └── invites/
│               └── validate.ts  # API de validation du code de parrainage
├── astro.config.mjs          # Configuration Astro avec adapter Vercel
├── package.json              # Dépendances et scripts
├── tailwind.config.mjs       # Configuration Tailwind CSS
└── tsconfig.json             # Configuration TypeScript
```

## Technologies

- [Astro](https://astro.build/) - Framework web
- [Preact](https://preactjs.com/) - Framework UI
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS
- [Turso](https://turso.tech/) - Base de données LibSQL
- [Vercel](https://vercel.com/) - Plateforme de déploiement
