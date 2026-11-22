/* Ask Claude: a short chat about one task, run in the page through the sample capability (same as Adjust). */
import { weekdayOf } from '../../dates/index.ts';
import { errorCode, useSample, type SampleCapability } from '../shared/artifact-runtime.ts';
import { clock, weekdayName } from '../shared/clock.ts';
import { escapeHtml } from '../shared/format.ts';
import { model, profile, viewState, type ChatMessage, type Sheet } from '../shared/state.ts';
import { taskPrompt } from '../shared/task-row.ts';

/** The log as shown: each message's shown text when it has one. */
export function chatLogHtml(c: Sheet): string {
  return (c.messages ?? []).map((m) => `<div class="cm ${m.role}">${escapeHtml(m.shown || m.content || '…')}</div>`).join('') + (c.error ? `<p class="qhint" style="color:var(--bad)">${escapeHtml(c.error)}</p>` : '');
}
/** The chat so far as plain text, for "Copy for a full chat". */
export const chatTranscript = (messages: readonly ChatMessage[]): string => messages.map((m) => (m.role === 'user' ? 'Me: ' : 'Claude: ') + m.content).join('\n\n');

export async function sendChat(text: string, redrawSheet: () => void): Promise<void> {
  const c = viewState.sheet;
  if (!c || c.kind !== 'chat' || c.busy) return;
  const t = model.tasks.find((x) => x.id === c.taskId);
  if (!t) return;
  const messages = (c.messages ??= []);
  let sample: SampleCapability | null;
  try { sample = await useSample(); } catch { sample = null; }
  if (!sample) { c.error = 'Claude isn’t available in this view. Use Copy for a full chat.'; redrawSheet(); return; }
  const first = !messages.length;
  const context = `You are helping ${profile.name || 'someone'} with one task from their personal dashboard. Today is ${weekdayName(weekdayOf(clock.today))} ${clock.today}. Be concise and practical: concrete next steps, drafts they can paste, short questions only when needed. Plain text, no markdown headers.\n\n` + taskPrompt(t, false);
  messages.push({ role: 'user', content: first ? context + (text ? '\n\n' + text : '') : text, shown: text || 'Help me get started.' });
  if (!first && !text) { messages.pop(); return; }
  const reply: ChatMessage = { role: 'assistant', content: '' };
  messages.push(reply);
  c.busy = true;
  c.error = '';
  redrawSheet();
  const drawLog = (): void => {
    const el = document.getElementById('chatLog');
    if (el && viewState.sheet === c) { el.innerHTML = chatLogHtml(c); el.lastElementChild?.scrollIntoView({ block: 'end' }); }
  };
  const ask = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
  try {
    const r = await sample(ask, { cache: false, onText: ({ text: partial }) => { reply.content = partial; drawLog(); } });
    reply.content = r.text;
  } catch (e) {
    messages.pop();
    messages.pop();
    const code = errorCode(e);
    c.error = code === 'rate_limited' ? 'Claude is busy. Try again in a minute.' : code === 'not_granted' ? 'Claude isn’t allowed here. Use Copy for a full chat.' : 'Couldn’t reach Claude. Try again.';
  }
  c.busy = false;
  if (viewState.sheet === c) { redrawSheet(); drawLog(); document.getElementById('chatIn')?.focus(); }
}
