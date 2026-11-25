/* Lifeboard Break for Linux, Windows and macOS (Electron): a tray timer that covers every screen with the
   lifeboard during breaks. The timer's rules live in timer.ts; this file only wires them to windows, the tray,
   power events and the page bridge. Build and run: pnpm break (see break-setup). */
import fs from 'node:fs';
import path from 'node:path';
import {
  app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen, session, shell, Tray,
  WebContentsView, type Input, type MenuItemConstructorOptions, type WebContents,
} from 'electron';
import type { BarState } from './bar-state.ts';
import { escapeAccelerator, isEscape, plainChromeUserAgent, shouldGoHome } from './rules.ts';
import { settingsFromText, type BreakSettings } from './settings.ts';
import { BreakTimer, type Effect, type EndReason } from './timer.ts';

const BAR_HEIGHT = 64;
const BACKGROUND = '#121110';
const PARTITION = 'persist:lifeboard-break';
/** keep the break page alive this long after a break ends, so it can save the end event to the db */
const PAGE_GRACE_MS = 5_000;

// Wayland lets no app place windows on a given screen or keep them on top; XWayland does.
if (process.platform === 'linux') app.commandLine.appendSwitch('ozone-platform', 'x11');
app.setName('LifeboardBreak');
const home = process.env['LIFEBOARD_BREAK_HOME'] ?? path.join(app.getPath('appData'), 'LifeboardBreak');
fs.mkdirSync(home, { recursive: true });
app.setPath('userData', home);
const settingsFile = path.join(home, 'settings.json');
const logFile = path.join(home, 'log.tsv');

function readSettingsFile(): BreakSettings {
  try { return settingsFromText(fs.readFileSync(settingsFile, 'utf8')); } catch { return settingsFromText(null); }
}
let settings = readSettingsFile();

function writeSetting(key: 'workMinutes' | 'breakMinutes', value: number): void {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>; } catch { /* new file */ }
  fs.writeFileSync(settingsFile, `${JSON.stringify({ ...raw, [key]: value }, null, 2)}\n`);
  settings = readSettingsFile();
}

