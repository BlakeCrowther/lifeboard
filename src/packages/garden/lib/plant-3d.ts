/* 3D plots for roster kind 'plant' (models/plant/CONTRACT.md). A plot whose species is a roster plant gets a canvas over
   its SVG bed: one shared offscreen WebGL renderer draws each plot (stage_<n> visible, sway_<n> loop, tend once when the
   tile was just logged) and copies the frame in; the SVG plant (roster `svg` shape) shows until then.
   Same viewBox scale as the SVG plants: soil point at (40, 28), the bloom ~46 units tall. ~20 fps, paused off-screen.
   three.js loads lazily through the page's import map. */
import type * as Three from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PLANT_STAGES, escapeHtml, lookLabel, plotLook, speciesNames, type GardenPlot } from './labels.ts';
import { specimen } from './plant-svg.ts';
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
  height: number;
  drawn: boolean;
}

let kit: ThreeKit | null = null;
let kitLoad: Promise<void> | null = null;
const loadedPlants: Record<string, GLTF> = {};
const plantLoads: Record<string, Promise<void>> = {};
const instances = new WeakMap<HTMLCanvasElement, PlantInstance>();
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
  const existing = instances.get(canvas);
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
  const tend = canvas.closest('.add') && tendClip ? mixer.clipAction(tendClip) : null;
  if (tend) {
    tend.setLoop(THREE.LoopOnce, 1);
    tend.play();
    /* tend ends on rest, which is sway frame 0 */
    mixer.addEventListener('finished', () => {
      tend.stop();
      if (sway) sway.reset().play();
    });
  } else if (sway) {
    sway.play();
    sway.time = Math.random() * sway.getClip().duration;
  }
  const instance: PlantInstance = { root, mixer, height: Math.max(1e-3, box.max.y - box.min.y), drawn: false };
  instances.set(canvas, instance);
  return instance;
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
  if (!instance.drawn) {
    instance.drawn = true;
    canvas.parentElement?.classList.add('on');
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
  if (lastFrame && time - lastFrame < 45) {
    frameRequest = requestAnimationFrame(animationFrame);
    return;
  }
  const deltaSeconds = lastFrame ? Math.min(0.1, (time - lastFrame) / 1000) : 0;
  lastFrame = time;
  const reducedMotion = prefersReducedMotion();
  let pending = false;
  for (const canvas of canvases) {
    const instance = instanceFor(canvas, kit);
    if (!instance) {
      pending = true;
      continue;
    }
    if (reducedMotion && instance.drawn) continue;
    const box = canvas.getBoundingClientRect();
    if (instance.drawn && (box.bottom < 0 || box.top > window.innerHeight)) continue;
    drawPlant(canvas, instance, kit, reducedMotion ? 0 : deltaSeconds);
  }
  if (!reducedMotion || pending) frameRequest = requestAnimationFrame(animationFrame);
}

/** A plot's bed and plant, `size` px wide; roster plants also get a 3D canvas over the SVG. */
export function plotSVG(plot: GardenPlot, size: number): string {
  const look = plotLook(plot);
  const svg = specimen(look, { ...plot.seed, kind: plot.species, base: plot.stageName }, size, `${plot.name}: ${lookLabel(look).toLowerCase()} ${(speciesNames[plot.species] || 'plant').toLowerCase()}`);
  /* thirsty and withered keep the SVG shape */
  if (!rosterPlants[plot.species] || !PLANT_STAGES.includes(look)) return svg;
  const height = Math.round((size * 92) / 80);
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  setTimeout(startAnimating);
  return `<span class="gp3w" style="width:${String(size)}px;height:${String(height)}px">${svg}<canvas class="gp3" aria-hidden="true" data-p3="${escapeHtml(plot.species)}" data-st="${String(PLANT_STAGES.indexOf(look))}" width="${String(Math.round(size * pixelRatio))}" height="${String(Math.round(height * pixelRatio))}"></canvas></span>`;
}
