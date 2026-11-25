/* Lifeboard Break settings: a plain JSON file (settings.json in the app's data folder, see break-setup).
   A missing file, a missing key or a bad value falls back to the default for that key, never to a crash. */
import { z } from 'zod';

export const DEFAULTS = {
  workMinutes: 50,
  breakMinutes: 5,
  postponeMinutes: 5,
  maxPostpones: 2,
  skipDelaySeconds: 15,
  /** page shown during a break; empty = the bundled placeholder */
  url: '',
} as const;

const minutes = (fallback: number) => z.number().positive().catch(fallback);

const schema = z.object({
  workMinutes: minutes(DEFAULTS.workMinutes),
  breakMinutes: minutes(DEFAULTS.breakMinutes),
  postponeMinutes: minutes(DEFAULTS.postponeMinutes),
  maxPostpones: z.number().int().min(0).catch(DEFAULTS.maxPostpones),
  skipDelaySeconds: z.number().min(0).catch(DEFAULTS.skipDelaySeconds),
  url: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).catch(DEFAULTS.url),
});

export type BreakSettings = z.infer<typeof schema>;

export function parseSettings(raw: unknown): BreakSettings {
  const input = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return schema.parse({ ...DEFAULTS, ...input });
}

/** File text → settings; unreadable JSON is the same as no file. */
export function settingsFromText(text: string | null): BreakSettings {
  if (text === null) return parseSettings({});
  try { return parseSettings(JSON.parse(text)); } catch { return parseSettings({}); }
}
