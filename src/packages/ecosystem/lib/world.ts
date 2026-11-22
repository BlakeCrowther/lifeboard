/* The world: everything rebuilt when the biome's scene changes. A frame (ground, rocks, cover, light shafts, motes), then either
   the biome's own scenery (roster props placed by biomes.json `scenery`) or the scene builder's procedural pieces in phase tiers,
   then blight, the QA inspect copy and particles. Every random call goes through the seeded random in a fixed order, so a biome
   lays out the same every time. */
import { DISPLAY_SCALE, type EngineContext, type Frame, type LoadedProps } from './context.ts';
import { FRAMES } from './frames.ts';
import { isInstancedMesh, isMesh, positionsOf, isSkinnedMesh, firstMaterial, nodeExtra, piece, type Three } from './kit.ts';
import type { Biome, ColorValue } from './manifests.ts';
import { groundHeight, placementPhase, smoothstep, unlockShare } from './rules.ts';

/** where ?inspect= puts the candidate; blight copies keep clear of it */
const INSPECT_AT: [number, number] = [0, 2.2];
const FALLBACK_FRAME: Frame = { ground: '#d8c290', speck: [220, 198, 150, 0.6], rock: [0x7a7166, 0x4c463f, 0xc77a95, 0x6f8a45, 0.25], rocks: [], cover: null, mote: 0xe8fbff };

interface BranchOptions {
  spread?: number;
  kids?: number;
  trunks?: number;
  len?: number;
  rad?: number;
  depth?: number;
}

