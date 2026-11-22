/* Creatures: spawning roster glbs, roaming their loop paths, steering to food (idle -> feed -> idle, mouth aimed at the food),
   hiding by shelter when lessons lapse, and resting (docs/design/creature-rest.md): roam -> approach -> settle -> perched -> leave -> enter. */
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DISPLAY_SCALE, type EngineContext } from './context.ts';
import { firstMaterial, isMesh, piece, type Three } from './kit.ts';
import type { CreatureSpec, RosterEntry } from './manifests.ts';
import { groundHeight, restSpec, smoothstep, type RestSpec, type SceneView } from './rules.ts';

type CreatureState = 'roam' | 'enter' | 'seek' | 'eat' | 'hide' | 'approach' | 'settle' | 'perched' | 'leave';

const RESTING = new Set<CreatureState>(['approach', 'settle', 'perched', 'leave']);
const ON_SITE = new Set<CreatureState>(['settle', 'perched']);

interface LoopPath {
  center: [number, number];
  radii: [number, number];
  height: number;
  speed: number;
  phase: number;
  direction: number;
}

interface PerchSite {
  point: Three.Vector3;
  normal: Three.Vector3;
  object: Three.Object3D | null;
  score: number;
}

interface PerchPose {
  rotation: Three.Quaternion;
  position: Three.Vector3;
  /** the hover point it lands from and leaves to */
  hover: Three.Vector3;
}

export interface Food {
  mesh: Three.Mesh;
  speed: number;
  claimedBy: Creature | null;
  landed: number;
}

interface Creature {
  id: string;
  holder: Three.Group;
  root: Three.Object3D;
  mouth: Three.Object3D;
  mixer: Three.AnimationMixer;
  idle: Three.AnimationAction | null;
  feed: Three.AnimationAction | null;
  sulk: Three.AnimationAction | null;
  perch: Three.AnimationAction | null;
  loop: Three.AnimationAction | null;
  shelter: string;
  locomotion: string;
  path: LoopPath;
  angle: number;
  length: number;
  footY: number;
  position: Three.Vector3;
  previous: Three.Vector3;
  yaw: number;
  pitch: number;
  state: CreatureState;
  target: Food | null;
  eatEnd: number;
  eaten: number;
  rest: RestSpec | null;
  grip: Three.Vector3;
  belly: number;
  site: PerchSite | null;
  perchPose: PerchPose | null;
  nextRest: number | null;
  restEnd: number;
  transitionStart: number;
  /** start on the perch with no approach (sessile, or ?perch=1) */
  snap: boolean;
  index: number;
  hideSpot: Three.Vector3 | null;
}

export interface CreatureDebug {
  id: string;
  state: string;
  eaten: number;
  loco: string;
  pos: number[];
  feeding: boolean;
  loop: string | null;
  rest: string | null;
  site: { p: number[]; n: number[] } | null;
  quat: number[];
  box: number[][];
  ground: number;
}

export interface CreatureSim {
  readonly count: number;
  readonly foodCount: number;
  clear(): void;
  spawn(gltf: GLTF, entry: RosterEntry, spec: CreatureSpec, copy: number, enter: boolean): void;
  dropFood(count: number): void;
  step(dt: number, seconds: number, motion: number): void;
  debug(): CreatureDebug[];
}

interface SimOptions {
  /** the current biome's pass-through kinds (biomes.json `pass_through`) */
  passThrough(): string[];
  view(): SceneView | null;
  kick(): void;
}

