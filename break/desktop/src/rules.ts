/* Small pure rules the Electron shell uses: the escape shortcut and the after-sign-in redirect. */

/** The key event fields Electron's before-input-event gives. */
export interface KeyInput { type: string; key: string; control: boolean; alt: boolean; meta: boolean; shift: boolean }

/** Ends a break at once. macOS: ⌃⌥⌘B like the Swift app. Elsewhere the Super/Windows key is the OS's, so ⌃⌥⇧B. */
export function escapeAccelerator(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'Control+Alt+Command+B' : 'Control+Alt+Shift+B';
}

export function isEscape(input: KeyInput, platform: NodeJS.Platform): boolean {
  if (input.type !== 'keyDown' || input.key.toLowerCase() !== 'b' || !input.control || !input.alt) return false;
  return platform === 'darwin' ? input.meta && !input.shift : input.shift && !input.meta;
}

const AUTH_WORDS = ['login', 'logout', 'auth', 'oauth', 'magic', 'verify', 'callback', 'sso'];
/** Redirects home at most this many times per break, so a bad landing page never loops. */
export const MAX_HOME_REDIRECTS = 2;

/** After sign-in, claude.ai can land somewhere other than the board: true when the view should load `target` again. */
export function shouldGoHome(current: string, target: string, redirectsSoFar: number): boolean {
  if (!target || redirectsSoFar >= MAX_HOME_REDIRECTS) return false;
  let cur: URL, home: URL;
  try { cur = new URL(current); home = new URL(target); } catch { return false; }
  if (cur.host !== home.host || (cur.pathname === home.pathname && cur.search === home.search)) return false;
  const path = cur.pathname.toLowerCase();
  return !path.includes('artifact') && !AUTH_WORDS.some((w) => path.includes(w));
}

/** Electron's default user agent minus its own tokens, so sign-in pages treat the view as plain Chrome. */
export function plainChromeUserAgent(ua: string): string {
  return ua.replace(/\s(Electron|LifeboardBreak|lifeboard)\/\S+/gi, '');
}
