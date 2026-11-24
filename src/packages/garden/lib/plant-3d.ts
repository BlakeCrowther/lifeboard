/* 3D plants for roster kind 'plant' (models/plant/CONTRACT.md). A roster plant is a canvas over an empty SVG bed: one
   shared offscreen WebGL renderer draws each canvas (stage_<n> visible, sway_<n> loop, tend once when the tile was just
   logged) and copies the frame in. Thirsty and withered plants are the model at their last stage, dried by CSS.
   A canvas carries a key (`data-k`); a re-render that rebuilds the markup picks the same plant back up (pose, loop time)
   and draws it before the next paint, so logging a session never flashes an empty bed.
   Same viewBox scale as the SVG plants: soil point at (40, 28), the bloom ~46 units tall. ~20 fps, paused off-screen.
   three.js loads lazily through the page's import map. */
import type * as Three from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PLANT_STAGES, escapeHtml, lookLabel, plotLook, speciesNames, type GardenPlot } from './labels.ts';
import { emptyBed, specimen, type PlantLook } from './plant-svg.ts';
import { rosterPlants } from './roster.ts';

declare global {
  interface Window {
    /** plant id -> base64 glb, set by the models/assets/*-glb.js scripts (the model pipeline's seam) */
    LB_PLANTS?: Record<string, string>;
  }
}

interface ThreeKit {
  THREE: typeof Three;
  GLTFLoader: typeof GLTFLoader;
  cloneSkinned: typeof cloneSkinned;
  renderer: Three.WebGLRenderer;
  scene: Three.Scene;
  camera: Three.OrthographicCamera;
}

interface PlantInstance {
  root: Three.Object3D;
  mixer: Three.AnimationMixer;
  sway: Three.AnimationAction | null;
  tend: Three.AnimationAction | null;
  height: number;
}

let kit: ThreeKit | null = null;
let kitLoad: Promise<void> | null = null;
const loadedPlants: Record<string, GLTF> = {};
const plantLoads: Record<string, Promise<void>> = {};
/** canvas key -> its plant, kept while any canvas with that key is on the page */
const instances = new Map<string, PlantInstance>();
/** canvases drawn at least once; a canvas not in here is new markup and draws on the next frame, throttle or not */
const drawnCanvases = new WeakSet<HTMLCanvasElement>();
let frameRequest = 0;
let lastFrame = 0;
const prefersReducedMotion = (): boolean => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false);

const loadScript = (src: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });

function loadThree(): Promise<void> {
  kitLoad ??= Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]).then(([THREE, gltf, skeletonUtils]) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(3, 5, 2);
    scene.add(new THREE.HemisphereLight(0xf4fbff, 0x5a3a22, 1.5), sun);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    camera.position.set(0.92, 0.36, 0.42).multiplyScalar(20);
    camera.lookAt(0, 0, 0);
    kit = { THREE, GLTFLoader: gltf.GLTFLoader, cloneSkinned: skeletonUtils.clone, renderer, scene, camera };
  });
  return kitLoad;
}

function loadPlant(id: string): Promise<void> {
  plantLoads[id] ??= (async () => {
    await loadThree();
    const entry = rosterPlants[id];
    if (!window.LB_PLANTS?.[id]) {
      if (!entry?.js) throw new Error('no model script');
      await loadScript('models/' + entry.js);
    }
    const base64 = window.LB_PLANTS?.[id];
    if (!base64 || !kit) throw new Error('model script set no plant');
    const binary = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
    loadedPlants[id] = await new kit.GLTFLoader().parseAsync(binary, '');
    startAnimating();
  })().catch((error: unknown) => {
    console.warn('[garden] plant', id, error);
  });
  return plantLoads[id];
}

function instanceFor(canvas: HTMLCanvasElement, threeKit: ThreeKit): PlantInstance | null {
  const key = canvas.dataset.k ?? '';
  const existing = instances.get(key);
  if (existing) return existing;
  const id = canvas.dataset.p3 ?? '';
  const gltf = loadedPlants[id];
  if (!gltf) {
    void loadPlant(id);
    return null;
  }
  const { THREE } = threeKit;
  const root = threeKit.cloneSkinned(gltf.scene);
  const stageIndex = Number(canvas.dataset.st);
  root.traverse((node) => {
    const stageMatch = /^stage_(\d)/.exec(node.name);
    if (stageMatch) node.visible = Number(stageMatch[1]) === stageIndex;
    if ('isMesh' in node && node.isMesh) node.frustumCulled = false;
  });
  const box = new THREE.Box3().setFromObject(root);
  const mixer = new THREE.AnimationMixer(root);
  const clipNamed = (name: string) => gltf.animations.find((clip) => clip.name === name);
  const swayClip = clipNamed('sway_' + String(stageIndex));
  const tendClip = clipNamed('tend');
  const sway = swayClip ? mixer.clipAction(swayClip) : null;
  const tend = tendClip ? mixer.clipAction(tendClip) : null;
  if (tend) {
    tend.setLoop(THREE.LoopOnce, 1);
    /* tend ends on rest, which is sway frame 0 */
    mixer.addEventListener('finished', () => {
      tend.stop();
      if (sway) sway.reset().play();
    });
  }
  if (sway) {
    sway.play();
    sway.time = Math.random() * sway.getClip().duration;
  }
  const instance: PlantInstance = { root, mixer, sway, tend, height: Math.max(1e-3, box.max.y - box.min.y) };
  instances.set(key, instance);
  return instance;
}