export function buildWorld(ctx: EngineContext, medium: string, sceneKey: string | null, biome: Biome, props: LoadedProps | null): void {
  const { THREE, geometryUtils } = ctx.kit;
  const { Vector3 } = THREE;
  const { patch } = ctx.shading;
  const shared = ctx.shading.uniforms;
  const between = ctx.random.between;
  const nextRandom = ctx.random.next;
  const state = ctx.world;
  const inspectId = ctx.hooks.inspectId;

  if (state.group) {
    ctx.scene.remove(state.group);
    state.group.traverse((object) => {
      if (isMesh(object)) object.geometry.dispose();
    });
  }
  const world = new THREE.Group();
  ctx.scene.add(world);
  state.group = world;
  state.medium = medium;
  const key = sceneKey || (medium === 'water' ? 'reef' : medium === 'air' ? 'canopy' : 'meadow');
  state.sceneKey = key;
  const growth: Three.Object3D[] = [];
  const ambient: Three.Object3D[] = [];
  const grips = state.grips;
  state.growth = growth;
  state.ambient = ambient;
  state.coralMaterials = [];
  state.rays = [];
  state.blightCopies = [];
  state.blightInstances = null;
  ctx.random.reset();
  state.propMixers = [];
  state.passKinds = [];
  const water = medium === 'water';
  let frame: Frame = FRAMES[key] ?? (water ? FRAMES['reef'] : FRAMES['meadow']) ?? FALLBACK_FRAME;
  state.frameOverride = (props && biome.frame) || {};
  if (state.frameOverride.ground) frame = { ...frame, ground: state.frameOverride.ground };
  state.frame = frame;
  const groundNormal = ctx.groundNormal;

  /* Every scenery piece registers with a kind; all kinds are solid unless the biome's `pass_through` lists it (biomes.json,
     e.g. kelp). Thin dressing (grass blades, light rays, particles) is never registered. */
  const solid = <T extends Three.Object3D>(kind: string, object: T, pad = 1): T => {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    state.colliders.push({ kind, center: box.getCenter(new Vector3()), radii: box.getSize(new Vector3()).multiplyScalar(0.5 * pad), object });
    const info = piece(object);
    info.kind = info.kind || kind;
    return object;
  };
  const canvasTexture = (size: number, draw: (context: CanvasRenderingContext2D, size: number) => void, repeat = 1): Three.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (context) draw(context, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const groundTexture = (base: string, speck: (shade: number) => string): Three.CanvasTexture =>
    canvasTexture(256, (context, size) => {
      context.fillStyle = base;
      context.fillRect(0, 0, size, size);
      for (let i = 0; i < 9000; i++) {
        const shade = between(0.75, 1.15);
        context.fillStyle = speck(shade);
        context.fillRect(nextRandom() * size, nextRandom() * size, between(1, 2.2), between(1, 2.2));
      }
    }, 9);

  const sandGeometry = new THREE.PlaneGeometry(80, 80, 120, 120);
  sandGeometry.rotateX(-Math.PI / 2);
  {
    const position = positionsOf(sandGeometry);
    for (let i = 0; i < position.count; i++) position.setY(i, groundHeight(position.getX(i), position.getZ(i)));
    sandGeometry.computeVertexNormals();
  }
  const map = groundTexture(frame.ground, (shade) => `rgba(${String((frame.speck[0] * shade) | 0)},${String((frame.speck[1] * shade) | 0)},${String((frame.speck[2] * shade) | 0)},${String(frame.speck[3])})`);
  const sand = new THREE.Mesh(sandGeometry, patch(new THREE.MeshStandardMaterial({ map, roughness: 0.95 })));
  sand.receiveShadow = true;
  world.add(sand);
  const rockMaterial = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  state.rockMaterial = rockMaterial;
  const rocks: Three.Mesh[] = [];
  state.colliders = [];
  const rock = (x: number, z: number, size: number, heightRatio: number): void => {
    let geometry: Three.BufferGeometry = new THREE.IcosahedronGeometry(1, 4);
    geometry.deleteAttribute('normal');
    geometry.deleteAttribute('uv');
    geometry = geometryUtils.mergeVertices(geometry);
    const position = positionsOf(geometry);
    const offset = between(0, 10);
    const colors: number[] = [];
    const color = new THREE.Color();
    const base = new THREE.Color(frame.rock[0]);
    const dark = new THREE.Color(frame.rock[1]);
    const pink = new THREE.Color(frame.rock[2]);
    const moss = new THREE.Color(frame.rock[3]);
    for (let i = 0; i < position.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(position, i);
      const bump = Math.sin(vertex.x * 2.1 + offset) * Math.cos(vertex.z * 2.3 + offset) * 0.16 + Math.sin(vertex.x * 5.3 + vertex.y * 4.1 + offset) * 0.07;
      vertex.multiplyScalar(1 + bump);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
      const top = smoothstep(-0.1, 0.7, vertex.y);
      color.copy(base).lerp(dark, smoothstep(0.1, -0.6, bump * 4));
      if (Math.sin(vertex.x * 4 + offset) * Math.sin(vertex.z * 3.7 + vertex.y * 2) > 0.25) color.lerp(pink, 0.55 * top);
      color.lerp(moss, top * frame.rock[4]);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, rockMaterial);
    mesh.scale.set(size, size * heightRatio, size);
    mesh.position.set(x, groundHeight(x, z) + size * heightRatio * 0.25, z);
    mesh.rotation.y = between(0, 6);
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
    rocks.push(mesh);
    solid('rock', mesh);
  };
  frame.rocks.forEach(([x, z, size, heightRatio]) => {
    rock(x, z, size, heightRatio);
  });
  state.rocks = rocks;
  grips.length = 0;

  const tipAttribute = (geometry: Three.BufferGeometry, maxY: number): Float32Array => {
    const position = positionsOf(geometry);
    const count = position.count;
    const tips = new Float32Array(count);
    for (let i = 0; i < count; i++) tips[i] = position.getY(i) / maxY;
    geometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
    return tips;
  };
  const colorByTip = (geometry: Three.BufferGeometry, tips: Float32Array, root: ColorValue, tip: ColorValue): void => {
    const colors = new Float32Array(tips.length * 3);
    const from = new THREE.Color(root);
    const to = new THREE.Color(tip);
    const color = new THREE.Color();
    for (let i = 0; i < tips.length; i++) {
      color.copy(from).lerp(to, smoothstep(0.35, 1, tips[i] ?? 0));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  };
  const coralMaterial = (sheen: ColorValue): Three.MeshPhysicalMaterial => {
    const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheen) });
    material.defines = { GLOW: '' };
    state.coralMaterials.push(material);
    return patch(material);
  };
  const branchy = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue, options: BranchOptions = {}): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    const spread = options.spread ?? 0.75;
    let maxY = 0;
    const branch = (start: Three.Vector3, direction: Three.Vector3, length: number, radius: number, depth: number): void => {
      const end = start.clone().addScaledVector(direction, length);
      maxY = Math.max(maxY, end.y);
      const limb = new THREE.CylinderGeometry(radius * 0.74, radius, length, 8, 1, true);
      limb.translate(0, length / 2, 0);
      limb.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction));
      limb.translate(start.x, start.y, start.z);
      geometries.push(limb.toNonIndexed());
      const joint = new THREE.SphereGeometry(radius * 0.74, 8, 6);
      joint.translate(end.x, end.y, end.z);
      geometries.push(joint.toNonIndexed());
      if (depth === 0) return;
      for (let i = 0; i < (depth > 1 ? (options.kids ?? 3) : 2); i++) {
        branch(end, direction.clone().add(new Vector3(between(-spread, spread), between(0.25, 0.7), between(-spread, spread))).normalize(), length * between(0.66, 0.82), radius * 0.74, depth - 1);
      }
    };
    for (let i = 0; i < (options.trunks ?? 1); i++) {
      branch(new Vector3(between(-0.15, 0.15), 0, between(-0.15, 0.15)), new Vector3(between(-0.3, 0.3), 1, between(-0.3, 0.3)).normalize(), options.len ?? 0.7, options.rad ?? 0.09, options.depth ?? 3);
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.computeVertexNormals();
    colorByTip(geometry, tipAttribute(geometry, maxY), root, tip);
    const mesh = new THREE.Mesh(geometry, coralMaterial(tip));
    mesh.position.set(x, groundHeight(x, z) - 0.03, z);
    mesh.scale.setScalar(scale);
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
    growth.push(mesh);
    solid(water ? 'coral' : 'shrub', mesh, 0.8); /* 0.8: branches are airy */
    return mesh;
  };
  const brain = (x: number, z: number, radius: number, low: ColorValue, high: ColorValue): Three.Mesh => {
    const geometry = new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    const position = positionsOf(geometry);
    const colors: number[] = [];
    const from = new THREE.Color(low);
    const to = new THREE.Color(high);
    const color = new THREE.Color();
    const tips = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      const vertex = new Vector3().fromBufferAttribute(position, i);
      const normal = vertex.clone().normalize();
      const ridge = Math.sin((vertex.x / radius) * 16 + Math.sin((vertex.z / radius) * 8) * 2.4 + Math.cos((vertex.y / radius) * 6));
      vertex.addScaledVector(normal, ridge * radius * 0.035);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
      color.copy(from).lerp(to, ridge * 0.5 + 0.5);
      colors.push(color.r, color.g, color.b);
      tips[i] = ridge > 0.6 ? 1 : 0;
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aTip', new THREE.BufferAttribute(tips, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, coralMaterial(high));
    mesh.scale.y = 0.8;
    mesh.position.set(x, groundHeight(x, z) - 0.06, z);
    mesh.castShadow = mesh.receiveShadow = true;
    world.add(mesh);
    growth.push(mesh);
    solid('coral', mesh);
    piece(mesh).name = 'brain coral';
    return mesh;
  };
  /* land and air: a flowering shrub from the same branch generator, tips as blossoms */
  const bush = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue): Three.Mesh => branchy(x, z, scale, root, tip, { spread: 0.9, depth: 3, len: 0.5, rad: 0.05, kids: 3 });
  const anemone = (x: number, z: number, color: ColorValue, sheen: ColorValue, count = 120): Three.InstancedMesh => {
    const geometry = new THREE.CylinderGeometry(0.011, 0.03, 0.55, 6, 8);
    geometry.translate(0, 0.275, 0);
    tipAttribute(geometry, 0.55);
    const material = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(sheen) });
    material.defines = { SWAY: '', GLOW: '' };
    patch(material, { uSwayAmp: { value: 0.35 } });
    state.coralMaterials.push(material);
    const instances = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = nextRandom() * 6.283;
      const radius = Math.sqrt(nextRandom()) * 0.48;
      dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      dummy.rotation.set(Math.sin(angle) * radius * 1.3, 0, -Math.cos(angle) * radius * 1.3);
      dummy.scale.setScalar(between(0.75, 1.15));
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.position.set(x, groundHeight(x, z) + 0.02, z);
    instances.castShadow = true;
    world.add(instances);
    solid('anemone', instances);
    return instances;
  };
  /* growth order = what appears first as phases rise */
  if (props) {
    /* biome scenery replaces the builder's own corals and bushes and tiers (they belong to another biome's look) */
  } else if (key === 'reef') {
    branchy(-1.4, 0.5, 1.1, 0xc2384f, 0xffb3bf); brain(0.5, 1.2, 0.72, 0x8a5a1e, 0xf2b866);
    branchy(2.5, -2.7, 1.3, 0x6b2fa8, 0xd7a8ff, { trunks: 2 }); branchy(-3.6, -0.7, 0.95, 0xd3533c, 0xffc9a3, { spread: 0.55 });
    brain(-2.2, -3.8, 0.55, 0x3f6b2a, 0xb8de7a); branchy(0.2, -2.4, 0.8, 0x2a8f86, 0x9ff5df, { trunks: 3, depth: 2, len: 0.55 });
    branchy(3.3, -1.6, 0.9, 0xb4471f, 0xffa35a, { spread: 0.5 }); brain(-0.8, -1.2, 0.45, 0x6a3a7a, 0xe0a8f0);
    growth.splice(1, 0, anemone(1.6, 1.5, 0xd59ae8, 0xffe0ff));
  } else if (key === 'meadow' || (!FRAMES[key] && !water)) {
    bush(-1.4, 0.5, 1.4, 0x3f6b2a, 0xffd23f); bush(0.6, 1.0, 1.0, 0x4a7d3a, 0xf28fb0); bush(2.5, -2.7, 1.6, 0x3a6a30, 0xffffff);
    bush(-3.6, -0.7, 1.2, 0x4a7d3a, 0xb98cff); bush(-2.2, -3.8, 1.3, 0x355f2a, 0xff9a52); bush(0.2, -2.4, 1.1, 0x4a7d3a, 0xfff07a);
    bush(3.3, -1.6, 1.2, 0x3f6b2a, 0xff6a6a); bush(-0.8, -1.2, 0.9, 0x4a7d3a, 0x8fd0ff);
  }
  /* phase tiers: every growth piece gets a phase (0 = phase 1); the reef corals or land bushes take the first ones */
  [0, 0, 0, 1, 1, 2, 2, 3, 3].forEach((phase, i) => {
    const grown = growth[i];
    if (grown) piece(grown).phase = phase;
  });
  const tier = <T extends Three.Object3D>(object: T, phase: number): T => {
    piece(object).phase = phase;
    growth.push(object);
    return object;
  };
  const mesh = (geometry: Three.BufferGeometry, material: Three.Material, x: number, z: number, lift = 0): Three.Mesh => {
    const placed = new THREE.Mesh(geometry, material);
    placed.position.set(x, groundHeight(x, z) + lift, z);
    placed.castShadow = placed.receiveShadow = true;
    world.add(placed);
    return placed;
  };
  const tinted = (geometry: Three.BufferGeometry, root: ColorValue, tip: ColorValue): Three.BufferGeometry => {
    geometry.computeBoundingBox();
    colorByTip(geometry, tipAttribute(geometry, Math.max(0.01, geometry.boundingBox?.max.y ?? 0)), root, tip);
    return geometry;
  };
  const standard = (color: ColorValue, options: Three.MeshStandardMaterialParameters = {}): Three.MeshStandardMaterial => patch(new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...options }));
  /* starfish: flat 5-point star lying on the sand (thin dressing, not solid) */
  const starfish = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue): Three.Mesh => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const radius = i % 2 ? 0.42 : 1;
      if (i) shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 });
    geometry.rotateX(-Math.PI / 2);
    geometry.scale(scale, scale, scale);
    const placed = mesh(tinted(geometry, root, tip), coralMaterial(tip), x, z, 0.01);
    placed.rotation.y = between(0, 6);
    piece(placed).name = 'starfish';
    return placed;
  };
  /* tube sponges: a cluster of open tubes */
  const sponge = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const height = between(0.35, 0.8);
      const radius = between(0.07, 0.12);
      const tube = new THREE.CylinderGeometry(radius, radius * 0.8, height, 14, 4, true);
      tube.translate(between(-0.18, 0.18), height / 2, between(-0.18, 0.18));
      geometries.push(tube.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.scale(scale, scale, scale);
    geometry.computeVertexNormals();
    const material = coralMaterial(tip);
    material.side = THREE.DoubleSide;
    return solid('sponge', mesh(tinted(geometry, root, tip), material, x, z, -0.02));
  };
  /* sea fan: a flattened branching coral */
  const seaFan = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue): Three.Mesh => {
    const fan = branchy(x, z, scale, root, tip, { spread: 1.1, depth: 4, len: 0.42, rad: 0.035, kids: 2 });
    growth.pop();
    fan.scale.z *= 0.12;
    fan.rotation.y = between(-0.5, 0.5);
    piece(fan).name = 'sea fan';
    return fan;
  };
  /* table coral: a wide plate on a short stem */
  const tableCoral = (x: number, z: number, scale: number, root: ColorValue, tip: ColorValue): Three.Mesh => {
    const top = new THREE.CylinderGeometry(0.9, 0.55, 0.12, 28, 2);
    top.translate(0, 0.62, 0);
    const stem = new THREE.CylinderGeometry(0.12, 0.2, 0.6, 10);
    stem.translate(0, 0.3, 0);
    const geometry = geometryUtils.mergeGeometries([top.toNonIndexed(), stem.toNonIndexed()]);
    geometry.scale(scale, scale, scale);
    geometry.computeVertexNormals();
    const table = solid('coral', mesh(tinted(geometry, root, tip), coralMaterial(tip), x, z, -0.03));
    piece(table).name = 'table coral';
    return table;
  };
  /* a small school or swarm: instanced bodies circling an anchor (decor, no collisions, above the rocks) */
  const swarm = (count: number, centerX: number, centerY: number, centerZ: number, radius: number, color: ColorValue, kind?: string, glow?: boolean): Three.InstancedMesh => {
    let geometry: Three.BufferGeometry;
    if (kind === 'butterfly') {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0);
      wing.bezierCurveTo(0.05, 0.02, 0.09, 0.12, 0.03, 0.13);
      wing.bezierCurveTo(-0.01, 0.12, -0.02, 0.06, 0, 0);
      wing.bezierCurveTo(-0.03, -0.02, -0.06, -0.08, -0.02, -0.09);
      wing.lineTo(0, 0);
      const left = new THREE.ShapeGeometry(wing);
      left.rotateX(-Math.PI / 2);
      left.rotateX(-0.5);
      const right = left.clone();
      right.scale(1, 1, -1);
      geometry = geometryUtils.mergeGeometries([left.toNonIndexed(), right.toNonIndexed()]);
      geometry.scale(1.4, 1.4, 1.4);
    } else if (kind === 'firefly') {
      geometry = new THREE.SphereGeometry(0.022, 6, 4);
    } else {
      const body = new THREE.SphereGeometry(0.05, 8, 6);
      body.scale(1.6, 0.8, 0.45);
      const tail = new THREE.ConeGeometry(0.035, 0.06, 4);
      tail.rotateZ(Math.PI / 2);
      tail.translate(-0.1, 0, 0);
      geometry = geometryUtils.mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()]);
    }
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 2.2 : 0 });
    const instances = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    const seeds = Array.from({ length: count }, (): [number, number, number, number] => [between(0, 6.28), between(-0.5, 0.5), between(-0.35, 0.35), between(0.8, 1.2)]);
    const info = piece(instances);
    info.tick = (seconds) => {
      for (let i = 0; i < count; i++) {
        const [phase, radiusOffset, heightOffset, speed] = seeds[i] ?? [0, 0, 0, 1];
        const angle = seconds * 0.35 * speed + phase;
        const orbit = radius + radiusOffset;
        dummy.position.set(centerX + Math.cos(angle) * orbit, centerY + heightOffset + Math.sin(seconds * 1.3 + phase) * 0.1, centerZ + Math.sin(angle) * orbit * 0.6);
        dummy.rotation.set(0, -angle - Math.PI / 2, 0);
        dummy.scale.set(1, 1, kind === 'butterfly' ? 0.15 + 0.85 * Math.abs(Math.sin(seconds * 11 + phase * 3)) : 1);
        if (kind === 'butterfly') dummy.position.y += Math.abs(Math.sin(seconds * 5.5 + phase)) * 0.12;
        dummy.updateMatrix();
        instances.setMatrixAt(i, dummy.matrix);
      }
      instances.instanceMatrix.needsUpdate = true;
    };
    info.tick(0);
    instances.frustumCulled = false;
    world.add(instances);
    ambient.push(instances);
    info.name = kind === 'butterfly' ? 'butterflies' : kind === 'firefly' ? 'fireflies' : glow ? 'glowing fish' : 'fish school';
    return instances;
  };
  /* flowers and mushrooms: small instanced patches for land */
  const flowerPatch = (x: number, z: number, count: number, color: ColorValue, kind: string): Three.InstancedMesh => {
    const mushroom = kind === 'mushroom';
    const head = mushroom ? new THREE.SphereGeometry(0.09, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(0.05, 8, 6);
    head.translate(0, mushroom ? 0.12 : 0.3, 0);
    const stem = new THREE.CylinderGeometry(0.012, 0.016, mushroom ? 0.13 : 0.3, 5);
    stem.translate(0, mushroom ? 0.065 : 0.15, 0);
    const geometry = geometryUtils.mergeGeometries([head.toNonIndexed(), stem.toNonIndexed()]);
    const headColor = new THREE.Color(color);
    const stemColor = new THREE.Color(mushroom ? 0xf3ead8 : 0x4f8a3a);
    const colors: number[] = [];
    const headCount = positionsOf(head.toNonIndexed()).count;
    const stemCount = positionsOf(stem.toNonIndexed()).count;
    for (let i = 0; i < headCount; i++) colors.push(headColor.r, headColor.g, headColor.b);
    for (let i = 0; i < stemCount; i++) colors.push(stemColor.r, stemColor.g, stemColor.b);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const instances = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = nextRandom() * 6.28;
      const radius = Math.sqrt(nextRandom()) * 0.6;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      dummy.position.set(px, groundHeight(px, pz) - 0.01, pz);
      dummy.scale.setScalar(between(0.7, 1.3));
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.castShadow = true;
    world.add(instances);
    piece(instances).name = mushroom ? 'mushrooms' : 'wildflowers';
    return instances;
  };
  /* kelp: tall swaying ribbons in a cluster (kind 'kelp': biomes can let creatures pass through) */
  const kelp = (x: number, z: number, count: number, height: number): Three.InstancedMesh => {
    const geometry = new THREE.PlaneGeometry(0.2, height, 1, 16);
    geometry.translate(0, height / 2, 0);
    const position = positionsOf(geometry);
    for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) * (0.6 + Math.sin(position.getY(i) * 3) * 0.4));
    const material = new THREE.MeshStandardMaterial({ color: 0x8a7a2a, roughness: 0.6, side: THREE.DoubleSide });
    material.defines = { SWAY: '' };
    patch(material, { uSwayAmp: { value: 0.035 } });
    const instances = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const px = x + between(-0.5, 0.5);
      const pz = z + between(-0.5, 0.5);
      dummy.position.set(px, groundHeight(px, pz) - 0.05, pz);
      dummy.rotation.set(0, between(0, 6), 0);
      dummy.scale.set(1, between(0.75, 1.2), 1);
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.castShadow = true;
    world.add(instances);
    return solid('kelp', instances, 0.5);
  };
  /* sea urchin: dark spiky ball on the sand */
  const urchin = (x: number, z: number, scale: number, color: ColorValue): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [new THREE.SphereGeometry(0.12, 10, 8).toNonIndexed()];
    for (let i = 0; i < 40; i++) {
      const spine = new THREE.ConeGeometry(0.008, 0.2, 3);
      spine.translate(0, 0.16, 0);
      spine.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(between(-1, 1), between(-0.2, 1), between(-1, 1)).normalize()));
      geometries.push(spine.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.scale(scale, scale, scale);
    const placed = mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), x, z, 0.08 * scale);
    piece(placed).name = 'sea urchin';
    return placed;
  };
  /* mangrove: a trunk rising out of view with arching prop roots (solid) */
  const mangrove = (x: number, z: number, scale: number): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    const material = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    const trunk = new THREE.CylinderGeometry(0.16, 0.22, 4, 10);
    trunk.translate(x, groundHeight(x, z) + 2.6, z);
    geometries.push(trunk.toNonIndexed());
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * 6.28 + between(-0.3, 0.3);
      const reach = between(0.9, 1.5) * scale;
      const endX = x + Math.cos(angle) * reach;
      const endZ = z + Math.sin(angle) * reach;
      const startY = groundHeight(x, z) + between(1.0, 1.6);
      const curve = new THREE.CatmullRomCurve3([new Vector3(x, startY, z), new Vector3(x + Math.cos(angle) * reach * 0.5, startY + 0.25, z + Math.sin(angle) * reach * 0.5), new Vector3(endX, groundHeight(endX, endZ) - 0.1, endZ)]);
      geometries.push(new THREE.TubeGeometry(curve, 14, 0.06 * scale, 6).toNonIndexed());
    }
    const crown: Three.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const puff = new THREE.SphereGeometry(between(0.7, 1.1), 12, 8);
      puff.scale(1, 0.55, 1);
      puff.translate(x + between(-1, 1), groundHeight(x, z) + between(4.4, 5.0), z + between(-0.8, 0.8));
      crown.push(puff.toNonIndexed());
    }
    const tree = new THREE.Mesh(geometryUtils.mergeGeometries(geometries), material);
    tree.add(new THREE.Mesh(geometryUtils.mergeGeometries(crown), standard(0x4a6a2a, { roughness: 0.8 })));
    tree.castShadow = tree.receiveShadow = true;
    world.add(tree);
    return solid('root', tree, 0.85);
  };
  /* clouds: soft puff clusters for the canopy */
  const cloud = (x: number, y: number, z: number, scale: number): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.SphereGeometry(between(0.35, 0.6), 12, 10);
      puff.translate(between(-0.6, 0.6), between(-0.1, 0.2), between(-0.3, 0.3));
      geometries.push(puff.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.scale(scale, scale * 0.6, scale);
    const puffs = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 }));
    puffs.position.set(x, y, z);
    world.add(puffs);
    return solid('cloud', puffs);
  };
  /* jellies (deep): glowing translucent bells with trailing threads that pulse and bob (decor, no collisions) */
  const jellies = (count: number, centerX: number, centerY: number, centerZ: number, radius: number, color: ColorValue): Three.Group => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.55, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const bell = new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const threads: Three.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * 6.28;
      const thread = new THREE.CylinderGeometry(0.004, 0.004, between(0.4, 0.7), 3);
      thread.translate(Math.cos(angle) * 0.1, -0.25, Math.sin(angle) * 0.1);
      threads.push(thread.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries([bell.toNonIndexed(), ...threads]);
    const seeds: [number, number, number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const jelly = new THREE.Mesh(geometry, material);
      seeds.push([between(0, 6.28), between(-radius, radius), between(-0.6, 0.6), between(-radius * 0.5, radius * 0.5), between(0.7, 1.3)]);
      group.add(jelly);
    }
    const info = piece(group);
    info.tick = (seconds) => {
      group.children.forEach((jelly, i) => {
        const [phase, offsetX, offsetY, offsetZ, speed] = seeds[i] ?? [0, 0, 0, 0, 1];
        const pulse = Math.sin(seconds * 1.6 * speed + phase);
        jelly.position.set(centerX + offsetX + Math.sin(seconds * 0.1 + phase) * 0.3, centerY + offsetY + Math.sin(seconds * 0.4 * speed + phase) * 0.35, centerZ + offsetZ);
        jelly.scale.set(1 + pulse * 0.12, 1 - pulse * 0.15, 1 + pulse * 0.12);
      });
    };
    info.tick(0);
    world.add(group);
    ambient.push(group);
    info.name = 'jellies';
    return group;
  };
  /* giant leaves (jungle): a clump of long drooping paddle leaves on stems (solid, kind 'leaf') */
  const leafGeometry = (length: number, width: number): Three.ShapeGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(width, length * 0.2, width * 0.95, length * 0.75, 0, length);
    shape.bezierCurveTo(-width * 0.95, length * 0.75, -width, length * 0.2, 0, 0);
    const geometry = new THREE.ShapeGeometry(shape, 12);
    const position = positionsOf(geometry);
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      position.setZ(i, (0.45 * y * y) / length + Math.abs(x) * 0.35);
    }
    return geometry;
  };
  const bigLeaves = (x: number, z: number, scale: number, color: ColorValue, count = 6): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const height = between(0.5, 1.3);
      const length = between(0.9, 1.4);
      const angle = (i / count) * 6.28 + between(-0.3, 0.3);
      const elevation = between(0.35, 0.9);
      const stem = new THREE.CylinderGeometry(0.018, 0.028, height, 5);
      stem.translate(0, height / 2, 0);
      stem.rotateY(angle);
      geometries.push(stem.toNonIndexed());
      const leaf = leafGeometry(length, between(0.28, 0.42));
      leaf.rotateX(Math.PI / 2 - elevation);
      leaf.rotateY(angle);
      leaf.translate(0, height, 0);
      geometries.push(leaf.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.scale(scale, scale, scale);
    geometry.computeVertexNormals();
    const clump = mesh(geometry, standard(color, { roughness: 0.35, side: THREE.DoubleSide }), x, z);
    piece(clump).name = 'giant leaves';
    return solid('leaf', clump, 0.7);
  };
  /* buttress tree (jungle): a trunk rising out of frame with blade-like root fins (solid) */
  const buttress = (x: number, z: number, scale: number): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(0.32, 0.42, 9, 14);
    trunk.translate(0, 4.5, 0);
    geometries.push(trunk.toNonIndexed());
    for (let i = 0; i < 6; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(between(1.0, 1.5), 0);
      shape.quadraticCurveTo(0.4, 0.3, 0.2, between(1.5, 2.2));
      shape.lineTo(0, 2.2);
      const fin = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
      fin.translate(0.25, 0, -0.035);
      fin.rotateY((i / 6) * 6.28 + between(-0.2, 0.2));
      geometries.push(fin.toNonIndexed());
    }
    const tree = mesh(geometryUtils.mergeGeometries(geometries).scale(scale, scale, scale), standard(0x6a5d4c, { roughness: 0.95 }), x, z, -0.05);
    piece(tree).name = 'buttress tree';
    return solid('tree', tree, 0.75);
  };
  /* hanging vines (jungle; pass-through): lianas dropping from above, a few with leaves */
  const vines = (x: number, z: number, count: number, color: ColorValue): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const px = x + between(-0.8, 0.8);
      const pz = z + between(-0.5, 0.5);
      const bottom = between(0.6, 2.0);
      const curve = new THREE.CatmullRomCurve3([new Vector3(px, 7, pz), new Vector3(px + between(-0.3, 0.3), (7 + bottom) / 2, pz + between(-0.2, 0.2)), new Vector3(px + between(-0.15, 0.15), bottom, pz)]);
      geometries.push(new THREE.TubeGeometry(curve, 16, 0.02, 4).toNonIndexed());
      for (let k = 0; k < 5; k++) {
        const leaf = leafGeometry(0.14, 0.06);
        const point = curve.getPoint(between(0.5, 1));
        leaf.rotateX(between(0.5, 1.4));
        leaf.rotateY(between(0, 6.28));
        leaf.translate(point.x, point.y, point.z);
        geometries.push(leaf.toNonIndexed());
      }
    }
    const hanging = new THREE.Mesh(geometryUtils.mergeGeometries(geometries), standard(color, { side: THREE.DoubleSide }));
    hanging.castShadow = true;
    world.add(hanging);
    piece(hanging).name = 'vines';
    return solid('vine', hanging, 0.6);
  };
  /* bromeliad: a rosette of stiff strap leaves with a hot center */
  const bromeliad = (x: number, z: number, scale: number, color: ColorValue, hot: ColorValue, y?: number): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const leaf = leafGeometry(between(0.3, 0.45), 0.06);
      leaf.rotateX(Math.PI / 2 - between(0.6, 1.1));
      leaf.rotateY((i / 9) * 6.28);
      geometries.push(leaf.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    geometry.computeBoundingBox();
    const rosette = new THREE.Mesh(tinted(geometry, color, hot), coralMaterial(hot));
    rosette.material.side = THREE.DoubleSide;
    rosette.scale.setScalar(scale);
    rosette.position.set(x, y ?? groundHeight(x, z), z);
    rosette.castShadow = true;
    world.add(rosette);
    piece(rosette).name = 'bromeliads';
    return rosette;
  };
  /* mossy limb (canopy, solid): a thick horizontal branch with hanging moss */
  const limb = (points: [number, number, number][], radius: number, moss: ColorValue): Three.Mesh => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
    const geometries: Three.BufferGeometry[] = [new THREE.TubeGeometry(curve, 40, radius, 10).toNonIndexed()];
    for (let i = 0; i < 26; i++) {
      const point = curve.getPoint(nextRandom());
      const height = between(0.25, 0.8);
      const strand = new THREE.ConeGeometry(between(0.02, 0.05), height, 4);
      strand.rotateX(Math.PI);
      strand.translate(point.x + between(-radius, radius), point.y - radius * 0.6 - height / 2, point.z + between(-radius, radius));
      geometries.push(strand.toNonIndexed());
    }
    const branch = new THREE.Mesh(geometryUtils.mergeGeometries(geometries), standard(moss, { roughness: 0.95 }));
    branch.castShadow = branch.receiveShadow = true;
    world.add(branch);
    piece(branch).name = 'mossy branch';
    for (let i = 1; i < 10; i++) {
      const point = curve.getPoint(i / 10);
      grips.push({ local: new Vector3(point.x, point.y - radius, point.z), object: branch }); /* hang and cling points under the limb */
    }
    return solid('limb', branch, 0.8);
  };
  const orchids = (at: [number, number, number], count: number, color: ColorValue): Three.Group => {
    const group = new THREE.Group();
    const material = standard(color, { roughness: 0.4 });
    for (let i = 0; i < count; i++) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), material);
      bloom.position.set(at[0] + between(-0.4, 0.4), at[1] + between(0, 0.12), at[2] + between(-0.15, 0.15));
      group.add(bloom);
    }
    world.add(group);
    piece(group).name = 'orchids';
    return group;
  };
  /* giant clam (reef): fluted shell with a blue mantle */
  const clam = (x: number, z: number, scale: number): Three.Group => {
    const group = new THREE.Group();
    const shell = new THREE.SphereGeometry(0.3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(1.4, 0.55, 1);
    const mantle = new THREE.TorusGeometry(0.3, 0.07, 8, 24);
    mantle.rotateX(Math.PI / 2);
    mantle.scale(1.25, 1, 0.85);
    mantle.translate(0, 0.15, 0);
    group.add(new THREE.Mesh(shell, standard(0xd8c8a8, { roughness: 0.5 })), new THREE.Mesh(mantle, standard(0x2a8ad0, { roughness: 0.3, emissive: 0x0a3a7a })));
    group.scale.setScalar(scale);
    group.position.set(x, groundHeight(x, z) - 0.02, z);
    world.add(group);
    piece(group).name = 'giant clam';
    return group;
  };
  /* barnacles and mussels (tidepool): a crust of shells around a spot (dressing) */
  const shells = (x: number, z: number, count: number): Three.Mesh => {
    const geometries: Three.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const angle = nextRandom() * 6.28;
      const radius = Math.sqrt(nextRandom()) * 0.55;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      const y = groundHeight(px, pz);
      const shell = i % 3 ? new THREE.ConeGeometry(0.045, 0.06, 6) : new THREE.SphereGeometry(0.05, 8, 6).scale(1.8, 0.6, 0.8);
      if (!(i % 3)) shell.rotateY(between(0, 6));
      shell.translate(px, y + 0.02, pz);
      geometries.push(shell.toNonIndexed());
    }
    const geometry = geometryUtils.mergeGeometries(geometries);
    const colors: number[] = [];
    const pale = new THREE.Color(0xe8e2d4);
    const navy = new THREE.Color(0x1f2a44);
    const vertexCount = positionsOf(geometry).count;
    for (let i = 0; i < vertexCount; i++) {
      const color = Math.floor(i / 36) % 3 ? pale : navy;
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const crust = new THREE.Mesh(geometry, patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));
    crust.castShadow = true;
    world.add(crust);
    piece(crust).name = 'barnacles and mussels';
    return crust;
  };
  /* pencil roots (mangrove): breathing roots poking up through the mud */
  const pencilRoots = (x: number, z: number, count: number): Three.InstancedMesh => {
    const geometry = new THREE.CylinderGeometry(0.012, 0.03, 0.4, 5);
    geometry.translate(0, 0.2, 0);
    const instances = new THREE.InstancedMesh(geometry, standard(0x6a5a42, { roughness: 1 }), count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = nextRandom() * 6.28;
      const radius = Math.sqrt(nextRandom()) * 1.4;
      const px = x + Math.cos(angle) * radius;
      const pz = z + Math.sin(angle) * radius;
      dummy.position.set(px, groundHeight(px, pz) - 0.03, pz);
      dummy.rotation.set(between(-0.15, 0.15), 0, between(-0.15, 0.15));
      dummy.scale.set(1, between(0.5, 1.4), 1);
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.castShadow = true;
    world.add(instances);
    piece(instances).name = 'pencil roots';
    return instances;
  };
  /* leaf litter (mangrove floor, jungle floor): flat fallen leaves */
  const leafLitter = (x: number, z: number, count: number, first: ColorValue, second: ColorValue): Three.InstancedMesh => {
    const geometry = leafGeometry(0.16, 0.06);
    geometry.rotateX(-Math.PI / 2);
    const instances = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), count);
    const dummy = new THREE.Object3D();
    const from = new THREE.Color(first);
    const to = new THREE.Color(second);
    for (let i = 0; i < count; i++) {
      const px = x + between(-1.6, 1.6);
      const pz = z + between(-1.2, 1.2);
      dummy.position.set(px, groundHeight(px, pz) + 0.01, pz);
      dummy.rotation.set(between(-0.1, 0.1), between(0, 6.28), 0);
      dummy.scale.setScalar(between(0.7, 1.4));
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
      instances.setColorAt(i, from.clone().lerp(to, nextRandom()));
    }
    world.add(instances);
    piece(instances).name = 'leaf litter';
    return instances;
  };
  const glassSponge = (x: number, z: number, scale: number): Three.Mesh => {
    const spire = sponge(x, z, scale, 0, 0);
    spire.material = standard(0xcfe8ff, { emissive: 0x4a9ad0, emissiveIntensity: 1.6, transparent: true, opacity: 0.75, roughness: 0.2, side: THREE.DoubleSide });
    piece(spire).name = 'glass sponges';
    return spire;
  };
  const tiers: Record<string, () => void> = {
    reef: () => {
      tier(clam(0.9, 2.3, 0.7), 0); tier(anemone(-2.4, 2.0, 0xff8ab0, 0xffe0f0, 70), 0);
      tier(sponge(-4.2, -1.9, 1, 0x9b4f1d, 0xffa64a), 1); tier(brain(2.9, 1.6, 0.35, 0x2a6a8a, 0x8ff0ff), 1); tier(swarm(6, 0.5, 2.6, -1.5, 2.2, 0x3aa6ff), 1);
      tier(seaFan(-1.9, -4.6, 1.2, 0xa8326b, 0xff8fc0), 2); tier(seaFan(4.4, -2.9, 1.0, 0xc4802a, 0xffd27a), 2); tier(sponge(2.0, -4.1, 0.9, 0x5a2f8a, 0xc79bff), 2);
      tier(tableCoral(-3.2, 1.6, 0.8, 0x6b8a3a, 0xd6f08a), 3); tier(swarm(14, -0.8, 3.1, -1.8, 2.8, 0xffd23f), 3); tier(clam(-0.2, 2.6, 0.9), 3);
      tier(tableCoral(3.4, 2.0, 0.65, 0x2a7a8f, 0x9ff0f5), 4); tier(seaFan(-5.2, -3.4, 1.4, 0x7a2fb0, 0xe0a8ff), 4); tier(sponge(4.8, 1.8, 0.8, 0xb03a3a, 0xff9a8a), 4); tier(swarm(20, 1.2, 3.5, -2.4, 3.3, 0xff7a2a), 4);
    },
    meadow: () => {
      tier(flowerPatch(1.0, 2.2, 18, 0xffd23f, 'flower'), 0); tier(flowerPatch(-2.6, 1.9, 14, 0xf28fb0, 'flower'), 1); tier(flowerPatch(2.8, 1.2, 10, 0xc0462a, 'mushroom'), 1);
      tier(swarm(5, 0, 2.2, -1, 2.4, 0xffb13d, 'butterfly'), 2); tier(flowerPatch(-4.0, -1.8, 22, 0xb98cff, 'flower'), 2);
      tier(flowerPatch(4.2, -2.2, 12, 0xe8e0d0, 'mushroom'), 3); tier(swarm(9, -1, 2.6, -1.5, 3, 0x8fd0ff, 'butterfly'), 3); tier(flowerPatch(0.2, 2.8, 26, 0xffffff, 'flower'), 3);
      tier(bush(-5.0, -3.5, 2.0, 0x2f5a24, 0xff9a52), 4); tier(flowerPatch(3.4, 2.4, 30, 0xff6a6a, 'flower'), 4); tier(swarm(12, 1, 3, -2, 3.4, 0xffe066, 'butterfly'), 4);
    },
    kelp: () => {
      /* vertical ribbons over a cold urchin barren; no corals, no stars */
      tier(kelp(-2.0, -1.2, 9, 4.2), 0); tier(kelp(2.6, -2.2, 8, 4.6), 0); tier(urchin(0.2, 2.2, 1, 0x3a1f5a), 0); tier(urchin(0.9, 1.7, 0.7, 0x5a1f3a), 0);
      tier(kelp(-4.2, -3.2, 10, 5), 1); tier(urchin(-1.4, 2.4, 0.8, 0x5a1f3a), 1); tier(swarm(6, 0, 2.4, -1.4, 2.2, 0xff8a2a), 1);
      tier(kelp(4.4, -0.4, 8, 4.4), 2); tier(kelp(0.4, -4.4, 10, 5.2), 2); tier(urchin(-2.6, 1.4, 1.0, 0x2a1f4a), 2);
      tier(kelp(-5.4, 0.8, 9, 4.8), 3); tier(swarm(12, -0.8, 3.0, -1.8, 2.8, 0xd0d8e0), 3); tier(urchin(3.4, 1.7, 1.1, 0x2a1f4a), 3);
      tier(kelp(5.6, -3.6, 12, 5.6), 4); tier(kelp(-1.0, -6.0, 12, 5.8), 4); tier(kelp(2.0, 0.6, 6, 4.0), 4); tier(swarm(18, 1, 3.6, -2.4, 3.3, 0xffb040), 4);
    },
    tidepool: () => {
      /* granite rims crusted with shells; stars and green anemones own this pool */
      ([[-1.0, 1.6, 0.35, 0.6], [1.2, 2.3, 0.3, 0.55], [-3.6, 1.0, 0.45, 0.6], [2.8, -0.4, 0.4, 0.6]] as const).forEach(([x, z, size, heightRatio]) => {
        rock(x, z, size, heightRatio);
      });
      tier(anemone(0.2, 2.0, 0x3ac06a, 0xc0ffd0, 90), 0); tier(starfish(-1.8, 2.4, 0.19, 0x8a2ad0, 0xd0a0ff), 0); tier(shells(-1.2, 1.2, 40), 0);
      tier(starfish(1.8, 1.6, 0.17, 0xe08a2a, 0xffd0a0), 1); tier(shells(2.4, 1.0, 50), 1); tier(swarm(5, 0, 1.6, 0.4, 1.4, 0x6ab0ff), 1);
      tier(anemone(-2.6, 0.2, 0x3ac06a, 0xc0ffd0, 70), 2); tier(starfish(-0.6, 2.8, 0.22, 0xe0407a, 0xffa0c0), 2); tier(shells(-3.4, 1.6, 60), 2);
      tier(anemone(3.0, 1.0, 0x2a9a5a, 0xd0ffd0, 60), 3); tier(starfish(0.9, 2.6, 0.17, 0x8a2ad0, 0xd0a0ff), 3); tier(swarm(10, -0.5, 2, -0.5, 2, 0xffe040), 3);
      tier(anemone(-0.6, -2.4, 0x3ac06a, 0xe0ffe0, 100), 4); tier(starfish(3.2, 2.4, 0.24, 0xe08a2a, 0xffd0a0), 4); tier(shells(0.4, 2.9, 60), 4); tier(starfish(-2.4, 2.9, 0.29, 0x8a2ad0, 0xd0a0ff), 4);
    },
    mangrove: () => {
      /* arching roots over brown mud; pencil roots and fallen leaves, silver schools */
      tier(mangrove(-2.6, -1.6, 1), 0); tier(pencilRoots(0.4, 1.4, 40), 0); tier(leafLitter(0, 1.6, 40, 0x8a7a3a, 0x5a4a2a), 0);
      tier(mangrove(2.8, -2.8, 1.2), 1); tier(swarm(8, 0.6, 1.8, 0.2, 1.8, 0xc0c8a0), 1); tier(pencilRoots(-2.4, 1.0, 50), 1);
      tier(leafLitter(2.2, 1.8, 50, 0x9a8a3a, 0x6a3a1a), 2); tier(swarm(12, -0.6, 2.4, -1.4, 2.6, 0xe0e0c0), 2); tier(pencilRoots(2.8, 0.2, 40), 2);
      tier(mangrove(-5.2, 1.0, 0.9), 3); tier(pencilRoots(-1.0, 2.6, 50), 3);
      tier(mangrove(4.8, 0.6, 1.0), 4); tier(swarm(20, 0.6, 2.8, -1.8, 3.2, 0xffd060), 4); tier(mangrove(0.6, -5.2, 1.3), 4);
    },
    deep: () => {
      /* black silt, glass spires, drifting jellies, points of light */
      tier(swarm(5, 0, 2.6, -1.4, 2.2, 0x6af0ff, 'fish', true), 0); tier(jellies(2, -1.6, 2.4, -1.0, 0.6, 0xff6af0), 0);
      tier(glassSponge(-2.6, 0.6, 1.1), 1); tier(jellies(3, 1.8, 2.8, -2.0, 1.0, 0x6af0ff), 1);
      tier(seaFan(-1.9, -4.6, 1.4, 0x6a1f2a, 0xff5a6a), 2); tier(swarm(10, 1, 3, -2, 3, 0x8affb0, 'fish', true), 2); tier(glassSponge(2.6, -3.6, 1.6), 2);
      tier(jellies(4, -0.6, 3.2, -2.4, 1.6, 0xb08aff), 3); tier(swarm(14, -0.8, 3.4, -1.8, 3.2, 0x6af0ff, 'fish', true), 3);
      tier(glassSponge(2.2, 1.4, 0.9), 4); tier(jellies(6, 0.5, 2.6, -1.5, 2.6, 0xffd06a), 4); tier(swarm(20, 1, 2.8, -2.4, 3.4, 0xffd06a, 'fish', true), 4);
    },
    canopy: () => {
      /* no floor to speak of: thick mossy limbs, orchids, mist and clouds */
      tier(limb([[-7, 1.4, -2.5], [-3, 1.7, -1.6], [0.5, 1.5, -2.2], [3, 1.9, -3.4]], 0.28, 0x5a5a2a), 0); tier(cloud(-3, 0.6, -5, 1.4), 0); tier(swarm(4, 0, 2.6, -1, 2.4, 0x6affc0, 'butterfly'), 0);
      tier(bromeliad(-3, 0, 1.62, 0x4f8a3a, 0xe04a6a, 1.95), 1); tier(orchids([0.5, 1.75, -2.2], 6, 0xf0e0ff), 1); tier(cloud(3.2, 0.4, -4.2, 1.6), 1);
      tier(limb([[7, 2.6, -1.5], [3.6, 2.9, -0.8], [1.2, 3.3, -1.8]], 0.22, 0x4a5a24), 2); tier(cloud(-0.5, 0.2, 0.6, 1.2), 2); tier(swarm(6, -1, 3, -1.5, 3, 0x8fd0ff, 'butterfly'), 2);
      tier(orchids([3.6, 3.1, -0.8], 7, 0xff7ab0), 3); tier(bromeliad(1.4, 0, 1.44, 0x3f7a3a, 0xff9a3a, 3.45), 3); tier(cloud(4.8, 0.8, -1, 1.2), 3);
      tier(limb([[-6, 3.6, -4], [-2.5, 3.2, -3.4], [0.5, 3.8, -4.6]], 0.34, 0x5a5a2a), 4); tier(swarm(10, 1, 3.4, -2, 3.4, 0x2affa0, 'butterfly'), 4); tier(orchids([-2.5, 3.45, -3.4], 8, 0xffffff), 4);
    },
    jungle: () => {
      /* huge layered leaves, buttress trunks, hanging lianas, red bromeliads, fireflies in the shade */
      tier(bigLeaves(-1.6, 1.2, 0.9, 0x2f7a2a), 0); tier(leafLitter(0.4, 1.8, 60, 0x8a5a2a, 0x3a2a1a), 0); tier(bromeliad(1.4, 1.9, 1.71, 0x2f6a2a, 0xff2a2a), 0);
      tier(buttress(-3.2, -3.0, 1), 1); tier(bigLeaves(2.6, 0.4, 1.0, 0x3a8a2a), 1); tier(swarm(10, 0, 1.6, 0, 2.4, 0xfff06a, 'firefly', true), 1);
      tier(vines(-1.2, -2.0, 5, 0x3a5a22), 2); tier(bigLeaves(-4.2, -0.4, 1.2, 0x1f5a22), 2); tier(bromeliad(-0.6, 2.4, 1.33, 0x2f6a2a, 0xff8a1a), 2);
      tier(buttress(3.8, -3.8, 1.2), 3); tier(vines(2.4, -1.4, 6, 0x2f4a1e), 3); tier(swarm(5, 0.5, 2.4, -1, 2.2, 0x2a7aff, 'butterfly'), 3);
      tier(bigLeaves(4.4, 1.6, 1.3, 0x2f7a2a, 8), 4); tier(bigLeaves(-3.6, 2.0, 1.1, 0x4a9a2a), 4); tier(swarm(26, 0, 2.0, -0.6, 3.2, 0xfff06a, 'firefly', true), 4);
    },
  };
  /* Dress a prop clone for the scene and read how it rests. A glb's node extras (models/shared/blender/lib.py) carry lb_sit
     (upright | follow | drape, decided per spec) and the shader-sway settings; meshes with _sway_w sway on the GPU.
     timeUniform: the clock it sways by (the shared clock, or the QA capture's own). */
  const dress = (root: Three.Object3D, timeUniform?: { value: number }): string => {
    let sit = 'upright';
    root.traverse((object) => {
      const sitExtra = nodeExtra(object, 'lb_sit');
      if (typeof sitExtra === 'string' && sitExtra) sit = sitExtra;
      if (!isMesh(object)) return;
      object.castShadow = object.receiveShadow = true;
      object.frustumCulled = false;
      const material = firstMaterial(object).clone();
      const amplitude = nodeExtra(object, 'lb_sway_amp');
      if (object.geometry.attributes['_sway_w'] && typeof amplitude === 'number' && amplitude) {
        material.defines = { ...(material.defines ?? {}), PROP_SWAY: '' };
        const period = nodeExtra(object, 'lb_sway_period');
        const lift = nodeExtra(object, 'lb_sway_lift');
        /* amp is metres but the shader moves local (pre-node-scale) units; a quantized glb scales its mesh node down */
        object.material = patch(material, {
          uPSway: { value: new THREE.Vector4(amplitude / (object.scale.x || 1), (typeof period === 'number' && period) || 6, (typeof lift === 'number' && lift) || 0, between(0, 6.283)) },
          uSwayT: timeUniform ?? shared.uTime,
        });
      } else object.material = patch(material);
    });
    return sit;
  };
  /* drape: after tilting to the slope, move every point by how far the real sand sits above or below that slope there */
  const conform = (holder: Three.Object3D, root: Three.Object3D, at: Three.Vector3, normal: Three.Vector3): void => {
    holder.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!isMesh(object) || isSkinnedMesh(object)) return;
      const geometry = object.geometry.clone();
      const original = positionsOf(geometry);
      const inverse = object.matrixWorld.clone().invert();
      const vertex = new Vector3();
      /* float copy: a quantized glb stores normalized ints, which would clamp vertices pushed past the original box */
      const position = new THREE.Float32BufferAttribute(original.count * 3, 3);
      for (let i = 0; i < original.count; i++) position.setXYZ(i, original.getX(i), original.getY(i), original.getZ(i));
      geometry.setAttribute('position', position);
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
        const plane = at.y - (normal.x * (vertex.x - at.x) + normal.z * (vertex.z - at.z)) / normal.y;
        vertex.y += groundHeight(vertex.x, vertex.z) - 0.01 - plane;
        vertex.applyMatrix4(inverse);
        position.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
      position.needsUpdate = true;
      object.geometry = geometry;
    });
  };
  /* seat a dressed copy at `at` by its sit mode; `surfaceNormal` = the surface when not on sand (a rock face) */
  const seat = (holder: Three.Object3D, root: Three.Object3D, sit: string, at: Three.Vector3, surfaceNormal?: Three.Vector3 | null): void => {
    holder.position.copy(at);
    if (sit === 'upright') return;
    const normal = surfaceNormal ?? groundNormal(at.x, at.z);
    holder.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal);
    if (sit === 'drape' && !surfaceNormal) conform(holder, root, at, normal);
  };
  /* biome scenery: each roster prop placed `count` times by `spread` (seeded), on the phase(s) the biome gives it */
  const placeProps = (loaded: LoadedProps): void => {
    (biome.scenery ?? []).forEach((item) => {
      const prop = loaded[item.id];
      if (!prop) return;
      const count = item.count || 1;
      const [smallest, largest] = item.scale || [0.85, 1.15];
      const phases: [number, number] = item.phases || [item.phase ?? 0, item.phase ?? 0];
      const clusterCenter = [between(-4.5, 4.5), between(-3.5, 1.5)] as const;
      const clip = prop.gltf.animations.find((animation) => animation.name === 'sway');
      const passThrough = item.pass_through ?? prop.entry.pass_through;
      if (passThrough) state.passKinds.push(item.id);
      for (let k = 0; k < count; k++) {
        let x: number;
        let z: number;
        let tries = 0;
        do {
          if (item.spread === 'cluster') {
            const angle = between(0, 6.283);
            const radius = Math.sqrt(nextRandom()) * 1.1;
            x = clusterCenter[0] + Math.cos(angle) * radius;
            z = clusterCenter[1] + Math.sin(angle) * radius;
          } else if (item.spread === 'edge') {
            x = (k % 2 ? -1 : 1) * between(4.2, 6.8);
            z = between(-5, 2);
          } else if (item.spread === 'back') {
            x = between(-6, 6);
            z = between(-6.5, -3.8);
          } else {
            x = between(-6, 6);
            z = between(-4.5, 3);
          }
        } while (item.spread !== 'back' && Math.hypot(x, z + 1) < 1.8 && ++tries < 12);
        const root = ctx.kit.skeletonUtils.clone(prop.gltf.scene);
        const holder = new THREE.Group();
        holder.add(root);
        root.scale.setScalar(DISPLAY_SCALE * between(smallest, largest));
        root.rotation.y = between(0, 6.283);
        const sit = dress(root);
        if (clip) {
          const mixer = new THREE.AnimationMixer(root);
          const action = mixer.clipAction(clip);
          action.play();
          action.time = between(0, clip.duration);
          action.timeScale = between(0.85, 1.1);
          state.propMixers.push(mixer);
        }
        seat(holder, root, sit, new Vector3(x, groundHeight(x, z) - 0.01, z));
        const info = piece(holder);
        info.prop = true;
        info.name = prop.entry.name || item.id.replace(/_/g, ' ');
        if (item.landmark && k === count - 1) info.landmark = true;
        world.add(holder);
        solid(item.id, holder, 0.8);
        tier(holder, placementPhase(phases, k, count));
        root.traverse((object) => {
          if (/^perch/i.test(object.name)) grips.push({ node: object, object: holder }); /* scenery grip nodes */
        });
      }
    });
  };
  if (props) placeProps(props);
  else (tiers[key] ?? (water ? tiers['reef'] : tiers['meadow']))?.();
  /* daily growth: each piece unlocks at its own share of the biome's points (0..1). Pieces of phase k spread across that phase;
     the last one of each phase is the landmark, a bigger piece that lands as the phase completes. */
  {
    const byPhase = new Map<number, Three.Object3D[]>();
    growth.forEach((grown) => {
      const phase = piece(grown).phase ?? 0;
      const list = byPhase.get(phase) ?? [];
      if (!byPhase.has(phase)) byPhase.set(phase, list);
      list.push(grown);
    });
    /* landmark = a swarm if the phase has one (a school arriving reads as an event), else its biggest piece */
    const size = (object: Three.Object3D): number => {
      if (isInstancedMesh(object)) return 0;
      const box = new THREE.Box3().setFromObject(object).getSize(new Vector3());
      return box.x * box.y * box.z;
    };
    byPhase.forEach((list) => {
      const school = list.find((grown) => ambient.includes(grown));
      const landmark = list.find((grown) => piece(grown).landmark) ?? school ?? list.slice().sort((a, b) => size(b) - size(a))[0];
      if (!landmark) return;
      list.splice(list.indexOf(landmark), 1);
      list.push(landmark);
    });
    /* integer-keyed entries in ascending order, as the original object iteration had them */
    [...byPhase.entries()].sort((a, b) => a[0] - b[0]).forEach(([phase, list]) => {
      list.forEach((grown, i) => {
        const info = piece(grown);
        const last = i === list.length - 1 && list.length > 1;
        info.unlockAt = unlockShare(phase, i, list.length);
        if (last) {
          info.landmark = true;
          if (!isInstancedMesh(grown)) grown.scale.multiplyScalar(1.35);
        }
        info.base = grown.scale.clone();
        grown.visible = false;
      });
    });
  }
  /* ground cover from the frame: seagrass, red turf, surfgrass, meadow grass, moss, ferns (none on mud and deep silt) */
  if (frame.cover) {
    const cover = frame.cover;
    const geometry = new THREE.PlaneGeometry(cover.width, cover.height, 1, 6);
    geometry.translate(0, cover.height / 2, 0);
    const position = positionsOf(geometry);
    for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) * (1 - (position.getY(i) / cover.height) * 0.75));
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
    material.defines = { SWAY: '' };
    patch(material, { uSwayAmp: { value: cover.sway } });
    const total = cover.count;
    const instances = new THREE.InstancedMesh(geometry, material, total);
    const dummy = new THREE.Object3D();
    const lightness = cover.lightness || [0.3, 0.45];
    let placed = 0;
    while (placed < total) {
      const clumpX = between(-7, 7);
      const clumpZ = between(-2, 4);
      if (Math.hypot(clumpX, clumpZ + 1) < 2.6) continue;
      for (let j = 0; j < 10 && placed < total; j++, placed++) {
        const x = clumpX + between(-0.4, 0.4);
        const z = clumpZ + between(-0.4, 0.4);
        dummy.position.set(x, groundHeight(x, z) - 0.02, z);
        dummy.rotation.set(between(-0.3, 0.3), between(0, 3), between(-0.3, 0.3));
        dummy.scale.set(1, between(0.6, 1.5), 1);
        dummy.updateMatrix();
        instances.setMatrixAt(placed, dummy.matrix);
        instances.setColorAt(placed, new THREE.Color().setHSL(between(cover.hue[0], cover.hue[1]), between(0.35, 0.6), between(lightness[0], lightness[1])));
      }
    }
    instances.receiveShadow = true;
    world.add(instances);
  }
  /* blight from neglected tasks: the biome's own prop (biomes.json neglect.blight, e.g. drift algae, weeds, mold); copies are
     placed now and shown as blight rises. No prop yet: generic green tufts on rocks. */
  const neglect = biome.neglect;
  const blightProp = neglect?.blight && props ? props[neglect.blight] : undefined;
  const clearOf = (x: number, z: number): boolean => Math.hypot(x, z + 1) >= 1.8 && (!inspectId || Math.hypot(x - INSPECT_AT[0], z - INSPECT_AT[1]) >= 1.6);
  state.neglectColors = neglect?.murk != null && neglect.murk !== '' && neglect.murk !== 0
    ? { shallow: new THREE.Color(neglect.murk), deep: new THREE.Color(neglect.murk).multiplyScalar(0.32), tint: new THREE.Color(neglect.murk).lerp(new THREE.Color(0xffffff), 0.55) }
    : null;
  const rockHit = (target: Three.Mesh, angle: number, distance: number, ray: Three.Raycaster): { point: Three.Vector3; normal: Three.Vector3 } => {
    target.updateMatrixWorld();
    ray.set(new Vector3(target.position.x + Math.cos(angle) * distance * target.scale.x, target.position.y + 5, target.position.z + Math.sin(angle) * distance * target.scale.z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(target)[0];
    return hit
      ? { point: hit.point, normal: hit.face ? hit.face.normal.clone().transformDirection(target.matrixWorld) : new Vector3(0, 1, 0) }
      : { point: target.position.clone(), normal: new Vector3(0, 1, 0) };
  };
  /* QA capture: one unscaled copy of the inspected prop on the open sand in front of the camera */
  state.inspected = null;
  const inspectedProp = inspectId && props ? props[inspectId] : undefined;
  if (inspectedProp) {
    const root = ctx.kit.skeletonUtils.clone(inspectedProp.gltf.scene);
    const holder = new THREE.Group();
    holder.add(root);
    root.scale.setScalar(DISPLAY_SCALE);
    const timeUniform = { value: 0 };
    const sit = dress(root, timeUniform);
    const [x, z] = INSPECT_AT;
    seat(holder, root, sit, new Vector3(x, groundHeight(x, z) - 0.01, z));
    world.add(holder);
    const clip = inspectedProp.gltf.animations.find((animation) => animation.name === 'sway');
    const mixer = clip ? new THREE.AnimationMixer(root) : null;
    if (mixer && clip) mixer.clipAction(clip).play();
    let period = 0;
    root.traverse((object) => {
      const extra = nodeExtra(object, 'lb_sway_period');
      if (typeof extra === 'number' && extra) period = extra;
    });
    const box = new THREE.Box3().setFromObject(holder);
    const boxSize = box.getSize(new Vector3());
    state.inspected = { holder, mixer, timeUniform, duration: clip ? clip.duration : period, radius: Math.max(boxSize.x, boxSize.y, boxSize.z) / 2, pose: null };
  }
  if (blightProp && neglect) {
    const total = neglect.count || 30;
    const [smallest, largest] = neglect.scale || [0.8, 1.3];
    const ray = new THREE.Raycaster();
    const clip = blightProp.gltf.animations.find((animation) => animation.name === 'sway');
    for (let k = 0; k < total; k++) {
      let position: Three.Vector3;
      let normal: Three.Vector3 | null = null;
      const target = rocks[k % Math.max(1, rocks.length)];
      if (neglect.grows_on === 'rocks' && rocks.length && target) {
        const hit = rockHit(target, nextRandom() * 6.283, nextRandom() * 0.7, ray);
        position = hit.point;
        normal = hit.normal;
      } else {
        let x: number;
        let z: number;
        let tries = 0;
        do {
          x = between(-6, 6);
          z = between(-4.5, 3);
        } while (!clearOf(x, z) && ++tries < 24);
        position = new Vector3(x, groundHeight(x, z) - 0.01, z);
      }
      const root = ctx.kit.skeletonUtils.clone(blightProp.gltf.scene);
      const holder = new THREE.Group();
      holder.add(root);
      root.scale.setScalar(DISPLAY_SCALE * between(smallest, largest));
      root.rotation.y = between(0, 6.283);
      const sit = dress(root);
      if (clip) {
        const mixer = new THREE.AnimationMixer(root);
        const action = mixer.clipAction(clip);
        action.play();
        action.time = between(0, clip.duration);
        state.propMixers.push(mixer);
      }
      seat(holder, root, sit, position, normal);
      piece(holder).base = holder.scale.clone();
      holder.visible = false;
      world.add(holder);
      state.blightCopies.push(holder);
    }
  } else {
    const geometry = new THREE.ConeGeometry(0.025, 0.3, 4);
    geometry.translate(0, 0.15, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0x5d7228, roughness: 1 });
    material.defines = { SWAY: '' };
    patch(material, { uSwayAmp: { value: 0.6 } });
    const total = 270;
    const instances = new THREE.InstancedMesh(geometry, material, total);
    const dummy = new THREE.Object3D();
    const ray = new THREE.Raycaster();
    for (let i = 0; i < total; i++) {
      const target = rocks[i % Math.max(1, rocks.length)] ?? sand;
      dummy.position.copy(rockHit(target, nextRandom() * 6.283, nextRandom() * 0.7, ray).point);
      dummy.rotation.set(between(-0.3, 0.3), between(0, 3), between(-0.3, 0.3));
      dummy.scale.setScalar(between(0.6, 1.3));
      dummy.updateMatrix();
      instances.setMatrixAt(i, dummy.matrix);
    }
    instances.count = 0;
    world.add(instances);
    state.blightInstances = instances;
  }
  /* light shafts (water, or a frame that asks for them) */
  ctx.rayUniforms.uRayCol.value.set(frame.rays || 0xdffbff);
  if (water || frame.rays) {
    for (let i = 0; i < 8; i++) {
      const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: shared.uTime, uRay: ctx.rayUniforms.uRay, uRayCol: ctx.rayUniforms.uRayCol, uSeed: { value: between(0, 10) } },
        vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
        fragmentShader: `uniform float uTime, uRay, uSeed; uniform vec3 uRayCol; varying vec2 vUv; varying vec3 vW;
            void main(){ float e = smoothstep(0., .5, vUv.x) * smoothstep(1., .5, vUv.x); e *= e; float fall = pow(vUv.y, 1.8); float flick = .55 + .45 * sin(uTime * .7 + uSeed * 2.1);
              float streak = .65 + .35 * sin(vUv.x * 23. + uSeed * 5. + uTime * .25); float near = smoothstep(1.5, 5., length(vW - cameraPosition)); gl_FragColor = vec4(uRayCol * e * fall * flick * streak * near * uRay, 1.); }`,
      });
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(between(0.7, 1.8), 16), material);
      shaft.position.set(between(-7, 7), 6, between(-7, 1));
      piece(shaft).slant = between(-0.32, -0.14);
      world.add(shaft);
      state.rays.push(shaft);
    }
  }
  /* particles: marine snow (water) or pollen (land, air) */
  {
    const total = 700;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(total * 3);
    const sizes = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      positions[i * 3] = between(-10, 10);
      positions[i * 3 + 1] = between(0, 8);
      positions[i * 3 + 2] = between(-10, 7);
      sizes[i] = nextRandom();
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aS', new THREE.BufferAttribute(sizes, 1));
    const uniforms = { uTime: shared.uTime, uPx: { value: 60 }, uOp: { value: 0.5 }, uCol: { value: new THREE.Color(0xe8fbff) } };
    state.snowUniforms = uniforms;
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
      vertexShader: `uniform float uTime, uPx; attribute float aS; varying float vD; varying float vA;
            void main(){ vec3 p = position; p.y = mod(p.y - uTime * (.03 + aS * .05), 8.); p.x += sin(uTime * .2 + aS * 30.) * .15; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; vD = -mv.z; gl_PointSize = (1. + aS * 2.5) * uPx / vD; vA = .35 + .65 * aS; }`,
      fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vD; varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uCol, smoothstep(.5, .05, d) * uOp * vA * exp(-vD * .07) * smoothstep(.4, 1.6, vD)); }`,
    });
    world.add(new THREE.Points(geometry, material));
  }
  state.envDirty = true;
}
