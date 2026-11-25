/* Two kinds of view preference. Device prefs (folds, list sorts) are remembered per device in localStorage `lb-ui`.
   Board prefs (Ecosystem, Garden, Tips, theme, commit lock) live in checks/ui_prefs so every device matches; the newest
   change wins. The Ecosystem and Garden switches are mirrored into device prefs. */
import { store } from './state.ts';

export const devicePrefs: { fold: Record<string, boolean>; sort: Record<string, string>; eco: boolean; garden: boolean } = { fold: {}, sort: {}, eco: true, garden: true };
try {
  const saved: unknown = JSON.parse(localStorage.getItem('lb-ui') || 'null');
  if (saved && typeof saved === 'object') {
    const r = saved as { fold?: unknown; sort?: unknown; eco?: unknown; garden?: unknown; labs?: unknown };
    devicePrefs.fold = r.fold && typeof r.fold === 'object' ? (r.fold as Record<string, boolean>) : {};
    devicePrefs.sort = r.sort && typeof r.sort === 'object' ? (r.sort as Record<string, string>) : {};
    devicePrefs.eco = (r.eco ?? r.labs) !== false;
    devicePrefs.garden = (r.garden ?? r.labs) !== false;
  }
} catch { /* defaults */ }
export function saveDevicePrefs(): void {
  try { localStorage.setItem('lb-ui', JSON.stringify(devicePrefs)); } catch { /* private mode: keep in memory */ }
}
export const isFoldOpen = (key: string, openByDefault: boolean): boolean => (key in devicePrefs.fold ? !!devicePrefs.fold[key] : openByDefault);
export function setFoldOpen(key: string, open: boolean): void {
  devicePrefs.fold[key] = open;
  saveDevicePrefs();
}

/** A visitor test link (#eco, ?visitor=<id>, #visitor=<id>, #visitor-<id>) turns the Ecosystem on for this visit. */
export const ecosystemLink = { forced: false };
export const ecosystemOn = (): boolean => devicePrefs.eco || ecosystemLink.forced;
export const gardenOn = (): boolean => devicePrefs.garden;
export const gameOn = (): boolean => ecosystemOn() || gardenOn();

/** Explanatory tips (checks/ui_prefs.tips): on unless the board turned them off. */
let tipsEnabled = true;
export const tipsOn = (): boolean => tipsEnabled;

export function setTheme(theme: string): void {
  if (theme === 'auto') delete document.documentElement.dataset['theme']; else document.documentElement.dataset['theme'] = theme;
  try { localStorage.setItem('lb-theme', theme); } catch { /* ignore */ }
}

interface BoardPrefs {
  eco?: unknown;
  garden?: unknown;
  /** old name for eco and garden together */
  labs?: unknown;
  theme?: unknown;
  tips?: unknown;
  /** commit lock minutes, or 'end' */
  commitLock?: unknown;
}
const boardPrefsValue = (): BoardPrefs | null => {
  const v = store.get('checks', 'ui_prefs')?.value;
  return v && typeof v === 'object' ? (v) : null;
};
let boardPrefsSeen = 0;
/** Applies checks/ui_prefs if it changed since last seen; true when the Ecosystem or Garden switch changed. */
export function applyBoardPrefs(): boolean {
  const d = store.get('checks', 'ui_prefs'), v = boardPrefsValue();
  if (!d || !v || !((d.updated_at ?? 0) > boardPrefsSeen)) return false;
  boardPrefsSeen = d.updated_at ?? 0;
  const eco = v.eco ?? v.labs, garden = v.garden ?? v.labs;
  let switched = false;
  if ((typeof eco === 'boolean' && eco !== devicePrefs.eco) || (typeof garden === 'boolean' && garden !== devicePrefs.garden)) {
    if (typeof eco === 'boolean') devicePrefs.eco = eco;
    if (typeof garden === 'boolean') devicePrefs.garden = garden;
    saveDevicePrefs();
    switched = true;
  }
  if (typeof v.theme === 'string' && v.theme) setTheme(v.theme);
  const tips = v.tips !== false;
  tipsEnabled = tips;
  return switched;
}
export function setTips(on: boolean): void {
  tipsEnabled = on;
  saveBoardPrefs({ tips: on });
}
export function saveBoardPrefs(patch: BoardPrefs): void {
  const now = Date.now();
  boardPrefsSeen = now;
  store.put('checks', 'ui_prefs', { value: { ...boardPrefsValue(), ...patch }, updated_at: now }).catch((e: unknown) => { console.warn('[prefs]', e); });
}
/** Commit lock (checks/ui_prefs.commitLock): minutes after a task lands on today during which moving it off today
    undoes today's commitment. 0 = locked at once, Infinity ('end') = never locks. */
export function commitLockMinutes(): number {
  const v = boardPrefsValue()?.commitLock;
  return v === 'end' ? Infinity : Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0;
}