export function createCreatureSim(ctx: EngineContext, options: SimOptions): CreatureSim {
  const { THREE } = ctx.kit;
  const { Vector3 } = THREE;
  const between = ctx.random.between;
  const camera = ctx.camera;
  const world = ctx.world;
  const creatures: Creature[] = [];
  const food: Food[] = [];
  const foodGeometry = new THREE.SphereGeometry(0.04, 8, 6);
  const foodMaterial = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
  const scratch = new Vector3();
  const scratchOther = new Vector3();
  const UP = new Vector3(0, 1, 0);
  const restRay = new THREE.Raycaster();
  const normalMatrix = new THREE.Matrix3();
  const basis = new THREE.Matrix4();
  const settledMatrix = new THREE.Matrix4();
  const scratchQuaternion = new THREE.Quaternion();
  const scratchEuler = new THREE.Euler();
  let pathSeed = 0;

  const isGrounded = (creature: Creature): boolean => creature.locomotion === 'walk' || creature.locomotion === 'crawl';

  function pathPosition(creature: Creature, angle: number): Three.Vector3 {
    const path = creature.path;
    const x = path.center[0] + Math.cos(angle * path.direction) * path.radii[0];
    const z = path.center[1] + Math.sin(angle * path.direction) * path.radii[1];
    const ground = groundHeight(x, z);
    if (creature.locomotion === 'rooted') return new Vector3(path.center[0], groundHeight(path.center[0], path.center[1]) + creature.footY, path.center[1]);
    if (isGrounded(creature)) return new Vector3(x, ground + creature.footY, z);
    if (creature.locomotion === 'fly') return new Vector3(x, ground + 1.6 + path.height + Math.abs(Math.sin(angle * 1.5)) * 0.9, z);
    return new Vector3(x, ground + path.height + Math.sin(angle * 2) * 0.18, z);
  }

  function spawn(gltf: GLTF, entry: RosterEntry, spec: CreatureSpec, copy: number, enter: boolean): void {
    const root = ctx.kit.skeletonUtils.clone(gltf.scene);
    const holder = new THREE.Group();
    holder.add(root);
    root.scale.setScalar(DISPLAY_SCALE);
    if (entry.forward === '-X') root.rotation.y = Math.PI;
    root.traverse((object) => {
      if (!isMesh(object)) return;
      object.castShadow = true;
      object.frustumCulled = false;
      object.material = ctx.shading.patch(firstMaterial(object).clone());
    });
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const length = box.max.x - box.min.x;
    let mouth = root.getObjectByName('mouth');
    if (!mouth) {
      mouth = new THREE.Object3D();
      mouth.position.set(box.max.x / DISPLAY_SCALE, 0, 0);
      root.add(mouth);
    }
    const mixer = new THREE.AnimationMixer(root);
    const clip = (name: string): Three.AnimationClip | undefined => gltf.animations.find((animation) => animation.name === name);
    const idleClip = clip('idle');
    const feedClip = clip('feed');
    const sulkClip = clip('sulk');
    const idle = idleClip ? mixer.clipAction(idleClip) : null;
    const feed = feedClip ? mixer.clipAction(feedClip) : null;
    const sulk = sulkClip ? mixer.clipAction(sulkClip) : null;
    const timeScale = 0.92 + Math.random() * 0.16;
    if (idle) {
      idle.play();
      idle.time = Math.random() * idle.getClip().duration;
      idle.timeScale = timeScale;
    }
    if (feed) {
      feed.setLoop(THREE.LoopOnce, 1);
      feed.clampWhenFinished = true;
      feed.timeScale = timeScale;
    }
    if (sulk) sulk.timeScale = timeScale;
    const locomotion = (entry.locomotion || spec.locomotion || 'swim').toLowerCase();
    const index = pathSeed++;
    const centers: [number, number][] = [[1.4, 1.2], [-0.6, 0.4], [0.8, -0.6], [-1.8, 1.0]];
    const path: LoopPath = {
      center: centers[index % 4] ?? [0, 0],
      radii: [between(1.1, 1.7), between(0.6, 1.0)],
      height: between(0.7, 1.4),
      speed: between(0.28, 0.4) * (locomotion === 'drift' ? 0.4 : locomotion === 'walk' || locomotion === 'crawl' ? 0.35 : 1),
      phase: between(0, 6.28),
      direction: index % 2 ? -1 : 1,
    };
    /* resting (CONTRACT "Resting"): the `perch` loop, else idle at half speed; `grip` = where a hanging body holds on, else its rear tip */
    const rest = restSpec(entry.rest, spec.rest, ctx.hooks.forcedRest, locomotion);
    const perchClip = clip('perch');
    const perchSource = perchClip ?? idleClip?.clone();
    const perch = rest && perchSource ? mixer.clipAction(perchSource) : null;
    if (perch) perch.timeScale = perchClip ? timeScale : timeScale * 0.5;
    const gripNode = root.getObjectByName('grip');
    const grip = gripNode ? gripNode.getWorldPosition(new Vector3()) : new Vector3(box.min.x, (box.min.y + box.max.y) / 2, 0);
    const creature: Creature = {
      id: entry.id, holder, root, mouth, mixer, idle, feed, sulk, perch, loop: idle, shelter: spec.shelter || 'rock', locomotion, path, angle: path.phase, length,
      footY: -box.min.y, position: new Vector3(), previous: new Vector3(), yaw: 0, pitch: 0, state: 'roam', target: null, eatEnd: 0, eaten: 0,
      rest, grip, belly: box.min.y, site: null, perchPose: null, nextRest: null, restEnd: 0, transitionStart: 0,
      snap: !!rest && (ctx.hooks.forcedPerch || rest.sessile), index: 0, hideSpot: null,
    };
    creature.position.copy(pathPosition(creature, creature.angle));
    if (enter && locomotion !== 'rooted') {
      /* swims or flies in from the edge */
      creature.state = 'enter';
      creature.position.x = (copy % 2 ? -1 : 1) * 9;
      creature.position.y += 0.6;
    }
    if (entry.rarity === 'exotic') holder.add(new THREE.PointLight(0xffd36a, 1.2, 1.6 + length * 2)); /* exotic: a soft golden glow */
    creature.previous.copy(creature.position);
    holder.position.copy(creature.position);
    ctx.scene.add(holder);
    creatures.push(creature);
  }

  const restGap = (rest: RestSpec): number => ((between(rest.bout[0], rest.bout[1]) * (1 - rest.share)) / rest.share) * between(0.7, 1.3);
  const shown = (object: Three.Object3D): boolean => {
    for (let node: Three.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
    return true;
  };
  /* a point in the object's space, in the world once the object has grown in (growth animates scale up to its base) */
  const settled = (object: Three.Object3D, local: Three.Vector3): Three.Vector3 => {
    object.updateMatrixWorld(true);
    settledMatrix.compose(object.position, object.quaternion, piece(object).base ?? object.scale);
    if (object.parent) settledMatrix.premultiply(object.parent.matrixWorld);
    return local.clone().applyMatrix4(settledMatrix);
  };
  /* the outer surface of `object` seen from `direction` (unit, from its centre): hit point and world normal */
  function surfaceHit(object: Three.Object3D, direction: Three.Vector3): { point: Three.Vector3; normal: Three.Vector3; object: Three.Object3D } | null {
    const center = new THREE.Box3().setFromObject(object).getCenter(new Vector3());
    restRay.set(center.clone().addScaledVector(direction, 8), direction.clone().negate());
    restRay.far = 16;
    const hit = restRay.intersectObject(object, true)[0];
    if (!hit?.face) return null;
    return { point: hit.point.clone(), normal: hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize(), object };
  }
  /* a free perch site of the creature's kind near its loop, on the camera's side; null = none in this world (it keeps roaming) */
  function findSite(creature: Creature, rest: RestSpec): PerchSite | null {
    const home = new Vector3(creature.path.center[0], 0, creature.path.center[1]);
    const cameraAt = camera.position;
    const taken = creatures.filter((other) => other !== creature && other.site).flatMap((other) => (other.site ? [other.site.point] : []));
    const free = (point: Three.Vector3): boolean => taken.every((other) => other.distanceTo(point) > creature.length * 1.6);
    const best = (sites: PerchSite[]): PerchSite | null => sites.sort((a, b) => a.score - b.score)[0] ?? null;
    if (rest.on === 'sand') {
      const sites: PerchSite[] = [];
      for (let i = 0; i < 32; i++) {
        const x = home.x + between(-2.2, 2.2);
        const z = home.z + between(-1.6, 1.6);
        const point = new Vector3(x, groundHeight(x, z), z);
        if (Math.abs(x) > 5.5 || z < -4.5 || z > 3.2 || !free(point)) continue;
        if (world.colliders.some((collider) => shown(collider.object) && Math.hypot((x - collider.center.x) / (collider.radii.x + creature.length * 0.6), (z - collider.center.z) / (collider.radii.z + creature.length * 0.6)) < 1)) continue;
        sites.push({ point, normal: ctx.groundNormal(x, z), object: null, score: Math.hypot(x - home.x, z - home.z) });
      }
      return best(sites);
    }
    if (rest.pose === 'hang' || rest.on === 'branch') {
      /* overhead grips: limbs, scenery perch* nodes */
      return best(
        world.grips
          .filter((grip) => shown(grip.object) && (rest.on === 'branch' || piece(grip.object).prop))
          .map((grip): PerchSite => {
            const local = grip.node ? grip.object.worldToLocal(grip.node.getWorldPosition(new Vector3())) : (grip.local ?? new Vector3());
            const point = settled(grip.object, local);
            return { point, normal: new Vector3(0, -1, 0), object: grip.object, score: point.distanceTo(home) + between(0, 1) };
          })
          .filter((site) => free(site.point) && (rest.pose !== 'hang' || site.point.y - groundHeight(site.point.x, site.point.z) > creature.length * 1.2)), /* a hanging body must clear the ground */
      );
    }
    /* cling to a rock or prop: side faces (not the top, not underneath) the camera can see, clear of the sand */
    const objects: Three.Object3D[] = rest.on === 'rock'
      ? world.rocks
      : world.colliders.filter((collider) => piece(collider.object).prop && shown(collider.object) && !piece(collider.object).growStart).map((collider) => collider.object); /* growStart: still growing in */
    const sites: PerchSite[] = [];
    for (const object of objects) {
      for (let i = 0; i < 6; i++) {
        const direction = new Vector3(cameraAt.x - object.position.x, 0, cameraAt.z - object.position.z).normalize().applyAxisAngle(UP, between(-1.1, 1.1));
        direction.y = between(-0.05, 0.6);
        direction.normalize();
        const hit = surfaceHit(object, direction);
        if (!hit || hit.normal.y < -0.3 || hit.normal.y > 0.75 || hit.point.y < groundHeight(hit.point.x, hit.point.z) + creature.length * 0.3 || !free(hit.point)) continue;
        sites.push({ ...hit, score: hit.point.distanceTo(home) * 0.3 + between(0, 0.5) });
      }
    }
    return best(sites);
  }
  /* where the body goes on a site: cling and lie = belly on the surface (up = normal, head up-slope on steep faces, else its heading);
     hang = head down from its grip, back to the camera. */
  function perchPose(creature: Creature, rest: RestSpec, site: PerchSite): PerchPose {
    let forward: Three.Vector3;
    let up: Three.Vector3;
    let anchor: Three.Vector3;
    if (rest.pose === 'hang') {
      forward = new Vector3(0, -1, 0);
      up = new Vector3(camera.position.x - site.point.x, 0, camera.position.z - site.point.z).normalize();
      anchor = creature.grip;
    } else {
      up = site.normal.clone();
      const head = Math.abs(up.y) < 0.7 ? UP.clone() : new Vector3(Math.cos(creature.yaw), 0, -Math.sin(creature.yaw));
      forward = head.addScaledVector(up, -head.dot(up));
      if (forward.lengthSq() < 1e-6) forward.set(1, 0, 0).addScaledVector(up, -up.x);
      forward.normalize();
      anchor = new Vector3(0, creature.belly * 0.92, 0); /* sink 8% so it reads as touching */
    }
    const side = forward.clone().cross(up).normalize();
    up = side.clone().cross(forward).normalize();
    const away = rest.pose === 'hang' ? up : site.normal;
    const rotation = new THREE.Quaternion().setFromRotationMatrix(basis.makeBasis(forward, up, side));
    const position = site.point.clone().sub(anchor.clone().applyQuaternion(rotation));
    return { rotation, position, hover: position.clone().addScaledVector(away, creature.length * 0.9 + 0.2) };
  }
  /* timers and transitions; returns the desired position for the resting states, else null */
  function stepRest(creature: Creature, seconds: number, dt: number, motion: number, hiding: boolean): Three.Vector3 | null {
    const rest = creature.rest;
    if (!rest) return null;
    if (creature.nextRest == null) creature.nextRest = seconds + restGap(rest); /* a visitor never rests the moment it arrives */
    if ((creature.state === 'roam' || (creature.snap && creature.state === 'enter')) && (creature.snap || (motion && seconds >= creature.nextRest && !food.length && !hiding))) {
      const site = findSite(creature, rest);
      if (!site) {
        creature.snap = false;
        creature.nextRest = seconds + 8;
        return null;
      }
      creature.site = site;
      const pose = perchPose(creature, rest, site);
      creature.perchPose = pose;
      if (creature.snap) {
        creature.snap = false;
        creature.state = 'perched';
        creature.position.copy(pose.position);
        creature.holder.quaternion.copy(pose.rotation);
        creature.restEnd = rest.sessile ? Infinity : seconds + between(rest.bout[0], rest.bout[1]);
      } else creature.state = 'approach';
    }
    const pose = creature.perchPose;
    if (!pose) return null;
    if (creature.state === 'approach') {
      const toward = pose.hover.clone().sub(creature.position);
      const distance = toward.length();
      const stride = 1.1 * dt * motion;
      if (distance < 0.05) {
        creature.state = 'settle';
        creature.transitionStart = seconds;
      }
      return distance <= stride ? pose.hover.clone() : creature.position.clone().addScaledVector(toward, stride / distance);
    }
    if (creature.state === 'settle' || creature.state === 'leave') {
      const settling = creature.state === 'settle';
      const progress = smoothstep(0, settling ? 1.4 : 0.9, seconds - creature.transitionStart);
      const [from, to] = settling ? [pose.hover, pose.position] : [pose.position, pose.hover];
      const point = from.clone().lerp(to, progress);
      if (progress >= 1) {
        if (settling) {
          creature.state = 'perched';
          creature.restEnd = rest.sessile ? Infinity : seconds + between(rest.bout[0], rest.bout[1]);
        } else {
          creature.state = 'enter';
          creature.site = null;
          creature.perchPose = null;
          creature.nextRest = seconds + restGap(rest);
        }
      }
      return point;
    }
    if (creature.state === 'perched') {
      /* food in reach or hiding time calls it off its perch; a sessile one stays put */
      if (!rest.sessile && (seconds >= creature.restEnd || hiding || food.some((item) => item.mesh.position.distanceTo(creature.position) < 7))) {
        creature.state = 'leave';
        creature.transitionStart = seconds;
      }
      return pose.position.clone();
    }
    return null;
  }

  function removeFood(item: Food): void {
    ctx.scene.remove(item.mesh);
    const index = food.indexOf(item);
    if (index >= 0) food.splice(index, 1);
  }
  function dropFood(count: number): void {
    const water = world.medium === 'water';
    const first = creatures[0];
    const centerX = first ? first.position.x : 0;
    const centerZ = first ? first.position.z : 1;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(foodGeometry, foodMaterial);
      mesh.position.set(centerX + between(-1, 1), (water ? 3.6 : 3) + between(0, 0.8), centerZ + between(-0.6, 0.6));
      ctx.scene.add(mesh);
      food.push({ mesh, speed: water ? between(0.25, 0.4) : between(0.9, 1.3), claimedBy: null, landed: 0 });
    }
    options.kick();
  }
  /* no passing through rocks, the ground or each other: project the body back outside after each move.
     `except`: the perch object it is landing on */
  function keepClear(creature: Creature, except: Three.Object3D | null): void {
    const pad = creature.length * 0.55;
    const offset = new Vector3();
    const passKinds = options.passThrough().concat(world.passKinds);
    for (const collider of world.colliders) {
      if (passKinds.includes(collider.kind) || !collider.object.visible || collider.object === except) continue; /* hidden growth (not yet grown) isn't there */
      offset.set((creature.position.x - collider.center.x) / (collider.radii.x + pad), (creature.position.y - collider.center.y) / (collider.radii.y + pad), (creature.position.z - collider.center.z) / (collider.radii.z + pad));
      const reach = offset.length();
      if (reach >= 1) continue;
      if (reach < 1e-4) offset.set(0, 1, 0);
      else offset.divideScalar(reach);
      creature.position.set(collider.center.x + offset.x * (collider.radii.x + pad), collider.center.y + offset.y * (collider.radii.y + pad), collider.center.z + offset.z * (collider.radii.z + pad));
    }
    for (const other of creatures) {
      if (other === creature) continue;
      const minimum = (creature.length + other.length) * 0.5;
      offset.copy(creature.position).sub(other.position);
      const distance = offset.length();
      if (distance < minimum && distance > 1e-4) creature.position.addScaledVector(offset, ((minimum - distance) / distance) * 0.5);
    }
    const floor = groundHeight(creature.position.x, creature.position.z) + (isGrounded(creature) ? creature.footY : creature.length * 0.35);
    if (creature.position.y < floor) creature.position.y = floor;
  }
  /* a spot on the far side of the nearest shelter (as seen from the camera), low, fanned out per creature */
  function shelterSpot(creature: Creature): Three.Vector3 {
    const live = (kind: string): typeof world.colliders => world.colliders.filter((collider) => collider.kind === kind && collider.object.visible);
    const props = world.colliders.filter((collider) => piece(collider.object).prop && collider.object.visible); /* biome scenery is shelter before bare rock */
    const shelters = live(creature.shelter).length ? live(creature.shelter) : props.length ? props : live('rock');
    const first = shelters[0];
    if (!first) {
      const x = creature.index % 2 ? -3.5 : 3.5;
      const z = -4;
      return new Vector3(x, groundHeight(x, z) + creature.length * 0.6, z);
    }
    const nearest = shelters.reduce((a, b) => (a.center.distanceTo(creature.position) <= b.center.distanceTo(creature.position) ? a : b), first);
    const away = new Vector3(nearest.center.x - camera.position.x, 0, nearest.center.z - camera.position.z).normalize().applyAxisAngle(new Vector3(0, 1, 0), ((creature.index % 3) - 1) * 0.6);
    const spot = nearest.center.clone().addScaledVector(away, Math.max(nearest.radii.x, nearest.radii.z) + creature.length * 0.8);
    spot.y = groundHeight(spot.x, spot.z) + (isGrounded(creature) ? creature.footY : creature.length * 0.6);
    return spot;
  }
  function step(dt: number, seconds: number, motion: number): void {
    const view = options.view();
    const sad = !!view?.breaks.sad;
    const hiding = !!view?.lessons.hide;
    creatures.forEach((creature, i) => {
      creature.index = i;
    });
    for (const creature of creatures) {
      const restPoint = stepRest(creature, seconds, dt, motion, hiding);
      /* the looping clip: on a perch, 'perch' (a sessile one mopes there with 'sulk'); otherwise 'sulk' (the creature's own mope,
         from the model pipeline) while sad or hiding, else 'idle' */
      const mope = (sad || hiding) && creature.sulk;
      const wanted = ON_SITE.has(creature.state) && creature.perch ? (creature.rest?.sessile && mope ? creature.sulk : creature.perch) : mope ? creature.sulk : creature.idle;
      /* no lessons for days: tuck in by the creature's shelter (spec shelter, else a rock); food (a lesson) brings it out */
      if (hiding && creature.state === 'roam' && creature.locomotion !== 'rooted' && !food.length) {
        creature.state = 'hide';
        creature.hideSpot = shelterSpot(creature);
      }
      if (creature.state === 'hide' && (!hiding || food.length)) {
        creature.state = 'roam';
        creature.hideSpot = null;
      }
      if (wanted && creature.loop && wanted !== creature.loop && creature.state !== 'eat') {
        wanted.reset().play();
        creature.loop.crossFadeTo(wanted, 1.2, false);
        creature.loop = wanted;
      }
      creature.mixer.update(dt * motion);
      if (creature.state === 'roam' && food.length && creature.eaten < 4 && creature.locomotion !== 'rooted') {
        const nearest = food.filter((item) => !item.claimedBy).sort((a, b) => a.mesh.position.distanceTo(creature.position) - b.mesh.position.distanceTo(creature.position))[0];
        if (nearest && nearest.mesh.position.distanceTo(creature.position) < 7) {
          nearest.claimedBy = creature;
          creature.target = nearest;
          creature.state = 'seek';
        }
      }
      let desired: Three.Vector3;
      if (restPoint) desired = restPoint;
      else if (creature.state === 'seek') {
        const target = creature.target;
        if (!target?.mesh.parent) {
          creature.state = 'roam';
          creature.target = null;
          continue;
        }
        creature.holder.updateMatrixWorld(true);
        creature.mouth.getWorldPosition(scratch);
        scratchOther.copy(creature.holder.position).sub(scratch); /* root - mouth */
        desired = target.mesh.position.clone().add(scratchOther);
        if (isGrounded(creature)) desired.y = Math.max(desired.y, groundHeight(desired.x, desired.z) + creature.footY);
        if (scratch.distanceTo(target.mesh.position) < Math.max(0.12, creature.length * 0.12)) {
          creature.state = 'eat';
          creature.eaten++;
          removeFood(target);
          creature.target = null;
          const duration = creature.feed ? creature.feed.getClip().duration / creature.feed.timeScale : 1.2;
          if (creature.feed && creature.loop) {
            creature.feed.reset().play();
            creature.loop.crossFadeTo(creature.feed, 0.25, false);
          }
          creature.eatEnd = seconds + duration * 0.92;
        }
      } else if (creature.state === 'eat') {
        desired = creature.position.clone();
        if (seconds >= creature.eatEnd) {
          if (creature.feed && creature.loop) {
            creature.loop.reset().play();
            creature.feed.crossFadeTo(creature.loop, 0.3, false);
          }
          creature.state = 'roam';
        }
      } else if (creature.state === 'hide' && creature.hideSpot) {
        desired = creature.hideSpot.clone().add(new Vector3(Math.sin(seconds * 0.35 + creature.path.phase) * creature.length * 0.4, Math.sin(seconds * 0.25 + creature.path.phase) * creature.length * 0.15, 0));
      } else if (creature.state === 'enter') {
        creature.angle += dt * motion * creature.path.speed;
        const goal = pathPosition(creature, creature.angle);
        const toward = goal.clone().sub(creature.position);
        const distance = toward.length();
        desired = distance < 0.25 ? goal : creature.position.clone().addScaledVector(toward, Math.min(1, (1.3 * dt * motion) / distance));
        if (distance < 0.25) creature.state = 'roam';
      } else {
        creature.angle += dt * motion * creature.path.speed;
        desired = pathPosition(creature, creature.angle);
        if (!food.length) creature.eaten = 0;
      }
      const follow = creature.state === 'enter' || RESTING.has(creature.state) ? 1 : creature.state === 'seek' ? 1 - Math.exp(-dt * 2.2) : creature.state === 'hide' ? 1 - Math.exp(-dt * 0.7) : 1 - Math.exp(-dt * 3);
      creature.previous.copy(creature.position);
      creature.position.lerp(desired, follow * motion || (motion ? 0 : 1));
      if (creature.state === 'seek') {
        const toward = desired.clone().sub(creature.position);
        const distance = toward.length();
        const stride = 1.4 * dt;
        if (distance > stride) creature.position.addScaledVector(toward, stride / distance);
      }
      if (creature.locomotion !== 'rooted' && (!RESTING.has(creature.state) || creature.state === 'approach')) keepClear(creature, creature.state === 'approach' && creature.site ? creature.site.object : null);
      const velocity = scratch.copy(creature.position).sub(creature.previous);
      const face = creature.state !== 'roam' && creature.target ? scratchOther.copy(creature.target.mesh.position).sub(creature.position) : velocity;
      if (face.lengthSq() > 1e-8 && creature.locomotion !== 'rooted' && !ON_SITE.has(creature.state)) {
        const yaw = Math.atan2(-face.z, face.x);
        const pitch = isGrounded(creature) ? 0 : Math.atan2(face.y, Math.hypot(face.x, face.z)) * 0.8;
        let turn = yaw - creature.yaw;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        creature.yaw += turn * Math.min(1, dt * 4);
        creature.pitch += (pitch - creature.pitch) * Math.min(1, dt * 4);
      }
      /* turn toward the target orientation (perch pose on a site, else heading); easing it means landing and take-off never pop */
      const targetRotation = ON_SITE.has(creature.state) && creature.perchPose ? creature.perchPose.rotation : scratchQuaternion.setFromEuler(scratchEuler.set(0, creature.yaw, creature.pitch, 'YZX'));
      creature.holder.position.copy(creature.position);
      creature.holder.quaternion.slerp(targetRotation, 1 - Math.exp(-dt * (creature.state === 'settle' || creature.state === 'leave' ? 3 : 10)));
    }
    for (let i = food.length - 1; i >= 0; i--) {
      const item = food[i];
      if (!item) continue;
      const floor = groundHeight(item.mesh.position.x, item.mesh.position.z) + 0.05;
      if (item.mesh.position.y > floor) {
        item.mesh.position.y = Math.max(floor, item.mesh.position.y - item.speed * dt * motion);
        item.mesh.position.x += Math.sin(seconds * 2 + i) * 0.002 * motion;
      } else if ((item.landed += dt) > 8) {
        const claimant = item.claimedBy;
        if (claimant && claimant.target === item) {
          claimant.state = 'roam';
          claimant.target = null;
        }
        removeFood(item);
      }
    }
  }

  const rounded = (values: number[], digits: number): number[] => values.map((value) => +value.toFixed(digits));
  return {
    get count() {
      return creatures.length;
    },
    get foodCount() {
      return food.length;
    },
    clear() {
      creatures.splice(0).forEach((creature) => ctx.scene.remove(creature.holder));
    },
    spawn,
    dropFood,
    step,
    debug: () =>
      creatures.map((creature) => {
        const box = new THREE.Box3().setFromObject(creature.root);
        return {
          id: creature.id, state: creature.state, eaten: creature.eaten, loco: creature.locomotion, pos: rounded(creature.position.toArray(), 2),
          feeding: !!creature.feed?.isRunning(), loop: creature.loop ? creature.loop.getClip().name : null,
          rest: creature.rest ? `${creature.rest.pose} on ${creature.rest.on}` : null,
          site: creature.site ? { p: rounded(creature.site.point.toArray(), 2), n: rounded(creature.site.normal.toArray(), 2) } : null,
          quat: rounded(creature.holder.quaternion.toArray(), 3), box: [rounded(box.min.toArray(), 2), rounded(box.max.toArray(), 2)],
          ground: +groundHeight(creature.position.x, creature.position.z).toFixed(2),
        };
      }),
  };
}

