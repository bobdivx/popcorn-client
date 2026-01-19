# Dockerfile multi-stage pour le frontend Astro Popcorn
# Stage 1: Build
FROM node:20-alpine AS builder

# Installer les dépendances nécessaires
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copier les fichiers de dépendances d'abord (pour le cache Docker)
COPY package.json package-lock.json* ./

# Installer les dépendances
RUN npm ci

# Copier le reste des fichiers source
COPY . .

# Builder l'application Astro
RUN npm run build

# Stage 2: Runtime avec nginx
FROM nginx:alpine

# Copier les fichiers statiques buildés depuis le stage builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la configuration nginx personnalisée (optionnel)
# Si vous avez besoin d'une config nginx spécifique, créez un fichier nginx.conf
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

# Démarrer nginx
CMD ["nginx", "-g", "daemon off;"]
