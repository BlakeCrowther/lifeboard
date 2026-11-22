/* Per-scene frames and looks. Distinct per biome on purpose: identity comes from shape language and hue family
   (biomes.json identity_rules), not from tinting one set. */
import type { Frame } from './context.ts';

const FIVE_ROCKS: Frame['rocks'] = [[1.9, -1.4, 1.3, 0.7], [-2.9, -2.6, 1.7, 0.75], [3.9, 0.5, 0.85, 0.6], [-0.4, -4.4, 2.3, 0.85], [-4.6, 0.6, 0.8, 0.55]];

export const FRAMES: Record<string, Frame> = {
  reef: { ground: '#d8c290', speck: [220, 198, 150, 0.6], rock: [0x7a7166, 0x4c463f, 0xc77a95, 0x6f8a45, 0.25], rocks: FIVE_ROCKS, cover: { hue: [0.18, 0.26], count: 220, width: 0.045, height: 0.55, sway: 0.28 }, mote: 0xe8fbff },
  kelp: { ground: '#4a4440', speck: [120, 108, 96, 0.7], rock: [0x6a6560, 0x3a3632, 0x8a4a5a, 0x5a6a3a, 0.12], rocks: [...FIVE_ROCKS, [4.6, -3.8, 1.5, 0.8], [-5.6, -4.2, 1.9, 0.7], [1.0, 2.6, 0.6, 0.6]], cover: { hue: [0.0, 0.04], count: 90, width: 0.06, height: 0.3, sway: 0.3 }, mote: 0xd8f0e0 },
  tidepool: { ground: '#5a544c', speck: [150, 140, 128, 0.7], rock: [0x5f5a55, 0x34302c, 0xe07aa0, 0x4a8a4a, 0.3], rocks: [[1.9, -1.4, 1.0, 0.5], [-2.9, -2.6, 1.4, 0.55], [3.9, 0.5, 0.85, 0.5], [-0.4, -4.4, 1.8, 0.6], [-4.6, 0.6, 0.8, 0.5], [4.4, -3.2, 1.1, 0.5], [-5.4, -3.6, 1.2, 0.5]], cover: { hue: [0.28, 0.33], count: 140, width: 0.03, height: 0.45, sway: 0.35 }, mote: 0xffffff },
  mangrove: { ground: '#5a4632', speck: [96, 74, 52, 0.7], rock: [0x5a4a3a, 0x3a2e22, 0x6a5a3a, 0x5a6a3a, 0.4], rocks: [[3.9, 0.5, 0.7, 0.5], [-4.6, 0.6, 0.6, 0.45]], cover: null, mote: 0xd8d0a0 },
  deep: { ground: '#14161c', speck: [44, 48, 64, 0.8], rock: [0x2a2c33, 0x15161a, 0x3a2a4a, 0x20302a, 0.1], rocks: [[-2.9, -2.6, 1.7, 0.6], [-0.4, -4.4, 2.3, 0.7], [3.9, 0.5, 0.7, 0.5]], cover: null, mote: 0x7af0ff },
  meadow: { ground: '#6f9a48', speck: [90, 140, 60, 0.7], rock: [0x7a7166, 0x4c463f, 0x8a8a70, 0x6f8a45, 0.5], rocks: FIVE_ROCKS, cover: { hue: [0.18, 0.26], count: 400, width: 0.045, height: 0.55, sway: 0.12 }, mote: 0xfff2b0 },
  canopy: { ground: '#4f6a3a', speck: [70, 100, 55, 0.7], rock: [0x5a5040, 0x3a3428, 0x6a8a4a, 0x5f8a3f, 0.8], rocks: [], cover: { hue: [0.22, 0.3], count: 320, width: 0.05, height: 0.18, sway: 0.05 }, mote: 0xffffff },
  jungle: { ground: '#3a2a1a', speck: [120, 72, 34, 0.75], rock: [0x5a5448, 0x2e2a24, 0x4a6a2a, 0x3f7a2f, 0.75], rocks: [[3.9, 0.5, 0.9, 0.6], [-4.6, 0.6, 0.8, 0.55]], cover: { hue: [0.27, 0.36], count: 260, width: 0.13, height: 0.7, sway: 0.08, lightness: [0.18, 0.3] }, rays: 0xd8ffb0, mote: 0xfff4a0 },
};

/** Per-scene colours: shallow = shallow water / sky, deep = deep water / horizon; density = fog, light = sun and caustics,
    glow = constant bioluminescence. */
export interface Look {
  shallow: number | string;
  deep: number | string;
  density?: number;
  light?: number;
  glow?: number;
}

export const LOOKS: Record<string, Look> = {
  reef: { shallow: 0x3fd0e4, deep: 0x0a5a86 },
  kelp: { shallow: 0x5fb89a, deep: 0x0d4a3a, density: 1.15 },
  tidepool: { shallow: 0x8ff0f5, deep: 0x3a9fc0, density: 0.55, light: 1.15 },
  mangrove: { shallow: 0x9ab87a, deep: 0x2c4a30, density: 1.5, light: 0.8 },
  deep: { shallow: 0x1a3f6a, deep: 0x020a1a, density: 1.25, light: 0.3, glow: 0.85 },
  meadow: { shallow: 0x9fd4f2, deep: 0xf2e2bc },
  canopy: { shallow: 0xbfe2f7, deep: 0xeef3f6, density: 0.6 },
  jungle: { shallow: 0x8fc07a, deep: 0x163a20, density: 1.8, light: 0.85 },
};

export const PIECE_NAMES: Record<string, string> = {
  tree: 'buttress tree', leaf: 'giant leaves', vine: 'vines', limb: 'mossy branch', coral: 'coral', shrub: 'flowering bush', anemone: 'anemone',
  kelp: 'kelp', root: 'mangrove tree', cloud: 'cloud', sponge: 'tube sponges', rock: 'rock',
};
