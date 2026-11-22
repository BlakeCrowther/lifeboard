/* eslint-disable @typescript-eslint/restrict-template-expressions -- SVG geometry: numbers interpolate straight into path data, and String() on each would bury the shapes */
/* Garden plants as SVG (look from the "Lifeboard Garden & Reef Styles" canvas): a raised bed plus one species per plot.
   Each species has its own shape per stage; the look only recolours its accent (petals, cap, blossoms, tips):
   common = the species' own colour, rare = coral, exotic = violet with sparkles, mutated = every other accent teal.
   Thirsty and withered reuse the species' own shape, drooped and dried.
   Shapes use `url(#P-…)` for shared gradients; renderPlant rewrites that to the SVG's own id prefix. */
import { PLANT_STAGES, escapeHtml, lookLabel, nextSvgIdPrefix } from './labels.ts';
import { rosterPlants } from './roster.ts';

/** stage: seed|sprout|leafy|bud|bloom|wilt|dead. base: the stage drawn under wilt/dead. */
export interface PlantLook {
  /** species id: an SVG species or a roster plant (drawn as its `svg` species) */
  kind?: string | undefined;
  rarity?: string | undefined;
  mutated?: boolean | undefined;
  base?: string | undefined;
}

const DEFS = (prefix: string): string => `<defs>
<linearGradient id="${prefix}wl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c88f5c"/><stop offset="1" stop-color="#a8723f"/></linearGradient>
<linearGradient id="${prefix}wr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#875628"/><stop offset="1" stop-color="#6a401c"/></linearGradient>
<linearGradient id="${prefix}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0c48e"/><stop offset=".5" stop-color="#dba46a"/><stop offset="1" stop-color="#b98048"/></linearGradient>
<radialGradient id="${prefix}soil" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#7a5236"/><stop offset=".7" stop-color="#5a3a26"/><stop offset="1" stop-color="#3a2416"/></radialGradient>
<linearGradient id="${prefix}l1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3ec98"/><stop offset=".5" stop-color="#7cc25a"/><stop offset="1" stop-color="#3f7f34"/></linearGradient>
<linearGradient id="${prefix}l2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd877"/><stop offset=".6" stop-color="#5f9e45"/><stop offset="1" stop-color="#346b2b"/></linearGradient>
<linearGradient id="${prefix}dry" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8c890"/><stop offset="1" stop-color="#8f7f48"/></linearGradient>
<radialGradient id="${prefix}pet" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff4c2"/><stop offset=".55" stop-color="#f5c73e"/><stop offset="1" stop-color="#cf931a"/></radialGradient>
<radialGradient id="${prefix}bud" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd3df"/><stop offset=".6" stop-color="#e57e9d"/><stop offset="1" stop-color="#b24d6d"/></radialGradient>
<radialGradient id="${prefix}peh" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe6dc"/><stop offset=".55" stop-color="#ff8a6b"/><stop offset="1" stop-color="#c9452e"/></radialGradient>
<radialGradient id="${prefix}pex" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f1e6ff"/><stop offset=".55" stop-color="#a77bf0"/><stop offset="1" stop-color="#5b34b8"/></radialGradient>
<radialGradient id="${prefix}pmu" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6fffa"/><stop offset=".55" stop-color="#5fd3c4"/><stop offset="1" stop-color="#1f8f86"/></radialGradient>
<radialGradient id="${prefix}ptu" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffd0c4"/><stop offset=".55" stop-color="#e8413a"/><stop offset="1" stop-color="#9e1f24"/></radialGradient>
<radialGradient id="${prefix}pmr" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#ff9a8a"/><stop offset=".6" stop-color="#d63a2c"/><stop offset="1" stop-color="#8a1c14"/></radialGradient>
<radialGradient id="${prefix}pbl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#ffc6d8"/><stop offset="1" stop-color="#e88aa8"/></radialGradient>
<radialGradient id="${prefix}plv" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e8dcff"/><stop offset=".6" stop-color="#9a7fd6"/><stop offset="1" stop-color="#5e479e"/></radialGradient>
<linearGradient id="${prefix}cac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8fcf7a"/><stop offset=".55" stop-color="#4f9a4a"/><stop offset="1" stop-color="#2f6b3a"/></linearGradient>
<linearGradient id="${prefix}bark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a42"/><stop offset="1" stop-color="#5a3a22"/></linearGradient>
<linearGradient id="${prefix}sage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8cfa4"/><stop offset="1" stop-color="#6f8f5a"/></linearGradient>
<filter id="${prefix}fdry"><feColorMatrix type="matrix" values=".5 .42 .14 0 .06  .42 .4 .12 0 .04  .3 .3 .1 0 0  0 0 0 1 0"/></filter>
<filter id="${prefix}fdead"><feColorMatrix type="matrix" values=".34 .3 .1 0 .06  .3 .28 .1 0 .04  .22 .2 .08 0 .02  0 0 0 1 0"/></filter>
<radialGradient id="${prefix}ctr" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#f6a466"/><stop offset="1" stop-color="#a8460f"/></radialGradient>
<radialGradient id="${prefix}sh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${prefix}gl" cx=".3" cy=".2" r=".9"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></radialGradient></defs>`;
const BED = (prefix: string): string => `<ellipse cx="42" cy="58" rx="40" ry="9" fill="url(#${prefix}sh)"/><path d="M4 26 L40 44 L40 59 L4 41z" fill="url(#${prefix}wl)"/><path d="M40 44 L76 26 L76 41 L40 59z" fill="url(#${prefix}wr)"/>
<path d="M6 31 L38 47 M6 36 L38 52" stroke="#8f5e30" stroke-width=".6" stroke-opacity=".6" fill="none"/><path d="M42 47 L74 31 M42 52 L74 36" stroke="#4e2e12" stroke-width=".6" stroke-opacity=".55" fill="none"/>
<path d="M40 7 L77 26 L40 45 L3 26z" fill="url(#${prefix}rim)"/><path d="M40 12.5 L68 26.5 L40 40.5 L12 26.5z" fill="url(#${prefix}soil)"/><path d="M40 12.5 L68 26.5 L65 28 L40 15.5 L15 28 L12 26.5z" fill="#1e120a" opacity=".55"/>
<g fill="#8a6142" opacity=".8"><circle cx="27" cy="29" r=".9"/><circle cx="51" cy="31" r=".8"/><circle cx="45" cy="36" r="1"/><circle cx="56" cy="25" r=".9"/></g>`;

