/* What the engine's parts share: the kit, the scene, the seeded random, the shading, and the world built for the current biome. */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Three, ThreeKit } from './kit.ts';
import type { FrameOverride, RosterEntry } from './manifests.ts';
import type { SeededRandom } from './rules.ts';
import type { Shading } from './shading.ts';
import type { SceneHooks } from './url-hooks.ts';

/** Solid scenery as an ellipsoid; creatures stay outside it. */
export interface Collider {
  kind: string;
  center: Three.Vector3;
  radii: Three.Vector3;
  object: Three.Object3D;
}

/** An overhead point a creature can hang or cling from: a point in the object's own space (growth rescales it after placing),
    or a scenery `perch*` node. */
export interface Grip {
  object: Three.Object3D;
  local?: Three.Vector3;
  node?: Three.Object3D;
}

export interface InspectPose {
  yaw: number;
  frac: number;
  pitch: number | undefined;
}

/** The ?inspect= QA copy of one prop. */
export interface InspectedProp {
  holder: Three.Group;
  mixer: Three.AnimationMixer | null;
  timeUniform: { value: number };
  duration: number;
  radius: number;
  pose: InspectPose | null;
}

export interface GroundCover {
  /** hue range */
  hue: [number, number];
  count: number;
  width: number;
  height: number;
  sway: number;
  /** lightness range */
  lightness?: [number, number];
}

/** A scene's base layer: ground, rocks, ground cover, light shafts, motes. */
export interface Frame {
  ground: string;
  /** speck rgb + alpha */
  speck: [number, number, number, number];
  /** rock colours: base, dark, pink, moss, moss amount */
  rock: [number, number, number, number, number];
  /** x, z, size, height ratio */
  rocks: [number, number, number, number][];
  cover: GroundCover | null;
  rays?: number;
  mote: number;
}

export interface NeglectColors {
  shallow: Three.Color;
  deep: Three.Color;
  tint: Three.Color;
}

export interface SnowUniforms {
  uTime: { value: number };
  uPx: { value: number };
  uOp: { value: number };
  uCol: { value: Three.Color };
}

export interface RayUniforms {
  uRay: { value: number };
  uRayCol: { value: Three.Color };
}

export interface LoadedProp {
  entry: RosterEntry;
  gltf: GLTF;
}
export type LoadedProps = Record<string, LoadedProp>;

/** Everything rebuilt when the biome's scene changes. */
export interface WorldState {
  group: Three.Group | null;
  medium: string | null;
  sceneKey: string | null;
  /** scene key plus biome id when scenery is in: rebuild when it changes */
  key: string | null;
  frame: Frame;
  frameOverride: FrameOverride;
  growth: Three.Object3D[];
  ambient: Three.Object3D[];
  coralMaterials: Three.MeshStandardMaterial[];
  blightInstances: Three.InstancedMesh | null;
  blightCopies: Three.Group[];
  neglectColors: NeglectColors | null;
  inspected: InspectedProp | null;
  rays: Three.Mesh[];
  rockMaterial: Three.MeshStandardMaterial | null;
  snowUniforms: SnowUniforms | null;
  colliders: Collider[];
  rocks: Three.Mesh[];
  grips: Grip[];
  propMixers: Three.AnimationMixer[];
  /** scenery ids creatures swim through */
  passKinds: string[];
  envDirty: boolean;
}

export interface EngineContext {
  kit: ThreeKit;
  scene: Three.Scene;
  camera: Three.PerspectiveCamera;
  random: SeededRandom;
  shading: Shading;
  rayUniforms: RayUniforms;
  world: WorldState;
  hooks: SceneHooks;
  groundNormal: (x: number, z: number) => Three.Vector3;
}

/** scene units per meter: a 0.22 m clownfish is ~1.1 units in a ~14-unit reef */
export const DISPLAY_SCALE = 5;
