/* The engine: renderer, sky dome, lights, post (MSAA HDR -> bloom -> OutputPass -> grade), the world and creatures,
   game state -> look, and the render loop (runs only while visible; reduced motion renders single frames). */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { EngineContext, LoadedProps, WorldState } from './context.ts';
import { createCreatureSim, type CreatureDebug } from './creatures.ts';
import { FRAMES, LOOKS, PIECE_NAMES } from './frames.ts';
import { piece, type Three, type ThreeKit } from './kit.ts';
import { sceneKeyOf, type Biome, type Roster, type RosterEntry } from './manifests.ts';
import { readSpec } from './manifests.ts';
import { createSeededRandom, fieldOfView, groundHeight, nextDayRecord, progressOf, readDayRecord, smoothstep, type SceneView, type VisitorInfo } from './rules.ts';
import { createShading, FUNCS } from './shading.ts';
import type { SceneHooks } from './url-hooks.ts';
import { seasonValue, weatherAmounts, type WeatherReading } from './weather.ts';
import { buildWorld } from './world.ts';

declare global {
  interface Window {
    /** creature id -> base64 glb, set by the models/assets/*-glb.js scripts (the model pipeline's seam) */
    LB_CREATURES?: Record<string, string>;
    /** scenery id -> base64 glb, likewise */
    LB_SCENERY?: Record<string, string>;
  }
}

export interface EcosystemStats {
  fps: number | null;
  bloom: boolean;
  pixelRatio: number | null;
  creatures: number;
  loadMs: number | null;
  base: string | null;
}

export interface InspectPoseInput {
  yaw?: number;
  frac?: number;
  pitch?: number;
}

/** QA capture controls (models/shared/tools/capture_habitat.mjs) */
export interface EcosystemInspect {
  readonly ready: boolean;
  readonly dur: number;
  /** orbit the camera round the inspected prop and set its sway to frac (0..1) of the loop; null releases it */
  pose(pose: InspectPoseInput | null): boolean;
}

export interface EcosystemDebug {
  food: number;
  creatures: CreatureDebug[];
}

export interface Manifests {
  roster: Roster;
  biomes: Biome[];
  biomesLoaded: boolean;
  /** the model base path the roster came from */
  base: string | null;
}

export interface LookState {
  yaw: number;
  pitch: number;
}

export interface EngineHost {
  canvas: HTMLCanvasElement;
  stats: EcosystemStats;
  hooks: SceneHooks;
  look: LookState;
  manifests: Manifests;
  isPhone: boolean;
  reducedMotion: MediaQueryList;
  isOpen(): boolean;
  inView(): boolean;
  view(): SceneView | null;
  sceneBiomeId(): number;
  biome(id: number): Biome;
  weather(): WeatherReading | null;
}

export interface Engine {
  apply(): void;
  kick(): void;
  loadCreatures(): Promise<void>;
  dropFood(count: number): void;
  readonly inspect: EcosystemInspect;
  readonly visitorName: string | null;
  readonly visitorInfo: VisitorInfo;
  readonly newToday: string[];
  readonly nextUp: string | null;
  debug(): EcosystemDebug;
}

const SEEN_KEY = 'lb-hab-seen';
const DAY_KEY = 'lb-hab-day';

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      reject(new Error('load ' + src));
    };
    document.head.appendChild(script);
  });
}

const base64Buffer = (base64: string): ArrayBuffer => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;

function readJsonStore(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
  } catch {
    return null;
  }
}
function writeJsonStore(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the scene works without it */
  }
}

