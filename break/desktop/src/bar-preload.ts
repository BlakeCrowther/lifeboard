/* The break bar's link to the main process: its buttons, and the countdown state it shows. */
import { contextBridge, ipcRenderer } from 'electron';
import type { BarState } from './bar-state.ts';

contextBridge.exposeInMainWorld('barHost', {
  skip: () => { ipcRenderer.send('lifeboard-bar', 'skip'); },
  postpone: () => { ipcRenderer.send('lifeboard-bar', 'postpone'); },
  onState: (show: (state: BarState) => void) => { ipcRenderer.on('bar-state', (_event, state: BarState) => { show(state); }); },
});
