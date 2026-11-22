/* A finished biome as a glass-dome diorama, drawn from its biomes.json look (palette + scene motif). */
import { escapeHtml, nextSvgIdPrefix } from './labels.ts';
import type { Biome } from './roster.ts';

/** scene motif -> the life inside the dome, given the biome's accent colour */
const SCENE_MOTIFS: Readonly<Record<string, (accent: string) => string>> = {
  reef: (accent) => `<path d="M28 61 q-3 -9 1 -14 M28 55 q4 -4 6 -9" stroke="${accent}" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="47" cy="58" rx="5" ry="3.5" fill="#d9a35a"/><path d="M53 61 q0 -8 3 -12 M56 61 q1 -6 4 -9" stroke="#b07ae0" stroke-width="1.8" fill="none"/><path d="M36 44 q3 -2 6 0 q-3 2 -6 0z M42 44 l2 -1.5 v3z" fill="#ff9a3c"/>`,
  kelp: (accent) => `<path d="M24 61 q-4 -12 1 -24 q3 -6 0 -9 M31 61 q4 -14 -1 -27 M50 61 q-3 -10 2 -22 q2 -5 -1 -8 M57 61 q3 -9 0 -18" stroke="#8a7a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/><circle cx="40" cy="58" r="2.4" fill="#3a1f5a"/><path d="M38 44 q3 -2 6 0 q-3 2 -6 0z" fill="${accent}"/>`,
  tidepool: (accent) => `<ellipse cx="26" cy="59" rx="7" ry="4" fill="#5f5a55"/><ellipse cx="55" cy="58" rx="8" ry="5" fill="#4f4a45"/><path d="M40 52 l1.6 3.4 3.7 .4 -2.8 2.4 .9 3.6 -3.4 -1.9 -3.3 1.9 .8 -3.6 -2.8 -2.4 3.7 -.4z" fill="${accent}"/><circle cx="30" cy="55" r="2.6" fill="#3ac06a"/><circle cx="52" cy="52" r="2" fill="#8a2ad0"/>`,
  mangrove: (accent) => `<path d="M40 30 v18 M40 46 q-8 2 -12 15 M40 46 q-3 5 -5 15 M40 46 q4 4 6 15 M40 46 q9 3 13 15" stroke="#5a4632" stroke-width="2" fill="none"/><ellipse cx="40" cy="33" rx="13" ry="6" fill="#4a6a2a"/><path d="M26 61 v-3 M30 61 v-4 M50 61 v-3 M55 61 v-4" stroke="#6a5a42" stroke-width="1"/><path d="M46 52 q2 -1.5 4 0 q-2 1.5 -4 0z" fill="${accent}"/>`,
  deep: (accent) => `<path d="M30 40 a4 3 0 0 1 8 0z M48 34 a3.5 2.6 0 0 1 7 0z" fill="${accent}" opacity=".85"/><path d="M31 40 v7 M34 40 v9 M37 40 v6 M49 34 v6 M52 34 v8" stroke="${accent}" stroke-width=".6" opacity=".8"/><path d="M27 61 v-12 M29 61 v-8 M55 61 v-10" stroke="#cfe8ff" stroke-width="1.6" opacity=".7"/><circle cx="42" cy="50" r="1" fill="#ffd36b"/><circle cx="24" cy="44" r=".8" fill="${accent}"/><circle cx="58" cy="46" r=".8" fill="${accent}"/>`,
  meadow: (accent) => `<circle cx="30" cy="52" r="5" fill="#4f8f3a"/><circle cx="48" cy="50" r="6.5" fill="#3f7f34"/><path d="M27 61 v-6 M36 61 v-8 M44 61 v-5 M53 61 v-7" stroke="#4f8a3a" stroke-width="1"/><circle cx="27" cy="54" r="1.8" fill="${accent}"/><circle cx="36" cy="52" r="1.8" fill="#e57e9d"/><circle cx="44" cy="55" r="1.6" fill="#fff"/><circle cx="53" cy="53" r="1.8" fill="#b98cff"/>`,
  canopy: (accent) => `<ellipse cx="32" cy="58" rx="10" ry="3.5" fill="#fff" opacity=".9"/><ellipse cx="51" cy="57" rx="9" ry="3" fill="#fff" opacity=".85"/><path d="M16 46 q14 -5 26 -2 q12 2 22 -3" stroke="#4f6a3a" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M24 46 v4 M30 45 v5 M46 44 v4 M54 43 v5" stroke="#5f8a3f" stroke-width=".8"/><circle cx="36" cy="42" r="2" fill="${accent}"/><circle cx="50" cy="40" r="1.6" fill="#f0e0ff"/>`,
  jungle: (accent) => `<path d="M30 30 v31" stroke="#6a5d4c" stroke-width="4"/><path d="M26 61 l4 -7 4 7z" fill="#6a5d4c"/><path d="M48 36 q1 10 -1 18 M54 34 q-1 8 1 14" stroke="#3a5a22" stroke-width="1" fill="none"/><path d="M40 60 q-12 -4 -14 -12 q8 -1 14 12z M42 60 q10 -6 18 -8 q-4 9 -18 8z M38 60 q2 -12 8 -16 q2 9 -8 16z" fill="#2f7a2a"/><path d="M52 61 l-3 -5 M52 61 l0 -6 M52 61 l3 -5" stroke="${accent}" stroke-width="1.6" stroke-linecap="round"/><circle cx="36" cy="40" r=".9" fill="#fff06a"/><circle cx="44" cy="46" r=".8" fill="#fff06a"/>`,
};
const MEDIUM_SCENES: Readonly<Record<string, string>> = { water: 'reef', land: 'meadow', air: 'canopy' };
const DEFAULT_PALETTE = ['#7fd3e6', '#1f6f9a', '#e9d3a6', '#ff7f6b'];

/** palette: [water top, water bottom, ground, accent] */
export function dioramaSVG(biome: Biome, width = 96): string {
  const idPrefix = nextSvgIdPrefix('gd');
  const [waterTop, waterBottom, ground, accent] = (biome.look?.palette ?? DEFAULT_PALETTE).map(String);
  const scene = biome.scene || (biome.medium === undefined ? undefined : MEDIUM_SCENES[biome.medium]) || 'reef';
  const life = (SCENE_MOTIFS[scene] ?? SCENE_MOTIFS.reef)?.(String(accent)) ?? '';
  const size = String(width);
  return `<svg class="gdio" viewBox="0 0 80 80" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(biome.name)} diorama"><defs><linearGradient id="${idPrefix}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${String(waterTop)}"/><stop offset="1" stop-color="${String(waterBottom)}"/></linearGradient><linearGradient id="${idPrefix}b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8723f"/><stop offset="1" stop-color="#6a401c"/></linearGradient><clipPath id="${idPrefix}c"><path d="M14 61 A26 26 0 0 1 66 61z"/></clipPath></defs>
      <ellipse cx="40" cy="73" rx="31" ry="4" fill="#000" opacity=".18"/><path d="M14 61 A26 26 0 0 1 66 61z" fill="url(#${idPrefix}w)" opacity=".92"/><g clip-path="url(#${idPrefix}c)"><path d="M14 61 q26 -9 52 0z" fill="${String(ground)}"/>${life}</g><path d="M14 61 A26 26 0 0 1 66 61" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2"/><path d="M22 47 A19 19 0 0 1 33 37" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/><rect x="10" y="60" width="60" height="11" rx="3" fill="url(#${idPrefix}b)"/><rect x="10" y="60" width="60" height="2.5" rx="1.2" fill="#f0c48e" opacity=".7"/></svg>`;
}