export function buildEngine(kit: ThreeKit, host: EngineHost): Engine {
  const { THREE } = kit;
  const { Vector3 } = THREE;
  const { canvas, stats, hooks, look, manifests } = host;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(devicePixelRatio || 1, host.isPhone ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  stats.pixelRatio = pixelRatio;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
  const random = createSeededRandom(7);
  const shading = createShading(kit);
  const shared = shading.uniforms;
  const world: WorldState = {
    group: null, medium: null, sceneKey: null, key: null, frame: FRAMES['reef'] ?? { ground: '#d8c290', speck: [220, 198, 150, 0.6], rock: [0, 0, 0, 0, 0], rocks: [], cover: null, mote: 0xe8fbff },
    frameOverride: {}, growth: [], ambient: [], coralMaterials: [], blightInstances: null, blightCopies: [], neglectColors: null, inspected: null, rays: [],
    rockMaterial: null, snowUniforms: null, colliders: [], rocks: [], grips: [], propMixers: [], passKinds: [], envDirty: true,
  };
  const rayUniforms = { uRay: { value: 0.1 }, uRayCol: { value: new THREE.Color(0xdffbff) } };
  const ctx: EngineContext = {
    kit, scene, camera, random, shading, rayUniforms, world, hooks,
    groundNormal: (x, z) => {
      const step = 0.05;
      return new Vector3(groundHeight(x - step, z) - groundHeight(x + step, z), 2 * step, groundHeight(x, z - step) - groundHeight(x, z + step)).normalize();
    },
  };

  /* dome: water gradient and Snell's window (water) or a plain sky gradient (land, air) */
  const domeUniforms = { uSunDir: { value: new Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSurfCol: { value: new THREE.Color() } };
  const domeMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: { ...shared, ...domeUniforms },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: FUNCS + `uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSurfCol; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec3 col = uwWater(d); float win = smoothstep(.5, .92, d.y); vec2 sp = d.xz / max(d.y, .08) * 1.6;
          col += uSurfCol * win * (.25 + uwCaus(sp, uTime * .5) * .55); float s = max(dot(d, uSunDir), 0.); col += uSunCol * (pow(s, 40.) * 2.5 + pow(s, 6.) * .25);
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), domeMaterial);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  environmentScene.add(new THREE.Mesh(dome.geometry, domeMaterial));
  let environmentTarget: Three.WebGLRenderTarget | null = null;
  const bakeEnvironment = (): void => {
    const old = environmentTarget;
    environmentTarget = pmrem.fromScene(environmentScene, 0, 0.1, 100);
    scene.environment = environmentTarget.texture;
    if (old) old.dispose();
  };
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const hemisphere = new THREE.HemisphereLight(0xfff8f0, 0xcaa77a, 0.6);
  scene.add(hemisphere);

  /* post: MSAA HDR -> bloom -> OutputPass -> grade (saturation drives "bleached") */
  const composer = new kit.EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: host.isPhone ? 2 : 4 }));
  composer.addPass(new kit.RenderPass(scene, camera));
  const bloom = new kit.UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new kit.OutputPass());
  const gradeUniforms = { tDiffuse: { value: null }, sat: { value: 1.15 }, contrast: { value: 1.08 }, vig: { value: 0.3 }, tint: { value: new THREE.Color(1, 1, 1) } };
  const grade = new kit.ShaderPass({
    uniforms: gradeUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vig; uniform vec3 tint; varying vec2 vUv;
        void main(){ vec2 d = vUv - .5; vec3 c = texture2D(tDiffuse, vUv).rgb * tint; float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, sat); c = (c - .5) * contrast + .5; c *= 1. - vig * dot(d, d) * 1.6; gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }`,
  });
  /* ShaderPass clones the uniforms; put the typed ones back so the look writes reach the material */
  Object.assign(grade.uniforms, gradeUniforms);
  composer.addPass(grade);

  /* ===== creatures ===== */
  const creatures = createCreatureSim(ctx, {
    passThrough: () => host.biome(host.sceneBiomeId()).pass_through ?? [],
    view: () => host.view(),
    kick: () => {
      kick();
    },
  });
  async function decode(entry: RosterEntry): Promise<GLTF> {
    if (!window.LB_CREATURES?.[entry.id]) await loadScript((manifests.base ?? '') + entry.js);
    const base64 = window.LB_CREATURES?.[entry.id];
    if (!base64) throw new Error('no glb for ' + entry.id);
    return new kit.GLTFLoader().parseAsync(base64Buffer(base64), '');
  }
  async function specOf(entry: RosterEntry): Promise<ReturnType<typeof readSpec>> {
    if (!entry.spec) return {};
    try {
      const response = await fetch((manifests.base ?? '') + entry.spec);
      return response.ok ? readSpec(await response.json()) : {};
    } catch {
      return {};
    }
  }
  /* biome scenery (biomes.json `scenery`): roster glbs of kind scenery, decoded before the world is built */
  const useProps = (biome: Biome): boolean => !hooks.forcedScene && Array.isArray(biome.scenery) && biome.scenery.length > 0;
  async function loadProps(biome: Biome): Promise<LoadedProps> {
    const out: LoadedProps = {};
    const ids = [...(biome.scenery ?? []).map((item) => item.id), ...(biome.neglect?.blight ? [biome.neglect.blight] : []), ...(hooks.inspectId ? [hooks.inspectId] : [])];
    for (const id of [...new Set(ids)]) {
      const fromInspect = id === hooks.inspectId && hooks.inspectSrc;
      const entry: RosterEntry | undefined = fromInspect && hooks.inspectSrc ? { id, js: hooks.inspectSrc, name: id.replace(/_/g, ' ') } : manifests.roster.scenery.find((model) => model.id === id);
      if (!entry) {
        console.warn('[ecosystem] scenery not in roster:', id);
        continue;
      }
      try {
        if (!window.LB_SCENERY?.[id]) await loadScript(fromInspect ? entry.js : (manifests.base ?? '') + entry.js);
        const base64 = window.LB_SCENERY?.[id];
        if (!base64) throw new Error('no glb for ' + id);
        out[id] = { entry, gltf: await new kit.GLTFLoader().parseAsync(base64Buffer(base64), '') };
      } catch (error) {
        console.warn('[ecosystem] scenery failed', id, error);
      }
    }
    return out;
  }
  let visitorName: string | null = null;
  let visitorInfo: VisitorInfo = { count: 0, rarity: null };
  async function loadCreatures(): Promise<void> {
    creatures.clear();
    visitorName = null;
    const biomeId = host.sceneBiomeId();
    const biome = host.biome(biomeId);
    const medium = biome.medium || 'water';
    const props = useProps(biome) ? await loadProps(biome) : null;
    const sceneKey = sceneKeyOf(biome, hooks.forcedScene);
    const worldKey = sceneKey + (props ? '#' + String(biomeId) : '');
    if (medium !== world.medium || worldKey !== world.key) {
      buildWorld(ctx, medium, sceneKey, biome, props);
      world.key = worldKey;
    }
    const forced = hooks.forcedVisitor;
    const list = manifests.roster.creatures.filter((entry) => (forced ? entry.id === forced : entry.biome === biomeId || (entry.biome == null && medium === 'water')));
    if (forced && !list.length) console.warn('[ecosystem] visitor not in roster:', forced);
    const stored = readJsonStore(SEEN_KEY);
    const seen = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    visitorInfo = { count: 0, rarity: null };
    for (const entry of list.slice(-6)) {
      try {
        const [gltf, spec] = await Promise.all([decode(entry), specOf(entry)]);
        const copies = forced ? 2 : entry.rarity === 'common' ? 2 : 1;
        const isNew = !!forced || !seen.includes(entry.id);
        for (let copy = 0; copy < copies; copy++) creatures.spawn(gltf, entry, spec, copy, isNew);
        visitorName = spec.name || entry.id;
        visitorInfo = { count: visitorInfo.count + 1, rarity: entry.rarity || 'common' };
        if (!forced && isNew) {
          seen.push(entry.id);
          writeJsonStore(SEEN_KEY, seen);
        }
      } catch (error) {
        console.warn('[ecosystem] creature failed', entry.id, error);
      }
    }
    stats.creatures = creatures.count;
  }

  /* ===== state -> look ===== */
  const color = (value: Three.ColorRepresentation): Three.Color => new THREE.Color(value);
  const MURK_SHALLOW = color(0x6f8f4a);
  const MURK_DEEP = color(0x23361c);
  const NIGHT_SHALLOW = color(0x0a2a48);
  const NIGHT_DEEP = color(0x01070f);
  const DUSK = color(0xd9906a);
  const BLIGHT = color(0x8fb04a);
  let newToday: string[] = [];
  let nextUp: string | null = null;
  /* progress at the start of today, remembered per viewer, so "new today" and the grow-in survive reloads */
  function dayStart(view: SceneView, progress: number): number {
    if (view.pf != null || view.pinnedPhase) return view.pf0 ?? progress;
    const record = nextDayRecord(readDayRecord(readJsonStore(DAY_KEY)), new Date().toISOString().slice(0, 10), view.reef.biome, progress);
    writeJsonStore(DAY_KEY, record);
    return record.f;
  }
  const nameOf = (object: Three.Object3D): string => {
    const info = piece(object);
    const kindName = info.kind === 'coral' && world.medium !== 'water' ? 'bush' : info.kind ? PIECE_NAMES[info.kind] : undefined;
    return info.name || kindName || 'something new';
  };
  const DEFAULT_VIEW: SceneView = {
    reef: { biome: 0, phase: 2, phases: 5, pts: 0, next: null, prev: 0, bleached: false }, cloudiness: 0, blight: 0, todayTide: null, overdue: 0,
    breaks: { sad: false, skipsToday: 0, lost: 0 }, lessons: { hide: false, daysSince: null },
  };
  function apply(): void {
    const view = host.view() ?? DEFAULT_VIEW;
    const water = world.medium === 'water';
    const cloudiness = view.cloudiness;
    const blight = view.blight;
    const bleached = view.reef.bleached;
    const now = new Date();
    const hour = hooks.forcedHour != null ? +hooks.forcedHour : now.getHours() + now.getMinutes() / 60;
    const weather = weatherAmounts(host.weather(), hooks.forcedWeather, Date.now()); /* real weather and season: look only, no game effect */
    const season = seasonValue(hooks.forcedMonth, now);
    const dayLength = 12 + season * 1.8; /* longer summer days, shorter winter ones */
    const sunrise = 12 - dayLength / 2;
    const elevation = Math.sin(((hour - sunrise) / dayLength) * Math.PI) * (0.85 + season * 0.15);
    const day = Math.max(0, elevation);
    const night = 1 - smoothstep(-0.1, 0.25, elevation);
    const dusk = Math.max(0, 1 - Math.abs(elevation) / 0.3) * (1 - night * 0.6);
    const nightPull = water ? 0.72 : 0.6; /* how far night pulls the colours toward NIGHT_*: moonlit, still readable */
    const sceneLook = { ...(LOOKS[world.sceneKey ?? 'reef'] ?? LOOKS['reef'] ?? { shallow: 0x3fd0e4, deep: 0x0a5a86 }) }; /* biomes.json frame overrides: water [shallow, deep], dens, light */
    const override = world.frameOverride;
    if (override.water) {
      sceneLook.shallow = override.water[0];
      sceneLook.deep = override.water[1];
    }
    if (override.dens) sceneLook.density = override.dens;
    if (override.light) sceneLook.light = override.light;
    const murk = world.neglectColors;
    shared.uShallow.value.set(sceneLook.shallow);
    shared.uDeep.value.set(sceneLook.deep);
    shared.uShallow.value.lerp(color(0x56626c), weather.cloud * 0.45).lerp(color(0xc8d0d4), weather.fog * 0.5).lerp(murk ? murk.shallow : MURK_SHALLOW, cloudiness * 0.65).lerp(murk ? murk.tint : BLIGHT, blight * 0.35).lerp(DUSK, dusk * 0.3).lerp(NIGHT_SHALLOW, night * nightPull);
    shared.uDeep.value.lerp(color(0x1e252b), weather.cloud * 0.45).lerp(murk ? murk.deep : MURK_DEEP, cloudiness * 0.6).lerp(NIGHT_DEEP, night * nightPull);
    shared.uDens.value = (water ? 0.042 : world.medium === 'air' ? 0.05 : 0.018) * (sceneLook.density || 1) * (1 + cloudiness * 1.4) * (1 + night * 0.25) * (1 + weather.cloud * 0.3 + weather.fog * 2 + weather.rain * 0.4);
    if (water) shared.uAbsorb.value.set(0.035, 0.012, 0.01);
    else shared.uAbsorb.value.set(0, 0, 0);
    shared.uAbsorb.value.multiplyScalar(1 + cloudiness * 0.5);
    const lightScale = (1 - cloudiness * 0.45) * (sceneLook.light || 1) * (1 - weather.cloud * 0.35 - weather.storm * 0.15) * (1 + season * 0.06);
    shared.uCaus.value = water ? 3.2 * Math.pow(day, 0.7) * (1 - cloudiness * 0.75) * (1 - weather.cloud * 0.6) : 0;
    shared.uCausCol.value.set(dusk > 0.4 ? 0xffd6b0 : 0xf4fdff);
    shared.uGlow.value = Math.max(night * 0.9, sceneLook.glow || 0);
    const azimuth = ((hour - sunrise) / dayLength) * Math.PI;
    const sunDirection = new Vector3(Math.cos(azimuth) * 0.55, Math.max(0.35, elevation) + 0.5, -0.35).normalize();
    sun.position.copy(sunDirection).multiplyScalar(18);
    sun.target.position.set(0, 0, -1);
    sun.color.set(night > 0.5 ? 0x8fb8ff : dusk > 0.4 ? 0xffc79a : 0xfff6e8).lerp(color(season < 0 ? 0xcfe0ff : 0xffe2b0), Math.abs(season) * 0.2).lerp(color(0xd8dde2), weather.cloud * 0.5);
    sun.intensity = (night > 0.5 ? 0.75 : 0.2 + day * (water ? 3.2 : 2.6)) * lightScale;
    domeUniforms.uSunDir.value.copy(sunDirection);
    domeUniforms.uSunCol.value.set(night > 0.5 ? 0x5a7ab0 : dusk > 0.4 ? 0xffb07a : 0xfff4dc).multiplyScalar((night > 0.5 ? 0.4 : 0.4 + day) * lightScale);
    domeUniforms.uSurfCol.value.copy(shared.uShallow.value).lerp(color(0xffffff), 0.5).multiplyScalar(water ? (0.25 + day * 0.9) * lightScale : 0);
    scene.environmentIntensity = 0.4 + day * 0.2 + night * 0.15;
    hemisphere.intensity = (0.15 + day * 0.65 + night * 0.2) * lightScale;
    rayUniforms.uRay.value = (water ? 0.16 : 0.24) * day * (1 - cloudiness * 0.7) * (1 - weather.cloud * 0.7);
    const snow = world.snowUniforms;
    if (snow) {
      snow.uOp.value = water ? 0.45 + cloudiness * 0.5 + weather.rain * 0.25 : 0.25 + weather.rain * 0.35 + weather.snow * 0.6;
      snow.uCol.value.set(water && night > 0.5 ? 0x7af0ff : !water && weather.snow ? 0xffffff : world.frame.mote);
    }
    if (world.rockMaterial) world.rockMaterial.color.set(0xffffff).lerp(murk ? murk.tint : color(0x9aa060), Math.max(cloudiness, blight) * 0.6);
    if (world.blightInstances) world.blightInstances.count = Math.round(blight * 270);
    {
      const shownCopies = Math.round(blight * world.blightCopies.length);
      const grow = 0.6 + 0.4 * blight;
      world.blightCopies.forEach((copy, k) => {
        copy.visible = k < shownCopies;
        const base = piece(copy).base;
        if (base) copy.scale.copy(base).multiplyScalar(grow);
      });
    }
    /* progress -> which pieces of life are in */
    const progress = progressOf(view);
    const progressAtDayStart = dayStart(view, progress);
    const nowMs = performance.now();
    const fresh: Three.Object3D[] = [];
    world.growth.forEach((grown) => {
      const info = piece(grown);
      const unlockAt = info.unlockAt ?? NaN;
      const on = unlockAt <= progress + 1e-9;
      if (on && unlockAt > progressAtDayStart + 1e-9) {
        fresh.push(grown);
        if (!grown.visible && !info.growStart && grown.position.lengthSq() > 0) info.growStart = nowMs;
      }
      grown.visible = on;
    });
    newToday = [...new Set(fresh.map(nameOf))];
    const upcoming = world.growth.filter((grown) => (piece(grown).unlockAt ?? NaN) > progress + 1e-9).sort((a, b) => (piece(a).unlockAt ?? 0) - (piece(b).unlockAt ?? 0))[0];
    nextUp = upcoming ? nameOf(upcoming) + (piece(upcoming).landmark ? ' (landmark)' : '') : null;
    world.coralMaterials.forEach((material) => {
      material.emissive.set(bleached ? 0x5a5a58 : 0x000000);
    });
    gradeUniforms.sat.value = (bleached ? 0.35 : view.breaks.sad ? 0.75 : 1.15) * (1 - weather.cloud * 0.3 - weather.fog * 0.15);
    gradeUniforms.tint.value.set(1, 1, 1).lerp(murk ? murk.tint : color(0xd8f0b0), blight * 0.5);
    renderer.toneMappingExposure = ((water ? 1.05 : 1.0) + night * 0.2) * (1 - weather.cloud * 0.22 - weather.storm * 0.1);
    if (stats.bloom) {
      bloom.strength = 0.28 + night * 0.55;
      bloom.threshold = 0.9 - night * 0.5;
    }
    world.envDirty = true;
    kick();
  }

  /* ===== loop ===== */
  let frameRequest = 0;
  let lastFrame = 0;
  let environmentTick = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fpsChecked = false;
  let warmUpFrames = 0; /* skip shader-compile frames */
  function resize(): boolean {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio = renderer.getPixelRatio();
    if (!width || !height) return false;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = fieldOfView(width / height);
      camera.updateProjectionMatrix();
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      if (world.snowUniforms) world.snowUniforms.uPx.value = height * ratio * 0.022;
    }
    return true;
  }
  function frame(time: number): void {
    frameRequest = 0;
    const reduce = host.reducedMotion.matches;
    const motion = reduce ? 0 : 1;
    const dt = Math.min(0.05, lastFrame ? (time - lastFrame) / 1000 : 0.016);
    lastFrame = time;
    if (!resize()) return;
    const seconds = time / 1000;
    const inspected = world.inspected;
    const pose = inspected?.pose ?? null;
    shared.uTime.value = pose ? 3 : reduce ? 3 : seconds; /* QA pose: freeze everything else so only the candidate's pose changes */
    if (inspected) inspected.timeUniform.value = pose ? pose.frac * inspected.duration : shared.uTime.value;
    if (world.envDirty && time - environmentTick > 120) {
      bakeEnvironment();
      world.envDirty = false;
      environmentTick = time;
    }
    const drift = motion * Math.sin(seconds * 0.1) * 0.22;
    const orbit = drift + look.yaw;
    camera.position.set(Math.sin(orbit) * 7.4, 2.1 + look.pitch * 6 + motion * Math.sin(seconds * 0.3) * 0.08, Math.cos(orbit) * 7.4);
    camera.lookAt(0, 1.0, -0.6);
    if (inspected && pose) {
      const center = inspected.holder.position;
      const distance = Math.max(0.9, inspected.radius * 3.4);
      const pitch = pose.pitch ?? 0.45;
      camera.position.set(center.x + Math.sin(pose.yaw) * Math.cos(pitch) * distance, center.y + Math.sin(pitch) * distance, center.z + Math.cos(pose.yaw) * Math.cos(pitch) * distance);
      camera.lookAt(center.x, center.y + inspected.radius * 0.4, center.z);
    }
    dome.position.copy(camera.position);
    world.propMixers.forEach((mixer) => mixer.update(reduce || pose ? 0 : dt));
    if (inspected?.mixer) {
      if (inspected.pose) inspected.mixer.setTime(inspected.pose.frac * inspected.duration);
      else inspected.mixer.update(dt);
    }
    world.ambient.forEach((object) => {
      if (object.visible) piece(object).tick?.(motion ? seconds : 3);
    });
    world.growth.forEach((grown) => {
      const info = piece(grown);
      if (!info.growStart || !info.base) return;
      const progress = Math.min(1, (time - info.growStart) / 1600);
      const eased = progress < 1 ? 1 - Math.pow(1 - progress, 3) * (1 - Math.sin(progress * 9) * 0.15) : 1;
      grown.scale.copy(info.base).multiplyScalar(Math.max(0.01, eased));
      if (progress >= 1) info.growStart = 0;
    });
    world.rays.forEach((shaft, i) => {
      shaft.lookAt(camera.position.x, shaft.position.y, camera.position.z);
      shaft.rotateZ((piece(shaft).slant ?? 0) + motion * Math.sin(seconds * 0.2 + i) * 0.04);
    });
    const sulk = host.view()?.breaks.sad ? 0.45 : 1; /* skipped a break today: the fish mope */
    creatures.step((pose ? 0 : reduce ? 0.016 : dt) * sulk, seconds, reduce ? (creatures.foodCount ? 1 : 0) : 1);
    composer.render(dt);
    /* fps over ~2 s after a warm-up; below 40 drops bloom for good */
    if (!fpsChecked && !reduce && !hooks.inspectId && ++warmUpFrames > 45) {
      fpsFrames++;
      fpsTime += dt;
      if (fpsTime > 2 && fpsFrames > 20) {
        stats.fps = Math.round(fpsFrames / fpsTime);
        fpsChecked = true;
        if (stats.fps < 40) {
          bloom.enabled = false;
          stats.bloom = false;
        }
      }
    }
    if (running() && (!reduce || creatures.foodCount)) frameRequest = requestAnimationFrame(frame);
  }
  const running = (): boolean => (host.inView() || host.isOpen()) && document.visibilityState === 'visible';
  function kick(): void {
    if (!frameRequest && running()) {
      lastFrame = 0;
      frameRequest = requestAnimationFrame(frame);
    }
  }
  document.addEventListener('visibilitychange', kick);
  host.reducedMotion.addEventListener('change', kick);
  const inspect: EcosystemInspect = {
    get ready() {
      return !!world.inspected;
    },
    get dur() {
      return world.inspected ? world.inspected.duration : 0;
    },
    pose(input) {
      const inspected = world.inspected;
      if (!inspected) return false;
      inspected.pose = input ? { yaw: input.yaw || 0, frac: input.frac || 0, pitch: input.pitch } : null;
      kick();
      return true;
    },
  };
  return {
    apply,
    kick,
    loadCreatures,
    dropFood: (count) => {
      creatures.dropFood(count);
    },
    inspect,
    get visitorName() {
      return visitorName;
    },
    get visitorInfo() {
      return visitorInfo;
    },
    get newToday() {
      return newToday;
    },
    get nextUp() {
      return nextUp;
    },
    debug: () => ({ food: creatures.foodCount, creatures: creatures.debug() }),
  };
}
