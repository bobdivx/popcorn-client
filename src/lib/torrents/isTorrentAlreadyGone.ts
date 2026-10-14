/** Erreurs librqbit / API quand le torrent n'est plus dans le client. */
export function isTorrentAlreadyGoneError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /no such torrent|not found in db|404|torrent introuvable|déjà supprimé|already removed|does not exist/i.test(
    msg
  );
}
