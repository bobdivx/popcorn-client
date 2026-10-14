import { describe, expect, it } from 'vitest';
import { isTorrentAlreadyGoneError } from './isTorrentAlreadyGone';

describe('isTorrentAlreadyGoneError', () => {
  it('détecte le message librqbit', () => {
    expect(
      isTorrentAlreadyGoneError(
        new Error('librqbit remove_torrent 500: no such torrent in db')
      )
    ).toBe(true);
  });

  it('ignore les vraies erreurs', () => {
    expect(isTorrentAlreadyGoneError(new Error('permission denied'))).toBe(false);
  });
});
