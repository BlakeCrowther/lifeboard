// Starts Lifeboard Break (Electron, break/desktop) at login and now; `--uninstall` stops it and removes the login entry.
// It runs from this clone (node_modules' Electron + break/out/desktop), so keep the clone where it is.
// Run after a build: pnpm break:install [--uninstall]. Settings stay in the app's settings.json either way.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const uninstall = process.argv.includes('--uninstall');
const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'desktop', 'main.cjs');
const electron = createRequire(import.meta.url)('electron') as string;
const LABEL = 'com.lifeboard.break';

function stopRunning(): void {
  try {
    if (process.platform === 'win32') execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${main.replace(/'/g, "''")}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`], { stdio: 'ignore' });
    else execFileSync('pkill', ['-f', main], { stdio: 'ignore' });
  } catch { /* not running */ }
}

/** Ubuntu 23.10+ blocks the user-namespace sandbox, so Electron run from node_modules dies at start unless its
    setuid helper is set up. Prints the fix instead of failing silently at every login. */
function warnIfSandboxBlocked(): void {
  let restricted = false;
  try { restricted = fs.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'; } catch { /* not AppArmor */ }
  const helper = path.join(path.dirname(electron), 'chrome-sandbox');
  let setuid = false;
  try { const st = fs.statSync(helper); setuid = st.uid === 0 && (st.mode & 0o4000) !== 0; } catch { /* no helper */ }
  if (restricted && !setuid) {
    console.warn(`Electron's sandbox is blocked on this system (AppArmor). Fix once, then run this again:\n  sudo chown root:root "${helper}" && sudo chmod 4755 "${helper}"`);
  }
}

function linux(): void {
  if (!uninstall) warnIfSandboxBlocked();
  const file = path.join(process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config'), 'autostart', 'lifeboard-break.desktop');
  if (uninstall) { fs.rmSync(file, { force: true }); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    '[Desktop Entry]', 'Type=Application', 'Name=Lifeboard Break', 'Comment=Timed breaks that show the lifeboard',
    `Exec="${electron}" "${main}"`, 'X-GNOME-Autostart-enabled=true', 'NoDisplay=true', '',
  ].join('\n'));
  console.log(`login entry: ${file}`);
}

function mac(): void {
  // Same label as the Swift app's LaunchAgent (break/install.sh): installing one replaces the other.
  const file = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const domain = `gui/${String(process.getuid?.() ?? '')}`;
  try { execFileSync('launchctl', ['bootout', domain, file], { stdio: 'ignore' }); } catch { /* not loaded */ }
  try { execFileSync('pkill', ['-x', 'LifeboardBreak'], { stdio: 'ignore' }); } catch { /* not running */ }
  if (uninstall) { fs.rmSync(file, { force: true }); return; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${esc(electron)}</string><string>${esc(main)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
`);
  execFileSync('launchctl', ['bootstrap', domain, file]);
  console.log(`login entry: ${file} (started)`);
}

function windows(): void {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  if (uninstall) { try { execFileSync('reg', ['delete', key, '/v', 'LifeboardBreak', '/f'], { stdio: 'ignore' }); } catch { /* absent */ } return; }
  execFileSync('reg', ['add', key, '/v', 'LifeboardBreak', '/t', 'REG_SZ', '/d', `"${electron}" "${main}"`, '/f'], { stdio: 'ignore' });
  console.log(`login entry: ${key}\\LifeboardBreak`);
}

if (!uninstall && !fs.existsSync(main)) { console.error('break/out/desktop/main.cjs missing: run pnpm break:build'); process.exit(1); }
stopRunning();
if (process.platform === 'linux') linux();
else if (process.platform === 'darwin') mac();
else if (process.platform === 'win32') windows();
else { console.error(`unsupported platform ${process.platform}`); process.exit(1); }

if (uninstall) console.log('uninstalled (settings kept)');
else if (process.platform !== 'darwin') {
  // launchd already started it on macOS
  spawn(electron, [main], { detached: true, stdio: 'ignore' }).unref();
  console.log('started; it also starts at login');
}