/** New markup for a tile that was just logged: play tend once from rest. */
function tendIfLogged(canvas: HTMLCanvasElement, instance: PlantInstance): void {
  if (!instance.tend || !canvas.closest('.add') || canvas.dataset.still) return;
  instance.sway?.stop();
  instance.tend.reset().play();
}

function drawPlant(canvas: HTMLCanvasElement, instance: PlantInstance, threeKit: ThreeKit, deltaSeconds: number): void {
  const { renderer, scene, camera } = threeKit;
  const width = canvas.width;
  const height = canvas.height;
  const unitsPerViewBox = instance.height / 46;
  if (renderer.domElement.width !== width || renderer.domElement.height !== height) renderer.setSize(width, height, false);
  instance.mixer.update(deltaSeconds);
  Object.assign(camera, { left: -40 * unitsPerViewBox, right: 40 * unitsPerViewBox, top: 54 * unitsPerViewBox, bottom: -38 * unitsPerViewBox });
  camera.updateProjectionMatrix();
  scene.add(instance.root);
  renderer.render(scene, camera);
  scene.remove(instance.root);
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, width, height);
    context.drawImage(renderer.domElement, 0, 0);
  }
}

function startAnimating(): void {
  if (!frameRequest && typeof requestAnimationFrame !== 'undefined') frameRequest = requestAnimationFrame(animationFrame);
}

function animationFrame(time: number): void {
  frameRequest = 0;
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('canvas.gp3')];
  if (!canvases.length) {
    lastFrame = 0;
    return;
  }
  if (!kit) {
    loadThree().then(startAnimating, (error: unknown) => {
      console.warn('[garden] three', error);
    });
    return;
  }
  const hasNew = canvases.some((canvas) => !drawnCanvases.has(canvas));
  if (!hasNew && lastFrame && time - lastFrame < 45) {
    frameRequest = requestAnimationFrame(animationFrame);
    return;
  }
  const deltaSeconds = lastFrame ? Math.min(0.1, (time - lastFrame) / 1000) : 0;
  lastFrame = time;
  const reducedMotion = prefersReducedMotion();
  const onPage = new Set(canvases.map((canvas) => canvas.dataset.k ?? ''));
  for (const key of instances.keys()) if (!onPage.has(key)) instances.delete(key);
  let pending = false;
  for (const canvas of canvases) {
    const instance = instanceFor(canvas, kit);
    if (!instance) {
      pending = true;
      continue;
    }
    const fresh = !drawnCanvases.has(canvas);
    if (fresh) tendIfLogged(canvas, instance);
    else {
      if (reducedMotion || canvas.dataset.still) continue;
      const box = canvas.getBoundingClientRect();
      if (box.bottom < 0 || box.top > window.innerHeight) continue;
    }
    drawPlant(canvas, instance, kit, reducedMotion || canvas.dataset.still ? 0 : deltaSeconds);
    drawnCanvases.add(canvas);
  }
  if (!reducedMotion || pending) frameRequest = requestAnimationFrame(animationFrame);
}

interface PlantArt {
  /** stable across re-renders of the same plant (a plot key, a keepsake id) */
  key: string;
  /** plotLook: a stage name, 'wilt' or 'dead' */
  look: string;
  plant: PlantLook;
  size: number;
  label: string;
}

/** A plant in its raised bed, `size` px wide: a roster plant's 3D model, else its SVG species (plots with no model yet). */
export function plantArt({ key, look, plant, size, label }: PlantArt): string {
  if (plant.kind === undefined || !rosterPlants[plant.kind]) return specimen(look, plant, size, label);
  const dried = look === 'wilt' || look === 'dead';
  const stageIndex = Math.max(0, PLANT_STAGES.indexOf(dried ? (plant.base ?? 'leafy') : look));
  const height = Math.round((size * 92) / 80);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  startAnimating();
  return `<span class="gp3w" style="width:${String(size)}px;height:${String(height)}px">${emptyBed(size, label)}<canvas class="gp3${dried ? ' ' + look : ''}" aria-hidden="true" data-k="${escapeHtml(`${key}|${plant.kind}|${String(stageIndex)}|${String(size)}`)}" data-p3="${escapeHtml(plant.kind)}" data-st="${String(stageIndex)}"${look === 'dead' ? ' data-still="1"' : ''} width="${String(Math.round(size * pixelRatio))}" height="${String(Math.round(height * pixelRatio))}"></canvas></span>`;
}

/** A plot's bed and plant, `size` px wide. */
export function plotSVG(plot: GardenPlot, size: number): string {
  const look = plotLook(plot);
  return plantArt({ key: plot.key, look, plant: { ...plot.seed, kind: plot.species, base: plot.stageName }, size, label: `${plot.name}: ${lookLabel(look).toLowerCase()} ${(speciesNames[plot.species] || 'plant').toLowerCase()}` });
}
