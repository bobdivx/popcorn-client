import { PreferencesManager } from '../client/storage';
import { DEFAULT_UI_PACK, isUiPackId, type UiPackId } from './packs';

export { UI_PACKS, CLASSIC_PACK, TESLA_PACK, DEFAULT_UI_PACK, getUiPack, isUiPackId } from './packs';
export type { UiPack, UiPackId } from './packs';

export function readUiPack(): UiPackId {
  const fromPrefs = PreferencesManager.getPreferences().uiPack;
  if (isUiPackId(fromPrefs)) return fromPrefs;
  return DEFAULT_UI_PACK;
}

export function applyUiPack(id: UiPackId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiPack = id;
}

export function saveUiPack(id: UiPackId): void {
  PreferencesManager.updatePreferences({ uiPack: id });
  applyUiPack(id);
}
