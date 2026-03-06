#!/usr/bin/env bash
# Nettoie les artifacts GitHub Actions du dépôt (plus vieux que N jours).
# Nécessite: GitHub CLI (gh) installé et authentifié: gh auth login
#
# Usage:
#   ./scripts/cleanup-artifacts.sh
#   ./scripts/cleanup-artifacts.sh 7
#   RETENTION_DAYS=7 ./scripts/cleanup-artifacts.sh
#   DRY_RUN=1 ./scripts/cleanup-artifacts.sh

set -e

RETENTION_DAYS="${1:-${RETENTION_DAYS:-14}}"
DRY_RUN="${DRY_RUN:-0}"

if ! command -v gh &>/dev/null; then
  echo "Erreur: GitHub CLI (gh) requis. Installez: https://cli.github.com/"
  exit 1
fi

REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
if [ -z "$REPO" ]; then
  echo "Erreur: impossible de détecter le dépôt. Définissez GITHUB_REPOSITORY=owner/repo"
  exit 1
fi

CUTOFF=$(date -u -d "-${RETENTION_DAYS} days" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v-${RETENTION_DAYS}d +"%Y-%m-%dT%H:%M:%SZ")
export GH_PAGER=cat

echo "Nettoyage des artifacts: $REPO (plus vieux que $RETENTION_DAYS jours, avant $CUTOFF)"
[ "$DRY_RUN" = "1" ] && echo "[DRY RUN] Aucune suppression."
echo ""

total=0
page=1
per_page=100

while true; do
  json=$(gh api "repos/${REPO}/actions/artifacts" --method GET -f "per_page=${per_page}" -f "page=${page}" 2>/dev/null || true)
  if [ -z "$json" ]; then
    break
  fi

  ids=$(echo "$json" | jq -r --arg cutoff "$CUTOFF" '
    .artifacts[] | select(.created_at < $cutoff) | .id
  ')
  names=$(echo "$json" | jq -r --arg cutoff "$CUTOFF" '
    .artifacts[] | select(.created_at < $cutoff) | "\(.name) (\(.id))"
  ')

  if [ -n "$ids" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      echo "  Supprime: $line"
      total=$((total + 1))
    done <<< "$names"

    if [ "$DRY_RUN" != "1" ]; then
      while IFS= read -r id; do
        [ -z "$id" ] && continue
        gh api -X DELETE "repos/${REPO}/actions/artifacts/${id}" 2>/dev/null || true
      done <<< "$ids"
    fi
  fi

  count=$(echo "$json" | jq '.artifacts | length')
  [ "$count" -lt "$per_page" ] && break
  page=$((page + 1))
done

echo ""
echo "Terminé: $total artifact(s) supprimé(s) ou à supprimer (plus vieux que $RETENTION_DAYS jours)."
