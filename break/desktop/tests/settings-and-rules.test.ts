import { describe, expect, it } from 'vitest';
import { DEFAULTS, settingsFromText } from '../src/settings.ts';
import { isEscape, plainChromeUserAgent, shouldGoHome, type KeyInput } from '../src/rules.ts';

describe('settings file', () => {
  it('no file or broken JSON gives the defaults', () => {
    expect(settingsFromText(null)).toEqual(DEFAULTS);
    expect(settingsFromText('{nope')).toEqual(DEFAULTS);
    expect(settingsFromText('[1,2]')).toEqual(DEFAULTS);
  });
  it('keeps good keys and replaces bad ones with their default', () => {
    const s = settingsFromText(JSON.stringify({ workMinutes: 45, breakMinutes: -1, maxPostpones: 1.5, url: 'javascript:alert(1)', extra: true }));
    expect(s).toEqual({ ...DEFAULTS, workMinutes: 45 });
  });
  it('accepts an https board url', () => {
    expect(settingsFromText('{"url":"https://claude.ai/artifact/abc"}').url).toBe('https://claude.ai/artifact/abc');
  });
});

describe('escape shortcut', () => {
  const key = (k: Partial<KeyInput>): KeyInput => ({ type: 'keyDown', key: 'b', control: false, alt: false, meta: false, shift: false, ...k });
  it('is ctrl+alt+cmd+B on macOS', () => {
    expect(isEscape(key({ control: true, alt: true, meta: true }), 'darwin')).toBe(true);
    expect(isEscape(key({ control: true, alt: true, shift: true, key: 'B' }), 'darwin')).toBe(false);
  });
  it('is ctrl+alt+shift+B on Linux and Windows', () => {
    for (const p of ['linux', 'win32'] as const) {
      expect(isEscape(key({ control: true, alt: true, shift: true, key: 'B' }), p)).toBe(true);
      expect(isEscape(key({ control: true, alt: true }), p)).toBe(false);
      expect(isEscape(key({ control: true, alt: true, shift: true, type: 'keyUp' }), p)).toBe(false);
    }
  });
});

describe('after sign-in redirect', () => {
  const home = 'https://claude.ai/artifact/abc';
  it('goes home from a stray claude.ai page, at most twice', () => {
    expect(shouldGoHome('https://claude.ai/new', home, 0)).toBe(true);
    expect(shouldGoHome('https://claude.ai/new', home, 2)).toBe(false);
  });
  it('leaves sign-in pages, the artifact and other hosts alone', () => {
    expect(shouldGoHome('https://claude.ai/login?x=1', home, 0)).toBe(false);
    expect(shouldGoHome('https://claude.ai/artifact/abc', home, 0)).toBe(false);
    expect(shouldGoHome('https://accounts.google.com/x', home, 0)).toBe(false);
    expect(shouldGoHome('https://claude.ai/new', '', 0)).toBe(false);
  });
  it('never reloads a board that is already home, wherever it is hosted', () => {
    expect(shouldGoHome('http://127.0.0.1:8765/index.html#eco', 'http://127.0.0.1:8765/index.html', 0)).toBe(false);
  });
});

it('user agent drops the Electron and app tokens', () => {
  const ua = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) LifeboardBreak/0.1.0 Chrome/140.0.0.0 Electron/45.5.0 Safari/537.36';
  expect(plainChromeUserAgent(ua)).toBe('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36');
});
