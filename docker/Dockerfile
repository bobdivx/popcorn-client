# Dockerfile multi-stage pour le frontend Astro Popcorn
# Build depuis la racine du repo : docker build -f docker/Dockerfile .
# Stage 1: Build
FROM node:20-alpine AS builder

# Installer les dépendances nécessaires
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copier les fichiers de dépendances d'abord (pour le cache Docker)
COPY package.json package-lock.json* ./

# Réduire les échecs réseau en CI (timeouts, émulation arm64)
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-timeout 300000

# Installer les dépendances (avec retry en cas d'échec réseau transitoire)
RUN npm ci || (echo "Retry npm ci after network failure..." && sleep 60 && npm ci)

# Copier le reste des fichiers source
COPY . .

# Builder l'application Astro
RUN npm run build

# Stage 2: Runtime avec nginx
FROM nginx:alpine

ARG APP_GIT_SHA=unknown
ARG APP_BUILD_REF=unknown

# Copier les fichiers statiques buildés depuis le stage builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuration nginx : absolute_redirect off pour préserver le port dans les
# redirections (évite ERR_CONNECTION_REFUSED vers http://host/setup/ sans port).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint : génère config.json depuis PUBLIC_BACKEND_URL (Docker) puis lance nginx
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENV APP_GIT_SHA=${APP_GIT_SHA}
ENV APP_BUILD_REF=${APP_BUILD_REF}

ENTRYPOINT ["/docker-entrypoint.sh"]
