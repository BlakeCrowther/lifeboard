/* Real-world weather and season: they change the look only, never the game. */

/** The board's conditions snapshot: condition text and when it was fetched (ms or a date string). */
export interface WeatherReading {
  condition: unknown;
  at: number | string | null;
}

/** 0..1 amounts the look mixes in */
export interface WeatherAmounts {
  cloud: number;
  rain: number;
  fog: number;
  snow: number;
  storm: number;
}

const STALE_MS = 12 * 3600e3;

/** Condition text as the board stored it (a string; numbers and booleans as text). */
export const conditionText = (condition: unknown): string =>
  typeof condition === 'string' ? condition : typeof condition === 'number' || typeof condition === 'boolean' ? String(condition) : '';

/** Condition text -> amounts. A reading older than 12 h counts as unknown (clear), so a stale report never darkens the scene.
    A forced condition (?weather=) is always fresh. */
export function weatherAmounts(reading: WeatherReading | null, forcedWeather: string | null, now: number): WeatherAmounts {
  const raw: WeatherReading | null = forcedWeather != null ? { condition: forcedWeather, at: now } : reading;
  let text = '';
  if (raw?.condition) {
    const at = typeof raw.at === 'number' ? raw.at : raw.at == null ? NaN : Date.parse(raw.at);
    const fresh = forcedWeather != null || (!!at && now - at < STALE_MS);
    if (fresh) text = conditionText(raw.condition).toLowerCase();
  }
  const has = (...words: string[]): boolean => words.some((word) => text.includes(word));
  const storm = has('thunder', 'storm') ? 1 : 0;
  const snow = has('snow', 'sleet', 'flurr', 'ice') ? 1 : 0;
  const rain = storm || has('heavy rain', 'downpour') ? 1 : has('rain', 'shower') ? 0.65 : has('drizzle') ? 0.35 : 0;
  const fog = has('fog') ? 1 : has('mist', 'haze', 'smoke') ? 0.5 : 0;
  const cloud = Math.max(rain, snow * 0.8, storm, has('overcast') ? 0.85 : has('mostly cloudy') ? 0.65 : has('cloud') ? 0.4 : 0);
  return { cloud, rain, fog, snow, storm };
}

/** Season -1 (winter solstice) .. 1 (summer solstice). A forced month (1-12) counts as mid-month. */
export function seasonValue(forcedMonth: number | null, now: Date): number {
  const dayOfYear = forcedMonth ? (forcedMonth - 1) * 30.4 + 15 : (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 864e5;
  return Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365);
}
