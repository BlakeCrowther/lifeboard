/* The lazily loaded three.js kit. Every module stays external (the page's import map resolves it); only types are imported here. */
import type * as Three from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import type * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export type { Three };

export interface ThreeKit {
  THREE: typeof Three;
  EffectComposer: typeof EffectComposer;
  RenderPass: typeof RenderPass;
  UnrealBloomPass: typeof UnrealBloomPass;
  OutputPass: typeof OutputPass;
  ShaderPass: typeof ShaderPass;
  GLTFLoader: typeof GLTFLoader;
  geometryUtils: typeof BufferGeometryUtils;
  skeletonUtils: typeof SkeletonUtils;
}

export async function loadThreeKit(): Promise<ThreeKit> {
  const [THREE, composer, renderPass, bloomPass, outputPass, shaderPass, gltf, geometryUtils, skeletonUtils] = await Promise.all([
    import('three'),
    import('three/addons/postprocessing/EffectComposer.js'),
    import('three/addons/postprocessing/RenderPass.js'),
    import('three/addons/postprocessing/UnrealBloomPass.js'),
    import('three/addons/postprocessing/OutputPass.js'),
    import('three/addons/postprocessing/ShaderPass.js'),
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/utils/BufferGeometryUtils.js'),
    import('three/addons/utils/SkeletonUtils.js'),
  ]);
  return {
    THREE,
    EffectComposer: composer.EffectComposer,
    RenderPass: renderPass.RenderPass,
    UnrealBloomPass: bloomPass.UnrealBloomPass,
    OutputPass: outputPass.OutputPass,
    ShaderPass: shaderPass.ShaderPass,
    GLTFLoader: gltf.GLTFLoader,
    geometryUtils,
    skeletonUtils,
  };
}

export const isMesh = (object: Three.Object3D): object is Three.Mesh => (object as Partial<Three.Mesh>).isMesh === true;
export const isSkinnedMesh = (object: Three.Object3D): boolean => (object as Partial<Three.SkinnedMesh>).isSkinnedMesh === true;
export const isInstancedMesh = (object: Three.Object3D): object is Three.InstancedMesh => (object as Partial<Three.InstancedMesh>).isInstancedMesh === true;

/** A glTF node extra (models/shared/blender/lib.py writes them into userData). */
export function nodeExtra(object: Three.Object3D, key: string): unknown {
  const extras: Record<string, unknown> = object.userData;
  return extras[key];
}

/** The one material of a mesh (the first, for multi-material meshes). */
export function firstMaterial(mesh: Three.Mesh): Three.Material {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!material) throw new Error('[ecosystem] mesh without a material');
  return material;
}

/** Scene-side facts about a piece, kept beside the object instead of in its untyped userData. */
export interface PieceInfo {
  kind?: string;
  name?: string;
  /** growth phase, 0 = phase 1 */
  phase?: number;
  /** share of the biome's progress (0..1) at which it appears */
  unlockAt?: number;
  /** full-grown scale */
  base?: Three.Vector3;
  /** performance.now() when its grow-in started; 0 = not growing */
  growStart: number;
  landmark: boolean;
  /** biome scenery (a roster prop) */
  prop: boolean;
  /** ambient animation, given the clock in seconds */
  tick?: (seconds: number) => void;
  /** light shaft tilt */
  slant?: number;
}

const pieces = new WeakMap<object, PieceInfo>();
export function piece(object: object): PieceInfo {
  let info = pieces.get(object);
  if (!info) {
    info = { growStart: 0, landmark: false, prop: false };
    pieces.set(object, info);
  }
  return info;
}

/** A geometry's position attribute; every geometry the scene builds or loads has one. */
export function positionsOf(geometry: Three.BufferGeometry): Three.BufferAttribute | Three.InterleavedBufferAttribute {
  const position = geometry.attributes['position'];
  if (!position) throw new Error('[ecosystem] geometry without positions');
  return position;
}