function log(line: string): void {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()}\t${line}\n`); } catch { /* logging never stops a break */ }
}

const timer = new BreakTimer(() => settings, Date.now());
let tray: Tray | null = null;
let trayLabel = '';

interface Overlay { windows: BrowserWindow[]; bar: BrowserWindow; board: WebContentsView; homeRedirects: number }
let overlay: Overlay | null = null;
let quitting = false;

// MARK: effects

function apply(effects: Effect[]): void {
  for (const e of effects) {
    if (e.kind === 'start') openOverlay();
    else if (e.kind === 'end') closeOverlay(e.reason);
    else showTick(e.secondsLeft, e.skipInSeconds);
  }
  refreshTray();
}

const now = (): number => Date.now();

/** Electron reports lock events only on macOS and Windows, so the idle state is polled too, on every platform. */
let lockedByPoll = false;

function onTick(): void {
  const locked = powerMonitor.getSystemIdleState(1) === 'locked';
  if (locked && !lockedByPoll) { lockedByPoll = true; timer.leave(now()); }
  else if (!locked && lockedByPoll) { lockedByPoll = false; apply(timer.returned(now())); }
  apply(timer.tick(now(), powerMonitor.getSystemIdleTime()));
}

function watchPower(): void {
  const away = (): void => { timer.leave(now()); refreshTray(); };
  const back = (): void => { apply(timer.returned(now())); };
  powerMonitor.on('suspend', away);
  powerMonitor.on('resume', back);
  powerMonitor.on('lock-screen', away);
  powerMonitor.on('unlock-screen', back);
  if (process.platform === 'darwin') {
    powerMonitor.on('user-did-resign-active', away);
    powerMonitor.on('user-did-become-active', back);
  }
}

// MARK: tray

function trayIcon(): Electron.NativeImage {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
  const image = nativeImage.createFromPath(path.join(__dirname, file));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  return image;
}

function statusText(): string {
  const s = timer.status(now());
  if (s.kind === 'break') return 'On a break';
  if (s.kind === 'paused') return 'Paused';
  if (s.kind === 'away') return 'Away';
  return `Next break in ${String(s.minutesLeft)} min`;
}

function choices(title: string, key: 'workMinutes' | 'breakMinutes', options: number[]): MenuItemConstructorOptions {
  const current = settings[key];
  return {
    label: `${title}: ${String(current)} min`,
    submenu: options.map((o) => ({
      label: `${String(o)} min`, type: 'radio', checked: o === current,
      click: () => { writeSetting(key, o); if (key === 'workMinutes') timer.resetWork(now()); trayLabel = ''; refreshTray(); },
    })),
  };
}

function refreshTray(): void {
  if (!tray) return;
  const label = statusText();
  const s = timer.status(now());
  if (process.platform === 'darwin') tray.setTitle(s.kind === 'work' ? ` ${String(s.minutesLeft)}m` : s.kind === 'break' ? ' break' : ' ⏸');
  if (label === trayLabel) return;
  trayLabel = label;
  tray.setToolTip(`Lifeboard Break: ${label}`);
  // Linux tray menus only change when the whole menu is set again.
  tray.setContextMenu(Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: 'Break now', click: () => { apply(timer.startBreak(now())); } },
    { label: 'Reset timer', click: () => { timer.reset(now()); trayLabel = ''; refreshTray(); } },
    { label: 'Pause 1 hour', click: () => { timer.pause(now(), 3_600_000); trayLabel = ''; refreshTray(); } },
    { type: 'separator' },
    choices('Work', 'workMinutes', [25, 30, 45, 50, 60, 90]),
    choices('Break', 'breakMinutes', [2, 3, 5, 10, 15]),
    { type: 'separator' },
    { label: 'Open settings file', click: () => { if (!fs.existsSync(settingsFile)) fs.writeFileSync(settingsFile, '{}\n'); void shell.openPath(settingsFile); } },
    { label: 'Quit', click: () => { app.quit(); } },
  ]));
}

// MARK: overlay

function onKey(event: Electron.Event, input: Input): void {
  if (isEscape(input, process.platform)) { event.preventDefault(); apply(timer.end('escape', now())); }
}

function coverDisplay(bounds: Electron.Rectangle, preload?: string): BrowserWindow {
  const win = new BrowserWindow({
    // resizable stays on: X11 window managers refuse fullscreen to a fixed-size window (it then stops 1px short)
    ...bounds, show: false, frame: false, minimizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, enableLargerThanScreen: true, backgroundColor: BACKGROUND,
    webPreferences: { sandbox: true, contextIsolation: true, ...(preload ? { preload } : {}) },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('before-input-event', onKey);
  // Alt+F4 and the like must not end a break; only the timer, the buttons, the page or the escape shortcut do.
  win.on('close', (e) => { if (!quitting && overlay?.windows.includes(win)) e.preventDefault(); });
  return win;
}

function boardView(win: BrowserWindow): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'bridge-preload.cjs'), sandbox: true, contextIsolation: true,
      nodeIntegrationInSubFrames: true, partition: PARTITION, backgroundThrottling: false,
    },
  });
  const contents = view.webContents;
  view.setBackgroundColor(BACKGROUND);
  contents.on('before-input-event', onKey);
  // Sign-in popups (window.open) open as real child windows above the overlay, so window.opener works.
  contents.setWindowOpenHandler(() => {
    const b = win.getBounds();
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win, alwaysOnTop: true, width: Math.round(b.width * 0.5), height: Math.round(b.height * 0.8),
        x: b.x + Math.round(b.width * 0.25), y: b.y + Math.round(b.height * 0.1), backgroundColor: '#ffffff',
      },
    };
  });
  contents.on('did-create-window', (popup) => {
    popup.setAlwaysOnTop(true, 'screen-saver');
    popup.webContents.on('before-input-event', onKey);
    popup.webContents.on('did-finish-load', () => { log(`nav\tpopup\t${popup.webContents.getURL()}`); });
    popup.on('closed', goHomeIfLost);
  });
  contents.on('did-finish-load', () => { log(`nav\tmain\t${contents.getURL()}`); goHomeIfLost(); });
  if (settings.url) void contents.loadURL(settings.url);
  else void contents.loadFile(path.join(__dirname, 'placeholder.html'));
  return view;
}

function layoutBoard(win: BrowserWindow, view: WebContentsView): void {
  const [width = 0, height = 0] = win.getContentSize();
  view.setBounds({ x: 0, y: 0, width, height: Math.max(0, height - BAR_HEIGHT) });
}

function goHomeIfLost(): void {
  if (!overlay) return;
  const contents = overlay.board.webContents;
  if (!shouldGoHome(contents.getURL(), settings.url, overlay.homeRedirects)) return;
  overlay.homeRedirects += 1;
  log(`redirect-home\t${contents.getURL()}`);
  void contents.loadURL(settings.url);
}

function openOverlay(): void {
  if (overlay) return;
  const primary = screen.getPrimaryDisplay();
  const windows: BrowserWindow[] = [];
  let bar: BrowserWindow | null = null;
  for (const display of screen.getAllDisplays()) {
    const isPrimary = display.id === primary.id;
    const win = coverDisplay(display.bounds, isPrimary ? path.join(__dirname, 'bar-preload.cjs') : undefined);
    windows.push(win);
    if (isPrimary) bar = win;
    else void win.loadURL('about:blank');
  }
  if (!bar) throw new Error('no primary display');
  const board = boardView(bar);
  bar.contentView.addChildView(board);
  const host = bar;
  layoutBoard(host, board);
  host.on('resize', () => { layoutBoard(host, board); });
  // the first tick goes out before bar.html has loaded
  host.webContents.on('did-finish-load', () => { if (barState) host.webContents.send('bar-state', barState); });
  void host.loadFile(path.join(__dirname, 'bar.html'));
  overlay = { windows, bar: host, board, homeRedirects: 0 };
  for (const win of windows) {
    win.showInactive();
    // After show: on X11 a fullscreen set before the window is mapped can be ignored.
    // macOS fullscreen opens a new Space with an animation; simple fullscreen covers the menu bar in place.
    if (process.platform === 'darwin') win.setSimpleFullScreen(true); else win.setFullScreen(true);
  }
  host.show();
  host.focus();
  board.webContents.focus();
  if (process.platform === 'darwin') app.focus({ steal: true });
  // Also when focus is somewhere else (a popup, or a window manager that would not hand it over).
  globalShortcut.register(escapeAccelerator(process.platform), () => { apply(timer.end('escape', now())); });
}

/** Runs `js` in every frame of the break page that has the bridge (the board is an iframe on claude.ai). */
function toFrames(contents: WebContents, js: string): void {
  if (contents.isDestroyed()) return;
  for (const frame of contents.mainFrame.framesInSubtree) {
    frame.executeJavaScript(`if (window.lifeboardBreak) { ${js} }`).catch(() => { /* frame went away */ });
  }
}

let barState: BarState | null = null;

function showTick(secondsLeft: number, skipInSeconds: number): void {
  if (!overlay) return;
  barState = { secondsLeft, skipInSeconds, postponeMinutes: settings.postponeMinutes, postponesLeft: timer.postponesLeft };
  if (!overlay.bar.isDestroyed()) overlay.bar.webContents.send('bar-state', barState);
  toFrames(overlay.board.webContents, `window.dispatchEvent(new CustomEvent('lifeboardbreaktick', { detail: ${String(secondsLeft)} }))`);
}

function closeOverlay(reason: EndReason): void {
  if (!overlay) return;
  const { windows, board } = overlay;
  overlay = null;
  globalShortcut.unregister(escapeAccelerator(process.platform));
  toFrames(board.webContents, `window.dispatchEvent(new CustomEvent('lifeboardbreakend', { detail: ${JSON.stringify(reason)} }))`);
  for (const win of windows) {
    if (process.platform === 'darwin') win.setSimpleFullScreen(false); else win.setFullScreen(false);
    win.hide();
  }
  setTimeout(() => {
    for (const win of windows) if (!win.isDestroyed()) win.destroy();
    if (!board.webContents.isDestroyed()) board.webContents.close();
  }, PAGE_GRACE_MS);
  log(reason);
}

// MARK: messages from the page and the bar

function fromOverlay(sender: WebContents, part: 'board' | 'bar'): boolean {
  if (!overlay) return false;
  return part === 'board' ? sender === overlay.board.webContents : sender === overlay.bar.webContents;
}

ipcMain.on('lifeboard-break', (event, message: unknown) => {
  if (!fromOverlay(event.sender, 'board')) return;
  if (message === 'skip') apply(timer.end('skip-page', now()));
  else if (message === 'done') apply(timer.end('done-page', now()));
  else if (message === 'postpone') apply(timer.postpone(now()));
});

ipcMain.on('lifeboard-bar', (event, message: unknown) => {
  if (!fromOverlay(event.sender, 'bar')) return;
  if (message === 'skip') apply(timer.end('skip', now()));
  else if (message === 'postpone') apply(timer.postpone(now()));
});

// MARK: start

if (!app.requestSingleInstanceLock()) {
  // Already running: hand over (a second `pnpm break --now` starts a break in the running app) and quit.
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => { if (argv.includes('--now')) apply(timer.startBreak(now())); });
  // A tray app: closing the overlay windows must not quit it.
  app.on('window-all-closed', () => { /* keep running */ });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
  void app.whenReady().then(() => {
    if (process.platform === 'darwin') app.dock?.hide();
    session.fromPartition(PARTITION).setUserAgent(plainChromeUserAgent(app.userAgentFallback));
    fs.watchFile(settingsFile, { interval: 2000 }, () => { settings = readSettingsFile(); trayLabel = ''; refreshTray(); });
    tray = new Tray(trayIcon());
    refreshTray();
    watchPower();
    setInterval(onTick, 1000);
    log('start');
    if (process.argv.includes('--now')) apply(timer.startBreak(now()));
  });
}