type Accent = (index: number) => string;
type SpeciesDrawing = (stage: string, accent: Accent, leaf: string, leafAlt: string) => string | undefined;

const RARITY_ACCENT: Readonly<Record<string, string>> = { rare: 'peh', exotic: 'pex' };
const SPECIES_ACCENT: Readonly<Record<string, string>> = { daisy: 'pet', tulip: 'ptu', sunflower: 'pet', mushroom: 'pmr', cactus: 'bud', fern: 'pet', bonsai: 'pbl', lavender: 'plv' };

const byStage = (stages: Readonly<Record<string, string>>, stage: string): string | undefined => stages[stage];
const soilShadow = (rx: number): string => `<ellipse cx="${40 + rx * 0.25}" cy="29" rx="${rx}" ry="${Math.max(2.6, rx * 0.32)}" fill="#1e120a" opacity=".45"/>`;
const stem = (y2: number, width = 2.2, bend = -1): string => `<path d="M40 28 Q${40 + bend} ${(28 + y2) / 2} 40 ${y2}" stroke="#4a7d3a" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
const leafLeft = (y: number, scale: number, fill: string): string => `<path d="M40 ${y} q${-12 * scale} ${-7 * scale} ${-16 * scale} ${2 * scale} q${7 * scale} ${4 * scale} ${16 * scale} ${-2 * scale}z" fill="${fill}"/>`;
const leafRight = (y: number, scale: number, fill: string): string => `<path d="M40 ${y} q${12 * scale} ${-8 * scale} ${17 * scale} 0 q${-7 * scale} ${5 * scale} ${-17 * scale} 0z" fill="${fill}"/>`;
/** count petals of petalSize around (cx, cy) at radius, coloured by accent(i) */
const petalRing = (cx: number, cy: number, count: number, radius: number, petalSize: number, accent: Accent, rotation = 0): string =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rotation;
    return `<ellipse cx="${(cx + Math.cos(angle) * radius).toFixed(1)}" cy="${(cy + Math.sin(angle) * radius).toFixed(1)}" rx="${petalSize}" ry="${(petalSize * 0.55).toFixed(1)}" transform="rotate(${((angle * 180) / Math.PI).toFixed(0)} ${(cx + Math.cos(angle) * radius).toFixed(1)} ${(cy + Math.sin(angle) * radius).toFixed(1)})" fill="${accent(i)}"/>`;
  }).join('');

const SPECIES_DRAWINGS: Readonly<Record<string, SpeciesDrawing>> = {
  daisy: (stage, accent, leaf, leafAlt) =>
    byStage(
      {
        sprout: soilShadow(8) + stem(15, 2, -0.5) + `<path d="M40 17 q-8 -6 -11 1 q5 3 11 -1z" fill="${leaf}"/><path d="M40 15 q8 -7 12 -1 q-6 4 -12 1z" fill="${leafAlt}"/>`,
        leafy: soilShadow(11) + stem(2) + leafLeft(22, 1, leaf) + leafRight(17, 1, leafAlt) + leafLeft(10, 0.85, leaf) + leafRight(5, 0.75, leafAlt),
        bud: soilShadow(11) + stem(-3) + leafLeft(22, 1, leaf) + leafRight(14, 1, leafAlt) + `<ellipse cx="40" cy="-8" rx="5" ry="7.5" fill="${accent(0)}"/><path d="M36 -3 q4 -4 8 0" stroke="#4a7d3a" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
        bloom:
          soilShadow(12) + stem(-4, 2.4) + leafLeft(21, 1.05, leaf) + leafRight(12, 1.05, leafAlt) +
          ([[40, -16], [47.2, -11], [44.5, -3], [35.5, -3], [32.8, -11]] as const).map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5.2" fill="${accent(i)}"/>`).join('') +
          `<circle cx="40" cy="-9" r="4.2" fill="url(#P-ctr)"/>`,
      },
      stage,
    ),
  tulip: (stage, accent, leaf, leafAlt) =>
    byStage(
      {
        sprout: soilShadow(8) + `<path d="M40 28 q-8 -6 -3 -15 q4 7 3 15z" fill="${leaf}"/><path d="M40 28 q7 -5 4 -12 q-5 5 -4 12z" fill="${leafAlt}"/>`,
        leafy: soilShadow(11) + `<path d="M40 28 q-14 -10 -6 -26 q6 12 6 26z" fill="${leaf}"/><path d="M40 28 q12 -8 8 -22 q-8 10 -8 22z" fill="${leafAlt}"/>`,
        bud: soilShadow(11) + stem(-2, 2.2, 0) + `<path d="M40 28 q-14 -10 -6 -24 q6 12 6 24z" fill="${leaf}"/><path d="M40 28 q12 -8 8 -20 q-8 10 -8 20z" fill="${leafAlt}"/><path d="M36 -4 q-1 -10 4 -13 q5 3 4 13 q-4 2 -8 0z" fill="${accent(0)}"/>`,
        bloom:
          soilShadow(12) + stem(-4, 2.4, 0) +
          `<path d="M40 28 q-15 -10 -7 -25 q7 12 7 25z" fill="${leaf}"/><path d="M40 28 q13 -8 9 -21 q-9 10 -9 21z" fill="${leafAlt}"/><path d="M31 -18 q0 14 9 14 q9 0 9 -14 q-3 4 -5 0 q-2 -5 -4 -5 q-2 0 -4 5 q-2 4 -5 0z" fill="${accent(0)}"/><path d="M36 -19 q4 -4 8 0 q-1 9 -4 11 q-3 -2 -4 -11z" fill="${accent(1)}" opacity=".9"/>`,
      },
      stage,
    ),
  sunflower: (stage, accent, leaf, leafAlt) =>
    byStage(
      {
        sprout: soilShadow(8) + stem(16, 2.2, 0) + `<ellipse cx="35.5" cy="16" rx="5" ry="2.6" fill="${leaf}"/><ellipse cx="44.5" cy="16" rx="5" ry="2.6" fill="${leafAlt}"/>`,
        leafy: soilShadow(11) + stem(-2, 2.8, 0) + leafLeft(20, 1.15, leaf) + leafRight(12, 1.1, leafAlt) + leafLeft(3, 0.9, leaf),
        bud: soilShadow(12) + stem(-10, 3, 0) + leafLeft(20, 1.2, leaf) + leafRight(10, 1.15, leafAlt) + leafLeft(0, 0.95, leaf) + petalRing(40, -15, 10, 5.2, 2.4, accent) + `<circle cx="40" cy="-15" r="5.2" fill="url(#P-l2)"/>`,
        bloom:
          soilShadow(13) + stem(-8, 3.2, 0) + leafLeft(20, 1.2, leaf) + leafRight(10, 1.15, leafAlt) + leafLeft(1, 1, leaf) + petalRing(40, -16, 14, 8.4, 4, accent) +
          `<circle cx="40" cy="-16" r="6.4" fill="#5a3416"/><g fill="#8a5a2a">${([[-2, -2], [2, -2], [0, 1], [-3, 2], [3, 2], [0, -4]] as const).map(([x, y]) => `<circle cx="${40 + x}" cy="${-16 + y}" r=".8"/>`).join('')}</g>`,
      },
      stage,
    ),
  mushroom: (stage, accent) => {
    /** dots: [x, y] as fractions of the cap, and radius */
    const cap = (cx: number, cy: number, rx: number, ry: number, fill: string, dots?: readonly (readonly [number, number, number])[]): string =>
      `<path d="M${cx - rx} ${cy} q0 ${-ry * 1.4} ${rx} ${-ry * 1.4} q${rx} 0 ${rx} ${ry * 1.4}z" fill="${fill}"/>${dots ? dots.map(([x, y, r]) => `<ellipse cx="${cx + x * rx}" cy="${cy - y * ry}" rx="${r}" ry="${r * 0.7}" fill="#fff8ec" opacity=".92"/>`).join('') : ''}`;
    const foot = (cx: number, top: number, width: number): string =>
      `<path d="M${cx - width / 2} 28 q-1 ${(top - 28) / 2} ${width * 0.15} ${top - 28} h${width * 0.7} q1.2 ${(28 - top) / 2} ${width * 0.15} ${28 - top}z" fill="#f2e6cf"/>`;
    return byStage(
      {
        sprout: soilShadow(6) + foot(40, 22, 2.4) + cap(40, 22.5, 2.6, 2, accent(0)),
        leafy: soilShadow(9) + foot(40, 16, 5) + cap(40, 17, 7, 4.5, accent(0), [[-0.4, 0.8, 1], [0.35, 0.95, 0.8]]),
        bud: soilShadow(12) + foot(39, 8, 6) + cap(39, 9, 10, 6.5, accent(0), [[-0.5, 0.7, 1.4], [0.2, 1.1, 1.1], [0.55, 0.6, 0.9]]) + foot(50, 22, 3) + cap(50, 22.5, 4, 3, accent(1)),
        bloom:
          soilShadow(15) + foot(40, -2, 7) + cap(40, -1, 15, 9, accent(0), [[-0.55, 0.6, 1.8], [-0.1, 1.15, 1.5], [0.4, 0.75, 1.6], [0.75, 0.35, 1], [-0.85, 0.25, 0.9]]) +
          foot(26, 20, 3.5) + cap(26, 20.5, 5, 3.5, accent(1), [[0, 1, 0.8]]) + foot(54, 18, 4) + cap(54, 18.5, 6, 4, accent(2), [[-0.3, 0.9, 0.9]]),
      },
      stage,
    );
  },
  cactus: (stage, accent) => {
    const column = (x: number, y: number, width: number, height: number): string =>
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${width / 2}" fill="url(#P-cac)"/><path d="M${x + width / 2} ${y + 2} v${height - 3}" stroke="#2f6b3a" stroke-width=".7" opacity=".7"/>`;
    const spines = (points: readonly (readonly [number, number])[]): string => `<g fill="#f6f1d8">${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55"/>`).join('')}</g>`;
    return byStage(
      {
        sprout: soilShadow(6) + `<ellipse cx="40" cy="24" rx="4.5" ry="5" fill="url(#P-cac)"/>` + spines([[38, 22], [42, 23], [40, 20]]),
        leafy: soilShadow(9) + column(35, 4, 10, 25) + spines([[37, 9], [43, 12], [37, 17], [43, 21], [38, 25]]),
        bud:
          soilShadow(12) + column(35, -4, 10, 33) + `<path d="M35 14 h-5 q-2 0 -2 -2 v-8" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/>` +
          spines([[37, 2], [43, 6], [37, 12], [43, 18], [29, 4]]) + `<ellipse cx="40" cy="-6" rx="2.6" ry="3.4" fill="${accent(0)}"/>`,
        bloom:
          soilShadow(14) + column(35, -8, 10, 37) +
          `<path d="M35 12 h-5 q-2 0 -2 -2 v-10" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M45 6 h5 q2 0 2 -2 v-7" stroke="url(#P-cac)" stroke-width="5" stroke-linecap="round" fill="none"/>` +
          spines([[37, -2], [43, 2], [37, 8], [43, 14], [29, 2], [51, -2]]) + petalRing(40, -11, 6, 3.4, 2.8, accent, -Math.PI / 2) + `<circle cx="40" cy="-11" r="1.8" fill="#f5c73e"/>` + `<circle cx="28" cy="-2" r="1.8" fill="${accent(1)}"/>`,
      },
      stage,
    );
  },
  fern: (stage, accent, leaf, leafAlt) => {
    /** a frond leaning `degrees` from upright, `length` long, with an optional tip dot */
    const frond = (degrees: number, length: number, fill: string, tip?: string): string => {
      const angle = (degrees * Math.PI) / 180;
      const tipX = 40 + Math.sin(angle) * length;
      const tipY = 28 - Math.cos(angle) * length;
      const bendX = 40 + Math.sin(angle) * length * 0.5 + Math.cos(angle) * 3;
      const bendY = 28 - Math.cos(angle) * length * 0.5 + Math.sin(angle) * 3;
      let leaflets = '';
      for (let i = 1; i < 6; i++) {
        const along = i / 6;
        const x = 40 + (tipX - 40) * along;
        const y = 28 + (tipY - 28) * along;
        const size = 4.5 * (1 - along * 0.7);
        leaflets += `<ellipse cx="${(x - Math.cos(angle) * size * 0.7).toFixed(1)}" cy="${(y - Math.sin(angle) * size * 0.7).toFixed(1)}" rx="${size.toFixed(1)}" ry="1.4" transform="rotate(${degrees - 60} ${(x - Math.cos(angle) * size * 0.7).toFixed(1)} ${(y - Math.sin(angle) * size * 0.7).toFixed(1)})" fill="${fill}"/><ellipse cx="${(x + Math.cos(angle) * size * 0.7).toFixed(1)}" cy="${(y + Math.sin(angle) * size * 0.7).toFixed(1)}" rx="${size.toFixed(1)}" ry="1.4" transform="rotate(${degrees + 60} ${(x + Math.cos(angle) * size * 0.7).toFixed(1)} ${(y + Math.sin(angle) * size * 0.7).toFixed(1)})" fill="${fill}"/>`;
      }
      return `<path d="M40 28 Q${bendX.toFixed(1)} ${bendY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}" stroke="#3f7a35" stroke-width="1.3" fill="none"/>${leaflets}${tip ? `<circle cx="${tipX.toFixed(1)}" cy="${tipY.toFixed(1)}" r="1.9" fill="${tip}"/>` : ''}`;
    };
    const fiddlehead = (x: number, y: number, stroke: string): string =>
      `<path d="M40 28 Q${x - 2} ${(28 + y) / 2} ${x} ${y}" stroke="#4a7d3a" stroke-width="1.6" fill="none"/><circle cx="${x + 1.6}" cy="${y}" r="2.2" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
    return byStage(
      {
        sprout: soilShadow(7) + fiddlehead(40, 16, '#5f9e45'),
        leafy: soilShadow(11) + frond(-35, 20, leaf) + frond(0, 24, leafAlt) + frond(35, 20, leaf),
        bud: soilShadow(13) + frond(-55, 22, leaf) + frond(-20, 28, leafAlt) + frond(20, 28, leaf) + frond(55, 22, leafAlt) + fiddlehead(36, 6, accent(0)) + fiddlehead(45, 4, accent(1)),
        bloom: soilShadow(15) + ([[-65, 24], [-35, 32], [-8, 36], [18, 35], [45, 31], [70, 23]] as const).map(([degrees, length], i) => frond(degrees, length, i % 2 ? leafAlt : leaf, accent(i))).join(''),
      },
      stage,
    );
  },
  bonsai: (stage, accent, leaf, leafAlt) => {
    const foliagePad = (cx: number, cy: number, rx: number, ry: number, fill: string): string =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"/><ellipse cx="${cx - rx * 0.3}" cy="${cy - ry * 0.35}" rx="${rx * 0.55}" ry="${ry * 0.45}" fill="#c3ec98" opacity=".35"/>`;
    const blossoms = (points: readonly (readonly [number, number])[]): string => points.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="2.1" fill="${accent(i)}"/>`).join('');
    const trunk = (height: number): string =>
      `<path d="M38 28 q-2 ${-height * 0.3} 3 ${-height * 0.5} q5 ${-height * 0.2} 0 ${-height * 0.5}" stroke="url(#P-bark)" stroke-width="${2.5 + height * 0.08}" stroke-linecap="round" fill="none"/>`;
    return byStage(
      {
        sprout: soilShadow(6) + `<path d="M40 28 q1 -6 0 -10" stroke="#7a5236" stroke-width="1.6" fill="none"/>` + foliagePad(37, 17, 3.5, 2, leaf) + foliagePad(43, 16, 3, 1.8, leafAlt),
        leafy: soilShadow(10) + trunk(18) + foliagePad(40, 9, 9, 5, leafAlt) + foliagePad(33, 14, 5, 3, leaf),
        bud:
          soilShadow(13) + trunk(30) + `<path d="M42 12 q6 -2 9 -6" stroke="url(#P-bark)" stroke-width="2" fill="none"/>` +
          foliagePad(40, -3, 11, 6, leafAlt) + foliagePad(52, -6, 7, 4, leaf) + foliagePad(30, 8, 7, 4, leaf) + blossoms([[38, -6], [44, -2], [53, -8], [30, 6]]),
        bloom:
          soilShadow(15) + trunk(34) + `<path d="M42 10 q7 -2 11 -8 M39 16 q-6 -1 -10 -5" stroke="url(#P-bark)" stroke-width="2.2" fill="none"/>` +
          foliagePad(40, -7, 13, 7, leafAlt) + foliagePad(55, -7, 8, 5, leaf) + foliagePad(27, 7, 8, 4.5, leaf) +
          blossoms([[33, -9], [38, -12], [44, -10], [48, -5], [36, -4], [42, -3], [53, -9], [58, -6], [24, 6], [29, 4], [31, 8], [46, -13]]),
      },
      stage,
    );
  },
  lavender: (stage, accent) => {
    const blade = (dx: number, height: number, stroke: string): string => `<path d="M40 28 q${dx * 0.3} ${-height * 0.6} ${dx} ${-height}" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`;
    /** a flower spike of `florets` pairs, coloured by accentAt(floret index) */
    const spike = (dx: number, height: number, florets: number, accentAt: Accent): string => {
      let markup = `<path d="M40 28 q${dx * 0.4} ${-height * 0.5} ${dx} ${-height}" stroke="#6f8f5a" stroke-width="1.2" fill="none"/>`;
      for (let i = 0; i < florets; i++) {
        const y = 28 - height + i * 2.6;
        const x = 40 + dx * (1 - ((i * 2.6) / height) * 0.6);
        markup += `<ellipse cx="${(x - 1.1).toFixed(1)}" cy="${y.toFixed(1)}" rx="1.5" ry="1.9" fill="${accentAt(i)}"/><ellipse cx="${(x + 1.1).toFixed(1)}" cy="${(y + 1.2).toFixed(1)}" rx="1.5" ry="1.9" fill="${accentAt(i + 1)}"/>`;
      }
      return markup;
    };
    const tuft = (blades: number, height: number): string =>
      Array.from({ length: blades }, (_, i) => blade((i - (blades - 1) / 2) * 3.2, height - Math.abs(i - (blades - 1) / 2) * 2, i % 2 ? 'url(#P-sage)' : '#7fa86a')).join('');
    return byStage(
      {
        sprout: soilShadow(7) + tuft(4, 10),
        leafy: soilShadow(11) + tuft(7, 18),
        bud: soilShadow(12) + tuft(7, 16) + ([[-6, 34], [0, 40], [6, 35]] as const).map(([dx, height]) => spike(dx, height, 4, () => 'url(#P-l2)')).join(''),
        bloom: soilShadow(14) + tuft(7, 16) + ([[-12, 34], [-6, 42], [0, 48], [6, 43], [12, 35]] as const).map(([dx, height], spikeIndex) => spike(dx, height, 6, (i) => accent(i + spikeIndex))).join(''),
      },
      stage,
    );
  },
};

const EXOTIC_SPARKLES =
  '<g fill="#fff6c8"><path d="M56 -22 l1 2.6 l2.6 1 l-2.6 1 l-1 2.6 l-1 -2.6 l-2.6 -1 l2.6 -1z"/><path d="M23 -14 l.7 1.8 l1.8 .7 l-1.8 .7 l-.7 1.8 l-.7 -1.8 l-1.8 -.7 l1.8 -.7z"/><circle cx="54" cy="0" r=".9"/><circle cx="26" cy="-2" r=".7"/></g>';

/** The plant's markup (no bed) for an SVG whose gradient ids start with idPrefix. */
export function renderPlant(stage: string | null | undefined, look: PlantLook | null | undefined, idPrefix: string): string {
  const plantLook = look ?? {};
  const rosterPlant = plantLook.kind === undefined ? undefined : rosterPlants[plantLook.kind];
  const species = plantLook.kind !== undefined && plantLook.kind in SPECIES_DRAWINGS ? plantLook.kind : rosterPlant?.svg !== undefined && rosterPlant.svg in SPECIES_DRAWINGS ? rosterPlant.svg : 'daisy';
  const rarity = plantLook.rarity !== undefined && RARITY_ACCENT[plantLook.rarity] ? plantLook.rarity : 'common';
  const mutated = !!plantLook.mutated;
  const accentGradient = rarity === 'common' ? SPECIES_ACCENT[species] : RARITY_ACCENT[rarity];
  const mutantGradient = mutated ? 'pmu' : null;
  const accent: Accent = (i) => `url(#${idPrefix}${mutantGradient && i % 2 ? mutantGradient : String(accentGradient)})`;
  const leaf = `url(#${idPrefix}l1)`;
  const leafAlt = `url(#${idPrefix}${mutated ? 'pmu' : 'l2'})`;
  const sparkles = rarity === 'exotic' ? EXOTIC_SPARKLES : '';
  const art = (artStage: string): string => (SPECIES_DRAWINGS[species]?.(artStage, accent, leaf, leafAlt) || '').replace(/url\(#P-/g, `url(#${idPrefix}`);
  if (stage === 'seed' || !stage) {
    const seedColour = mutated ? '#2f8f86' : rarity === 'exotic' ? '#6b48b0' : rarity === 'rare' ? '#9a4a32' : '#5e3d28';
    return `<ellipse cx="40" cy="28" rx="8" ry="3.8" fill="#3a2416"/><ellipse cx="40" cy="27" rx="7" ry="3" fill="${seedColour}"/><ellipse cx="40" cy="25.5" rx="2.8" ry="2.1" fill="${species === 'mushroom' ? '#d9cfc0' : '#e8cb96'}"/><ellipse cx="39.1" cy="24.8" rx="1" ry=".7" fill="#fff8e6"/>${rarity === 'rare' ? '<path d="M38.4 24.4 v2.4 M40 24 v3 M41.6 24.4 v2.4" stroke="#9a4a32" stroke-width=".55"/>' : ''}${rarity === 'exotic' ? '<circle cx="42.6" cy="23.6" r=".8" fill="#fff6c8"/>' : ''}`;
  }
  if (stage === 'wilt' || stage === 'dead') {
    const base = plantLook.base !== undefined && PLANT_STAGES.includes(plantLook.base) && plantLook.base !== 'seed' ? plantLook.base : 'leafy';
    const dead = stage === 'dead';
    return `<g filter="url(#${idPrefix}${dead ? 'fdead' : 'fdry'})" transform="translate(40 28) rotate(${dead ? 16 : 9}) scale(${dead ? '1 .78' : '1 .92'}) translate(-40 -28)"${dead ? ' opacity=".85"' : ''}>${art(base)}</g>`;
  }
  return art(stage) + (stage === 'bloom' ? sparkles : '');
}

/** A plant in its raised bed as a standalone SVG, `width` px wide. */
export function specimen(stage: string, look: PlantLook, width = 72, label = ''): string {
  const idPrefix = nextSvgIdPrefix('gp');
  return `<svg class="gplot" viewBox="0 -26 80 92" width="${width}" height="${Math.round((width * 92) / 80)}" role="img" aria-label="${escapeHtml(label || lookLabel(stage) + ' plant')}">${DEFS(idPrefix)}${BED(idPrefix)}<g class="gpl">${renderPlant(stage, look, idPrefix)}</g><path d="M40 7 L3 26 L40 45 L77 26z" fill="url(#${idPrefix}gl)" opacity=".5"/></svg>`;
}
