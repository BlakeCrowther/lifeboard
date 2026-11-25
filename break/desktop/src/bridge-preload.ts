/* Runs in every frame of the break page (the board sits in an iframe on claude.ai). Gives the page
   window.lifeboardBreak.{skip,postpone,done}(); the main process sends lifeboardbreaktick / lifeboardbreakend. */
import { contextBridge, ipcRenderer } from 'electron';

const send = (message: 'skip' | 'postpone' | 'done'): void => { ipcRenderer.send('lifeboard-break', message); };

contextBridge.exposeInMainWorld('lifeboardBreak', {
  active: true,
  skip: () => { send('skip'); },
  postpone: () => { send('postpone'); },
  done: () => { send('done'); },
});
