#!/bin/sh
# Génère /config.json depuis PUBLIC_BACKEND_URL pour que le frontend sache où joindre le backend (Docker).
# Si PUBLIC_BACKEND_URL n'est pas défini, le fichier contient {} et l'app utilisera localStorage ou /setup.

CONFIG_FILE="/usr/share/nginx/html/config.json"
URL="${PUBLIC_BACKEND_URL:-}"
# Éviter d'écrire des guillemets non échappés dans le JSON
case "$URL" in
  *'"'*) URL="" ;;
esac
if [ -n "$URL" ]; then
  printf '{"backendUrl":"%s"}\n' "$URL" > "$CONFIG_FILE"
else
  printf '{}\n' > "$CONFIG_FILE"
fi
exec nginx -g "daemon off;"
