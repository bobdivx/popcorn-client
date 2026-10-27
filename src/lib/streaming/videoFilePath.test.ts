import { describe, expect, it } from 'vitest';
import { isVideoFilePath } from './videoFilePath';

describe('isVideoFilePath', () => {
  it('accepte les fichiers vidéo', () => {
    expect(isVideoFilePath('media/films/Moana.2026.MULTi.mkv')).toBe(true);
    expect(isVideoFilePath('C:\\Films\\a.MP4')).toBe(true);
    expect(isVideoFilePath('series/Show/S01E01.m2ts')).toBe(true);
  });
  it('refuse les dossiers et chemins vides', () => {
    expect(isVideoFilePath('media/films')).toBe(false);
    expect(isVideoFilePath('media/films/')).toBe(false);
    expect(isVideoFilePath('/app/downloads/movies/Burnt.2015.MULTi.BluRay.1080p')).toBe(false);
    expect(isVideoFilePath('')).toBe(false);
    expect(isVideoFilePath(null)).toBe(false);
    expect(isVideoFilePath('film.nfo')).toBe(false);
  });
});
