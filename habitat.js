/* lifeboard Labs: Habitat card. A 3D scene of the current reef biome, driven by game state (garden.js deriveGame).
   Loaded only when Labs is on; three.js (r170, jsdelivr, via the importmap in index.html) loads only once the
   card scrolls into view.

   Runtime hooks
   - Habitat.mount(slot)     move the persistent card into a placeholder after each app render
   - Habitat.setState(game)  game state from LBGarden.deriveGame
   - Habitat.feed(n)         drop n food particles; nearby creatures steer in, idle -> feed -> idle, mouth aimed at food
   - Habitat.stats           { fps, bloom, pixelRatio, creatures, loadMs }
   Test hook (pipeline gate G6): force a roster creature into the scene, in its own biome:
     ?visitor=<id>   #visitor=<id>   #labs-visitor-<id>   (the artifact host passes only plain #name hashes,
     so use #labs-visitor-<id> there; any of these also turns Labs on for that page load)
   Models: MODEL_BASES is tried in order for roster.json / biomes.json (roster v1 `creatures[]` or v2 `models[]`
   with kind creature|plant); roster paths are relative to that base.
   Each roster entry's `js` sets window.LB_CREATURES[id] = "<base64 glb>"; glTF +X is the head, meters,
   animations `idle` (loop) + `feed`, empty `mouth`. */
(function (G) {
  const MODEL_BASES = ['models/']; /* the one place the model path lives; add 'creatures/' back for pre-rename checkouts */
  const DISPLAY_SCALE = 5; /* scene units per meter: a 0.22 m clownfish is ~1.1 units in a ~14-unit reef */
  const PHONE = matchMedia('(max-width:699px), (pointer:coarse)').matches;
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- test hook ---------- */
  function visitorOverride(href) {
    const u = new URL(href || location.href);
    const q = u.searchParams.get('visitor');
    if (q) return q;
    const h = decodeURIComponent(u.hash.slice(1));
    let m = h.match(/(?:^|[&/])visitor=([\w-]+)/) || h.match(/^labs-visitor-([\w-]+)$/);
    return m ? m[1] : null;
  }

  /* ---------- card DOM (persistent across app renders) ---------- */
  const card = document.createElement('section');
  card.className = 'sec labs-habitat';
  card.setAttribute('aria-label', 'Habitat');
  card.innerHTML = `<div class="sec-h"><h3 class="sec-t">Habitat <span class="ct num">Labs</span></h3><span class="hab-ph" data-h="phase"></span></div>
    <div class="hab"><canvas aria-hidden="true"></canvas><div class="hab-chips"><span class="hab-chip" data-h="biome"></span><span class="hab-chip" data-h="visitor" hidden></span></div>
    <div class="hab-info"><div class="hab-bar"><div data-h="bar"></div></div><p data-h="line"></p></div><p class="hab-msg" data-h="msg">Habitat loads when you scroll here.</p></div>`;
  const $ = (k) => card.querySelector(`[data-h="${k}"]`);
  const canvas = card.querySelector('canvas');
  let game = null, biomes = null, roster = null, base = null, forced = visitorOverride(G.LB_LABS_HREF);
  const stats = { fps: null, bloom: true, pixelRatio: null, creatures: 0, loadMs: null, base: null };
  let engine = null, starting = false, inView = false;

  function biomeOf(id) { const L = (biomes && biomes.biomes) || [{ id: 0, name: 'Coral shallows', medium: 'water' }]; return L.find((b) => b.id === id) || L[((id % L.length) + L.length) % L.length]; }
  function sceneBiomeId() {
    const fc = forced && roster && roster.creatures.find((c) => c.id === forced);
    if (fc && fc.biome != null) return fc.biome;
    const n = (biomes && biomes.biomes.length) || 1;
    return game ? game.reef.biome % n : 0;
  }
  function paintInfo() {
    if (!game) return;
    const r = game.reef, b = biomeOf(sceneBiomeId());
    $('biome').textContent = b.name;
    $('phase').textContent = `Phase ${Math.min(r.phase + 1, r.phases)} of ${r.phases}${r.bleached ? ' · bleached' : ''}`;
    const span = (r.next ?? r.pts) - r.prev, f = span > 0 ? (r.pts - r.prev) / span : 1;
    $('bar').style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
    const t = game.todayTide, bits = [`${Math.round(r.pts)} / ${r.next ?? '–'} tide points`];
    bits.push(t ? `today ${Math.round(t.pct * 100)}%${t.full ? ', full tide' : ''}` : 'today neutral');
    if (game.overdue) bits.push(`${game.overdue} overdue clouding the water`);
    $('line').textContent = bits.join(' · ');
    const v = $('visitor'); const who = forced || (engine && engine.visitorName);
    v.hidden = !who; if (who) v.textContent = forced ? `Visitor: ${forced} (test)` : `Visitor: ${who}`;
  }

  /* ---------- data: roster + biomes (models/ first, then creatures/) ---------- */
  async function loadManifests() {
    for (const b of MODEL_BASES) {
      try {
        const r = await fetch(b + 'roster.json', { cache: 'no-cache' });
        if (!r.ok) continue;
        const raw = await r.json(); base = b; stats.base = b;
        /* v1: { creatures: [...] }; v2 (models/): { models: [...] } with kind creature|plant */
        const all = Array.isArray(raw) ? raw : raw.models || raw.creatures || []; /* v2 {models}, v1 {creatures}, or a flat array */
        roster = { creatures: all.filter((m) => !m.kind || m.kind === 'creature'), plants: all.filter((m) => m.kind === 'plant') };
        try { const bj = await fetch(b + 'biomes.json', { cache: 'no-cache' }); if (bj.ok) biomes = await bj.json(); } catch (e) { /* default biome */ }
        return;
      } catch (e) { /* try the next base */ }
    }
    roster = { creatures: [] };
  }
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(s); }); }

  /* ---------- engine ---------- */
  async function start() {
    if (engine || starting) return;
    starting = true; const t0 = performance.now();
    $('msg').textContent = 'Loading habitat…';
    try {
      const [THREE, EC, RP, UB, OP, SP, GL, BU, SU] = await Promise.all([
        import('three'), import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
        import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/OutputPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
        import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/BufferGeometryUtils.js'), import('three/addons/utils/SkeletonUtils.js'), loadManifests()]);
      engine = buildEngine({ THREE, EffectComposer: EC.EffectComposer, RenderPass: RP.RenderPass, UnrealBloomPass: UB.UnrealBloomPass, OutputPass: OP.OutputPass, ShaderPass: SP.ShaderPass, GLTFLoader: GL.GLTFLoader, BU, SU });
      await engine.loadCreatures();
      stats.loadMs = Math.round(performance.now() - t0);
      $('msg').hidden = true;
      paintInfo(); engine.apply(); engine.kick();
      if (pendingFood) { engine.dropFood(Math.min(12, pendingFood)); pendingFood = 0; }
    } catch (e) {
      console.warn('[habitat]', e); $('msg').hidden = false; $('msg').textContent = 'The habitat preview could not load here.';
    }
    starting = false;
  }

  function buildEngine(K) {
    const { THREE, BU } = K, V = THREE.Vector3;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    const pr = Math.min(devicePixelRatio || 1, PHONE ? 1.5 : 2); renderer.setPixelRatio(pr); stats.pixelRatio = pr;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 150);
    let seed = 7; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const R = (a, b) => a + rnd() * (b - a);
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const n2 = (x, z) => Math.sin(x * 0.9) * Math.cos(z * 0.7) * 0.3 + Math.sin(x * 2.3 + z * 1.7) * 0.1 + Math.sin(z * 3.1 - x) * 0.04;
    const H = (x, z) => n2(x, z) + 0.6 * Math.exp(-(x * x + (z + 1) * (z + 1)) / 10);

    /* ===== shared shading (ported from the v5 reef): caustics, absorption and view-direction fog.
       Land/air reuse it with caustics + absorption off, so the "water" fog becomes sky haze. ===== */
    const U = { uTime: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uDens: { value: 0.05 }, uCaus: { value: 1 }, uCausCol: { value: new THREE.Color(1, 1, 1) }, uAbsorb: { value: new V() }, uSurfY: { value: 9 }, uGlow: { value: 0 }, uGlowCol: { value: new THREE.Color(0x58e6ff) } };
    const FUNCS = `uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uDens; uniform float uCaus; uniform vec3 uCausCol; uniform vec3 uAbsorb; uniform float uSurfY;
vec2 uwHash(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float uwVor(vec2 p, float t){ vec2 i = floor(p), f = fract(p); float f1 = 8., f2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = uwHash(i + g); o = .5 + .42 * sin(t + 6.2831 * o); float d = length(g + o - f); if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d; }
  return f2 - f1; }
float uwCaus(vec2 p, float t){ float a = uwVor(p, t * .9), b = uwVor(p * 1.41 + vec2(4.1, 2.3), t * 1.15 + 1.7); return exp(-a * 26.) + exp(-b * 30.) * .8; }
vec3 uwWater(vec3 d){ return mix(uDeep, uShallow, smoothstep(-.45, .85, d.y)); }
`;
    const FRAG_DECL = FUNCS + `varying vec3 vWPos; varying vec3 vWN; uniform float uGlow; uniform vec3 uGlowCol;
#ifdef GLOW
varying float vTip;
#endif
`;
    const VERT_DECL = `uniform float uTime; varying vec3 vWPos; varying vec3 vWN;
#ifdef SWAY
uniform float uSwayAmp;
#endif
#ifdef GLOW
attribute float aTip; varying float vTip;
#endif
`;
    const VERT_DEFORM = `
#ifdef SWAY
  float uwSid = 0.;
  #ifdef USE_INSTANCING
    uwSid = float(gl_InstanceID);
  #endif
  float uwH = max(position.y, 0.);
  transformed.x += sin(uTime * 1.3 + uwSid * .7) * uSwayAmp * uwH * uwH;
  transformed.z += cos(uTime * 1.05 + uwSid * 1.3) * uSwayAmp * .6 * uwH * uwH;
#endif
#ifdef GLOW
  vTip = aTip;
#endif
`;
    const VERT_WORLD = `
  vec4 uwP = vec4(transformed, 1.);
  #ifdef USE_INSTANCING
    uwP = instanceMatrix * uwP;
  #endif
  vWPos = (modelMatrix * uwP).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);
`;
    const FRAG_CAUSTIC = `{ float uwUp = clamp(vWN.y * .85 + .15, 0., 1.); float uwDepth = exp(-max(uSurfY - vWPos.y, 0.) * .1);
  vec2 cp = vWPos.xz * .62 + vWPos.y * vec2(.12, .08); float t = uTime * .55;
  vec3 cc = vec3(uwCaus(cp + vec2(.018, 0.), t), uwCaus(cp, t), uwCaus(cp - vec2(.018, 0.), t));
  reflectedLight.directDiffuse += diffuseColor.rgb * uCausCol * cc * uCaus * uwUp * uwDepth; }
`;
    const FRAG_GLOW = `
#ifdef GLOW
  totalEmissiveRadiance += uGlowCol * uGlow * smoothstep(.55, 1., vTip);
#endif
`;
    const FRAG_FOG = `{ vec3 uwV = vWPos - cameraPosition; float uwD = length(uwV); vec3 uwDir = uwV / uwD;
  gl_FragColor.rgb *= exp(-uAbsorb * uwD); float uwF = 1. - exp(-pow(uDens * uwD, 1.35)); gl_FragColor.rgb = mix(gl_FragColor.rgb, uwWater(uwDir), uwF); }
`;
    function patch(mat, extra = {}) {
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U, extra);
        sh.vertexShader = VERT_DECL + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_DEFORM).replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_WORLD);
        sh.fragmentShader = FRAG_DECL + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_CAUSTIC).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_GLOW).replace('#include <fog_fragment>', FRAG_FOG);
      };
      mat.customProgramCacheKey = () => 'lbhab1';
      return mat;
    }

    /* ===== dome: water gradient + Snell's window (water) or plain sky gradient (land/air) ===== */
    const domeU = { uSunDir: { value: new V(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSurfCol: { value: new THREE.Color() } };
    const domeMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: { ...U, ...domeU },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: FUNCS + `uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSurfCol; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); vec3 col = uwWater(d); float win = smoothstep(.5, .92, d.y); vec2 sp = d.xz / max(d.y, .08) * 1.6;
          col += uSurfCol * win * (.25 + uwCaus(sp, uTime * .5) * .55); float s = max(dot(d, uSunDir), 0.); col += uSunCol * (pow(s, 40.) * 2.5 + pow(s, 6.) * .25);
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), domeMat); dome.frustumCulled = false; dome.renderOrder = -1; scene.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(dome.geometry, domeMat));
    let envRT = null; const bakeEnv = () => { const old = envRT; envRT = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = envRT.texture; if (old) old.dispose(); };
    const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0xfff8f0, 0xcaa77a, 0.6); scene.add(hemi);

    const canvasTex = (N, draw, rep = 1) => { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d'), N); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const groundTex = (base, speck) => canvasTex(256, (ctx, N) => { ctx.fillStyle = base; ctx.fillRect(0, 0, N, N); for (let i = 0; i < 9000; i++) { const g = R(0.75, 1.15); ctx.fillStyle = speck(g); ctx.fillRect(rnd() * N, rnd() * N, R(1, 2.2), R(1, 2.2)); } }, 9);

    /* ===== world: everything in `world` is rebuilt when the biome's medium changes ===== */
    let colliders = []; /* solid scenery as ellipsoids {kind, p, r, obj}; creatures stay outside */
    /* Every scenery piece registers with a kind; all kinds are solid unless the biome's `pass_through` lists it
       (biomes.json, e.g. kelp). Thin dressing (grass blades, light rays, particles) is never registered. */
    const solid = (kind, obj, pad = 1) => {
      obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(obj), p = bb.getCenter(new V()), r = bb.getSize(new V()).multiplyScalar(0.5 * pad);
      colliders.push({ kind, p, r, obj }); return obj;
    };
    let world = null, medium = null, growth = [], coralMats = [], algaeInst = null, rays = [], rockMat = null, snowMat = null;
    function buildWorld(med) {
      if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      world = new THREE.Group(); scene.add(world); medium = med; growth = []; coralMats = []; rays = []; seed = 7;
      const water = med === 'water';
      const sandGeo = new THREE.PlaneGeometry(80, 80, 120, 120); sandGeo.rotateX(-Math.PI / 2);
      { const p = sandGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i))); sandGeo.computeVertexNormals(); }
      const map = water ? groundTex('#d8c290', (g) => `rgba(${(220 * g) | 0},${(198 * g) | 0},${(150 * g) | 0},.6)`) : groundTex('#6f9a48', (g) => `rgba(${(90 * g) | 0},${(140 * g) | 0},${(60 * g) | 0},.7)`);
      const sand = new THREE.Mesh(sandGeo, patch(new THREE.MeshStandardMaterial({ map, roughness: 0.95 }))); sand.receiveShadow = true; world.add(sand);
      rockMat = patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
      const rocks = []; colliders = [];
      const rock = (x, z, s, sy) => {
        let g = new THREE.IcosahedronGeometry(1, 4); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BU.mergeVertices(g);
        const p = g.attributes.position, k = R(0, 10), col = [], c = new THREE.Color(), base = new THREE.Color(0x7a7166), dark = new THREE.Color(0x4c463f), pink = new THREE.Color(water ? 0xc77a95 : 0x8a8a70), moss = new THREE.Color(0x6f8a45);
        for (let i = 0; i < p.count; i++) {
          const v = new V().fromBufferAttribute(p, i), n = Math.sin(v.x * 2.1 + k) * Math.cos(v.z * 2.3 + k) * 0.16 + Math.sin(v.x * 5.3 + v.y * 4.1 + k) * 0.07;
          v.multiplyScalar(1 + n); p.setXYZ(i, v.x, v.y, v.z);
          const top = smooth(-0.1, 0.7, v.y); c.copy(base).lerp(dark, smooth(0.1, -0.6, n * 4)); if (Math.sin(v.x * 4 + k) * Math.sin(v.z * 3.7 + v.y * 2) > 0.25) c.lerp(pink, 0.55 * top); c.lerp(moss, top * (water ? 0.25 : 0.5)); col.push(c.r, c.g, c.b);
        }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
        const m = new THREE.Mesh(g, rockMat); m.scale.set(s, s * sy, s); m.position.set(x, H(x, z) + s * sy * 0.25, z); m.rotation.y = R(0, 6); m.castShadow = m.receiveShadow = true; world.add(m); rocks.push(m); solid('rock', m);
      };
      rock(1.9, -1.4, 1.3, 0.7); rock(-2.9, -2.6, 1.7, 0.75); rock(3.9, 0.5, 0.85, 0.6); rock(-0.4, -4.4, 2.3, 0.85); rock(-4.6, 0.6, 0.8, 0.55);
      const tipAttr = (g, maxY) => { const p = g.attributes.position, a = new Float32Array(p.count); for (let i = 0; i < p.count; i++) a[i] = p.getY(i) / maxY; g.setAttribute('aTip', new THREE.BufferAttribute(a, 1)); return a; };
      const colorByTip = (g, tip, c1, c2) => { const col = new Float32Array(tip.length * 3), a = new THREE.Color(c1), b = new THREE.Color(c2), c = new THREE.Color(); for (let i = 0; i < tip.length; i++) { c.copy(a).lerp(b, smooth(0.35, 1, tip[i])); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); };
      const coralMat = (sheen) => { const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(sheen) }); m.defines = { GLOW: '' }; coralMats.push(m); return patch(m); };
      const branchy = (x, z, s, c1, c2, opt = {}) => {
        const geos = [], spread = opt.spread ?? 0.75; let maxY = 0;
        const br = (start, dir, len, rad, d) => {
          const end = start.clone().addScaledVector(dir, len); maxY = Math.max(maxY, end.y);
          const g = new THREE.CylinderGeometry(rad * 0.74, rad, len, 8, 1, true); g.translate(0, len / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), dir)); g.translate(start.x, start.y, start.z); geos.push(g.toNonIndexed());
          const j = new THREE.SphereGeometry(rad * 0.74, 8, 6); j.translate(end.x, end.y, end.z); geos.push(j.toNonIndexed());
          if (d === 0) return;
          for (let i = 0; i < (d > 1 ? opt.kids ?? 3 : 2); i++) br(end, dir.clone().add(new V(R(-spread, spread), R(0.25, 0.7), R(-spread, spread))).normalize(), len * R(0.66, 0.82), rad * 0.74, d - 1);
        };
        for (let i = 0; i < (opt.trunks ?? 1); i++) br(new V(R(-0.15, 0.15), 0, R(-0.15, 0.15)), new V(R(-0.3, 0.3), 1, R(-0.3, 0.3)).normalize(), opt.len ?? 0.7, opt.rad ?? 0.09, opt.depth ?? 3);
        const g = BU.mergeGeometries(geos); g.computeVertexNormals(); colorByTip(g, tipAttr(g, maxY), c1, c2);
        const m = new THREE.Mesh(g, coralMat(c2)); m.position.set(x, H(x, z) - 0.03, z); m.scale.setScalar(s); m.castShadow = m.receiveShadow = true; world.add(m); growth.push(m); solid(water ? 'coral' : 'shrub', m, 0.8); return m; /* 0.8: branches are airy */
      };
      const brain = (x, z, r, c1, c2) => {
        const g = new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position, col = [], a = new THREE.Color(c1), b = new THREE.Color(c2), c = new THREE.Color(), tip = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) { const v = new V().fromBufferAttribute(p, i), n = v.clone().normalize(), k = Math.sin((v.x / r) * 16 + Math.sin((v.z / r) * 8) * 2.4 + Math.cos((v.y / r) * 6)); v.addScaledVector(n, k * r * 0.035); p.setXYZ(i, v.x, v.y, v.z); c.copy(a).lerp(b, k * 0.5 + 0.5); col.push(c.r, c.g, c.b); tip[i] = k > 0.6 ? 1 : 0; }
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1)); g.computeVertexNormals();
        const m = new THREE.Mesh(g, coralMat(c2)); m.scale.y = 0.8; m.position.set(x, H(x, z) - 0.06, z); m.castShadow = m.receiveShadow = true; world.add(m); growth.push(m); solid('coral', m);
      };
      const bush = (x, z, s, c1, c2) => { /* land/air: a flowering shrub from the same branch generator, tips as blossoms */
        const m = branchy(x, z, s, c1, c2, { spread: 0.9, depth: 3, len: 0.5, rad: 0.05, kids: 3 }); return m;
      };
      /* growth order = what appears first as phases rise */
      if (water) {
        branchy(-1.4, 0.5, 1.1, 0xc2384f, 0xffb3bf); brain(0.5, 1.2, 0.72, 0x8a5a1e, 0xf2b866);
        branchy(2.5, -2.7, 1.3, 0x6b2fa8, 0xd7a8ff, { trunks: 2 }); branchy(-3.6, -0.7, 0.95, 0xd3533c, 0xffc9a3, { spread: 0.55 });
        brain(-2.2, -3.8, 0.55, 0x3f6b2a, 0xb8de7a); branchy(0.2, -2.4, 0.8, 0x2a8f86, 0x9ff5df, { trunks: 3, depth: 2, len: 0.55 });
        branchy(3.3, -1.6, 0.9, 0xb4471f, 0xffa35a, { spread: 0.5 }); brain(-0.8, -1.2, 0.45, 0x6a3a7a, 0xe0a8f0);
        /* anemone: instanced swaying tentacles, glowing tips at night */
        const N = 120, g = new THREE.CylinderGeometry(0.011, 0.03, 0.55, 6, 8); g.translate(0, 0.275, 0); tipAttr(g, 0.55);
        const mat = new THREE.MeshPhysicalMaterial({ color: 0xd59ae8, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xffe0ff) }); mat.defines = { SWAY: '', GLOW: '' }; patch(mat, { uSwayAmp: { value: 0.35 } }); coralMats.push(mat);
        const inst = new THREE.InstancedMesh(g, mat, N), o = new THREE.Object3D();
        for (let i = 0; i < N; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.48; o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.set(Math.sin(a) * r * 1.3, 0, -Math.cos(a) * r * 1.3); o.scale.setScalar(R(0.75, 1.15)); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
        inst.position.set(1.6, H(1.6, 1.5) + 0.02, 1.5); inst.castShadow = true; world.add(inst); growth.splice(1, 0, inst); solid('anemone', inst);
      } else {
        bush(-1.4, 0.5, 1.4, 0x3f6b2a, 0xffd23f); bush(0.6, 1.0, 1.0, 0x4a7d3a, 0xf28fb0); bush(2.5, -2.7, 1.6, 0x3a6a30, 0xffffff, { trunks: 2 });
        bush(-3.6, -0.7, 1.2, 0x4a7d3a, 0xb98cff); bush(-2.2, -3.8, 1.3, 0x355f2a, 0xff9a52); bush(0.2, -2.4, 1.1, 0x4a7d3a, 0xfff07a);
        bush(3.3, -1.6, 1.2, 0x3f6b2a, 0xff6a6a); bush(-0.8, -1.2, 0.9, 0x4a7d3a, 0x8fd0ff);
      }
      /* grass: seagrass under water, meadow grass on land */
      { const g = new THREE.PlaneGeometry(0.045, 0.55, 1, 6); g.translate(0, 0.275, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - (p.getY(i) / 0.55) * 0.75));
        const mat = new THREE.MeshStandardMaterial({ color: water ? 0x6f9a3c : 0x86b84a, roughness: 0.75, side: THREE.DoubleSide }); mat.defines = { SWAY: '' }; patch(mat, { uSwayAmp: { value: water ? 0.28 : 0.12 } });
        const N = water ? 220 : 400, inst = new THREE.InstancedMesh(g, mat, N), o = new THREE.Object3D(); let k = 0;
        while (k < N) { const cx = R(-7, 7), cz = R(-2, 4); if (Math.hypot(cx, cz + 1) < 2.6) continue; for (let j = 0; j < 10 && k < N; j++, k++) { const x = cx + R(-0.4, 0.4), z = cz + R(-0.4, 0.4); o.position.set(x, H(x, z) - 0.02, z); o.rotation.set(0, R(0, 3), 0); o.scale.set(1, R(0.6, 1.5), 1); o.updateMatrix(); inst.setMatrixAt(k, o.matrix); inst.setColorAt(k, new THREE.Color().setHSL(R(0.18, 0.26), R(0.35, 0.55), R(0.3, 0.45))); } }
        inst.receiveShadow = true; world.add(inst); }
      /* algae from neglected tasks: hair algae on rocks (water) / weeds (land) */
      { const g = new THREE.ConeGeometry(0.025, 0.3, 4); g.translate(0, 0.15, 0); const mat = new THREE.MeshStandardMaterial({ color: 0x5d7228, roughness: 1 }); mat.defines = { SWAY: '' }; patch(mat, { uSwayAmp: { value: 0.6 } });
        const N = 270, inst = new THREE.InstancedMesh(g, mat, N), o = new THREE.Object3D(), ray = new THREE.Raycaster();
        for (let i = 0; i < N; i++) { const r = rocks[i % rocks.length], a = rnd() * 6.283, d = rnd() * 0.7; r.updateMatrixWorld(); ray.set(new V(r.position.x + Math.cos(a) * d * r.scale.x, r.position.y + 5, r.position.z + Math.sin(a) * d * r.scale.z), new V(0, -1, 0)); const hit = ray.intersectObject(r)[0]; o.position.copy(hit ? hit.point : r.position); o.rotation.set(R(-0.3, 0.3), R(0, 3), R(-0.3, 0.3)); o.scale.setScalar(R(0.6, 1.3)); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
        inst.count = 0; world.add(inst); algaeInst = inst; }
      /* light shafts (water only) */
      if (water) for (let i = 0; i < 8; i++) {
        const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: U.uTime, uRay: rayU.uRay, uRayCol: rayU.uRayCol, uSeed: { value: R(0, 10) } },
          vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.); }',
          fragmentShader: `uniform float uTime, uRay, uSeed; uniform vec3 uRayCol; varying vec2 vUv; varying vec3 vW;
            void main(){ float e = smoothstep(0., .5, vUv.x) * smoothstep(1., .5, vUv.x); e *= e; float fall = pow(vUv.y, 1.8); float flick = .55 + .45 * sin(uTime * .7 + uSeed * 2.1);
              float streak = .65 + .35 * sin(vUv.x * 23. + uSeed * 5. + uTime * .25); float near = smoothstep(1.5, 5., length(vW - cameraPosition)); gl_FragColor = vec4(uRayCol * e * fall * flick * streak * near * uRay, 1.); }` });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(R(0.7, 1.8), 16), m); p.position.set(R(-7, 7), 6, R(-7, 1)); p.userData.slant = R(-0.32, -0.14); world.add(p); rays.push(p);
      }
      /* particles: marine snow (water) / pollen (land, air) */
      { const N = 700, g = new THREE.BufferGeometry(), sp = new Float32Array(N * 3), ss = new Float32Array(N); for (let i = 0; i < N; i++) { sp[i * 3] = R(-10, 10); sp[i * 3 + 1] = R(0, 8); sp[i * 3 + 2] = R(-10, 7); ss[i] = rnd(); }
        g.setAttribute('position', new THREE.BufferAttribute(sp, 3)); g.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
        snowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uPx: { value: 60 }, uOp: { value: 0.5 }, uCol: { value: new THREE.Color(0xe8fbff) } },
          vertexShader: `uniform float uTime, uPx; attribute float aS; varying float vD; varying float vA;
            void main(){ vec3 p = position; p.y = mod(p.y - uTime * (.03 + aS * .05), 8.); p.x += sin(uTime * .2 + aS * 30.) * .15; vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; vD = -mv.z; gl_PointSize = (1. + aS * 2.5) * uPx / vD; vA = .35 + .65 * aS; }`,
          fragmentShader: `uniform float uOp; uniform vec3 uCol; varying float vD; varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(uCol, smoothstep(.5, .05, d) * uOp * vA * exp(-vD * .07) * smoothstep(.4, 1.6, vD)); }` });
        world.add(new THREE.Points(g, snowMat)); }
      envDirty = true;
    }
    const rayU = { uRay: { value: 0.1 }, uRayCol: { value: new THREE.Color(0xdffbff) } };

    /* ===== post: MSAA HDR -> bloom -> OutputPass -> grade (saturation drives "bleached") ===== */
    const composer = new K.EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: PHONE ? 2 : 4 }));
    composer.addPass(new K.RenderPass(scene, camera));
    const bloom = new K.UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.55, 0.9); composer.addPass(bloom);
    composer.addPass(new K.OutputPass());
    const grade = new K.ShaderPass({ uniforms: { tDiffuse: { value: null }, sat: { value: 1.15 }, contrast: { value: 1.08 }, vig: { value: 0.3 }, tint: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vig; uniform vec3 tint; varying vec2 vUv;
        void main(){ vec2 d = vUv - .5; vec3 c = texture2D(tDiffuse, vUv).rgb * tint; float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, sat); c = (c - .5) * contrast + .5; c *= 1. - vig * dot(d, d) * 1.6; gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }` });
    composer.addPass(grade);

    /* ===== creatures ===== */
    const creatures = [], food = [];
    const foodGeo = new THREE.SphereGeometry(0.04, 8, 6), foodMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0 });
    const tmpV = new V(), tmpV2 = new V();
    async function decode(entry) {
      if (!(G.LB_CREATURES && G.LB_CREATURES[entry.id])) await loadScript(base + entry.js);
      const b64 = G.LB_CREATURES[entry.id], bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
      return new K.GLTFLoader().parseAsync(bin, '');
    }
    async function specOf(entry) { if (!entry.spec) return {}; try { const r = await fetch(base + entry.spec); return r.ok ? await r.json() : {}; } catch (e) { return {}; } }
    let pathSeed = 0;
    function spawn(gltf, entry, spec, k) {
      const root = K.SU.clone(gltf.scene), holder = new THREE.Group(); holder.add(root);
      root.scale.setScalar(DISPLAY_SCALE);
      if (entry.forward === '-X') root.rotation.y = Math.PI;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; const mats = Array.isArray(o.material) ? o.material : [o.material]; o.material = mats.map((m) => patch(m.clone()))[0]; } });
      holder.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(root), len = bb.max.x - bb.min.x;
      let mouth = root.getObjectByName('mouth');
      if (!mouth) { mouth = new THREE.Object3D(); mouth.position.set(bb.max.x / DISPLAY_SCALE, 0, 0); root.add(mouth); }
      const mixer = new THREE.AnimationMixer(root), clip = (n) => gltf.animations.find((a) => a.name === n);
      const idle = clip('idle') ? mixer.clipAction(clip('idle')) : null, feed = clip('feed') ? mixer.clipAction(clip('feed')) : null;
      const ts = 0.92 + Math.random() * 0.16;
      if (idle) { idle.play(); idle.time = Math.random() * idle.getClip().duration; idle.timeScale = ts; }
      if (feed) { feed.setLoop(THREE.LoopOnce, 1); feed.clampWhenFinished = true; feed.timeScale = ts; }
      const loco = (entry.locomotion || spec.locomotion || 'swim').toLowerCase(), i = pathSeed++;
      const P = { c: [[1.4, 1.2], [-0.6, 0.4], [0.8, -0.6], [-1.8, 1.0]][i % 4], r: [R(1.1, 1.7), R(0.6, 1.0)], y: R(0.7, 1.4), sp: R(0.28, 0.4) * (loco === 'drift' ? 0.4 : loco === 'walk' || loco === 'crawl' ? 0.35 : 1), ph: R(0, 6.28), dir: i % 2 ? -1 : 1 };
      const c = { id: entry.id, holder, root, mouth, mixer, idle, feed, loco, P, a: P.ph, len, footY: -bb.min.y, pos: new V(), prev: new V(), yaw: 0, pitch: 0, state: 'roam', target: null, eatEnd: 0, eaten: 0 };
      c.pos.copy(pathPos(c, c.a)); c.prev.copy(c.pos); holder.position.copy(c.pos);
      scene.add(holder); creatures.push(c);
    }
    function pathPos(c, a) {
      const P = c.P, x = P.c[0] + Math.cos(a * P.dir) * P.r[0], z = P.c[1] + Math.sin(a * P.dir) * P.r[1], g = H(x, z);
      if (c.loco === 'rooted') return new V(P.c[0], H(P.c[0], P.c[1]) + c.footY, P.c[1]);
      if (c.loco === 'walk' || c.loco === 'crawl') return new V(x, g + c.footY, z);
      if (c.loco === 'fly') return new V(x, g + 1.6 + P.y + Math.abs(Math.sin(a * 1.5)) * 0.9, z);
      return new V(x, g + P.y + Math.sin(a * 2) * 0.18, z);
    }
    let visitorName = null;
    async function loadCreatures() {
      creatures.splice(0).forEach((c) => scene.remove(c.holder));
      const bid = sceneBiomeId(), med = biomeOf(bid).medium || 'water';
      if (med !== medium) buildWorld(med);
      const list = (roster.creatures || []).filter((c) => (forced ? c.id === forced : c.biome === bid || (c.biome == null && med === 'water')));
      if (forced && !list.length) console.warn('[habitat] visitor not in roster:', forced);
      for (const entry of list.slice(0, 3)) {
        try { const [gltf, spec] = await Promise.all([decode(entry), specOf(entry)]); const n = forced ? 2 : entry.rarity === 'common' ? 2 : 1; for (let k = 0; k < n; k++) spawn(gltf, entry, spec, k); visitorName = spec.name || entry.id; }
        catch (e) { console.warn('[habitat] creature failed', entry.id, e); }
      }
      stats.creatures = creatures.length;
    }
    function dropFood(n = 6) {
      const water = medium === 'water';
      const cx = creatures.length ? creatures[0].pos.x : 0, cz = creatures.length ? creatures[0].pos.z : 1;
      for (let i = 0; i < n; i++) { const m = new THREE.Mesh(foodGeo, foodMat); m.position.set(cx + R(-1, 1), (water ? 3.6 : 3) + R(0, 0.8), cz + R(-0.6, 0.6)); m.userData = { v: water ? R(0.25, 0.4) : R(0.9, 1.3), claimed: null, landed: 0 }; scene.add(m); food.push(m); }
      kick();
    }
    function removeFood(f) { scene.remove(f); const i = food.indexOf(f); if (i >= 0) food.splice(i, 1); }
    /* no passing through rocks, the ground or each other: project the body back outside after each move */
    function keepClear(c) {
      const pad = c.len * 0.55, q = new V();
      const pass = biomeOf(sceneBiomeId()).pass_through || [];
      for (const o of colliders) {
        if (pass.includes(o.kind) || !o.obj.visible) continue; /* hidden growth (not yet grown) isn't there */
        q.set((c.pos.x - o.p.x) / (o.r.x + pad), (c.pos.y - o.p.y) / (o.r.y + pad), (c.pos.z - o.p.z) / (o.r.z + pad));
        const L = q.length(); if (L >= 1) continue; if (L < 1e-4) q.set(0, 1, 0); else q.divideScalar(L);
        c.pos.set(o.p.x + q.x * (o.r.x + pad), o.p.y + q.y * (o.r.y + pad), o.p.z + q.z * (o.r.z + pad));
      }
      for (const b of creatures) {
        if (b === c) continue; const min = (c.len + b.len) * 0.5; q.copy(c.pos).sub(b.pos); const d = q.length();
        if (d < min && d > 1e-4) c.pos.addScaledVector(q, (min - d) / d * 0.5);
      }
      const floor = H(c.pos.x, c.pos.z) + (c.loco === 'walk' || c.loco === 'crawl' ? c.footY : c.len * 0.35);
      if (c.pos.y < floor) c.pos.y = floor;
    }
    function stepCreatures(dt, t, m) {
      for (const c of creatures) {
        c.mixer.update(dt * m);
        if (c.state === 'roam' && food.length && c.eaten < 4 && c.loco !== 'rooted') {
          const f = food.filter((x) => !x.userData.claimed).sort((a, b) => a.position.distanceTo(c.pos) - b.position.distanceTo(c.pos))[0];
          if (f && f.position.distanceTo(c.pos) < 7) { f.userData.claimed = c; c.target = f; c.state = 'seek'; }
        }
        let desired;
        if (c.state === 'seek') {
          if (!c.target.parent) { c.state = 'roam'; c.target = null; continue; }
          c.holder.updateMatrixWorld(true); c.mouth.getWorldPosition(tmpV); tmpV2.copy(c.holder.position).sub(tmpV); /* root - mouth */
          desired = c.target.position.clone().add(tmpV2);
          if (c.loco === 'walk' || c.loco === 'crawl') desired.y = Math.max(desired.y, H(desired.x, desired.z) + c.footY);
          if (tmpV.distanceTo(c.target.position) < Math.max(0.12, c.len * 0.12)) {
            c.state = 'eat'; c.eaten++; removeFood(c.target); c.target = null;
            const dur = c.feed ? c.feed.getClip().duration / c.feed.timeScale : 1.2;
            if (c.feed && c.idle) { c.feed.reset().play(); c.idle.crossFadeTo(c.feed, 0.25, false); }
            c.eatEnd = t + dur * 0.92;
          }
        } else if (c.state === 'eat') {
          desired = c.pos.clone();
          if (t >= c.eatEnd) { if (c.feed && c.idle) { c.idle.reset().play(); c.feed.crossFadeTo(c.idle, 0.3, false); } c.state = 'roam'; }
        } else {
          c.a += dt * m * c.P.sp; desired = pathPos(c, c.a);
          if (!food.length) c.eaten = 0;
        }
        const k = c.state === 'seek' ? 1 - Math.exp(-dt * 2.2) : 1 - Math.exp(-dt * 3);
        c.prev.copy(c.pos); c.pos.lerp(desired, k * m || (m ? 0 : 1));
        if (c.state === 'seek') { const v = desired.clone().sub(c.pos), d = v.length(), sp = 1.4 * dt; if (d > sp) c.pos.addScaledVector(v, sp / d); }
        if (c.loco !== 'rooted') keepClear(c);
        const vel = tmpV.copy(c.pos).sub(c.prev);
        const face = c.state !== 'roam' && c.target ? tmpV2.copy(c.target.position).sub(c.pos) : vel;
        if (face.lengthSq() > 1e-8 && c.loco !== 'rooted') {
          const yaw = Math.atan2(-face.z, face.x), pitch = c.loco === 'walk' || c.loco === 'crawl' ? 0 : Math.atan2(face.y, Math.hypot(face.x, face.z)) * 0.8;
          let dy = yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * Math.min(1, dt * 4); c.pitch += (pitch - c.pitch) * Math.min(1, dt * 4);
        }
        c.holder.position.copy(c.pos); c.holder.rotation.set(0, c.yaw, c.pitch, 'YZX');
      }
      for (let i = food.length - 1; i >= 0; i--) {
        const f = food[i], u = f.userData, floor = H(f.position.x, f.position.z) + 0.05;
        if (f.position.y > floor) { f.position.y = Math.max(floor, f.position.y - u.v * dt * m); f.position.x += Math.sin(t * 2 + i) * 0.002 * m; }
        else if ((u.landed += dt) > 8) { if (u.claimed && u.claimed.target === f) { u.claimed.state = 'roam'; u.claimed.target = null; } removeFood(f); }
      }
    }

    /* ===== state -> look ===== */
    const C = (h) => new THREE.Color(h);
    const MURK_S = C(0x6f8f4a), MURK_D = C(0x23361c), NIGHT_S = C(0x0a2a48), NIGHT_D = C(0x01070f), DUSK = C(0xd9906a), ALGAE = C(0x8fb04a);
    let envDirty = true;
    function apply() {
      const st = game || { reef: { phase: 2, phases: 5, bleached: false }, cloudiness: 0, algae: 0 }, water = medium === 'water';
      const o = st.cloudiness, al = st.algae, bleached = st.reef.bleached;
      const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
      const elev = Math.sin(((h - 6) / 12) * Math.PI), day = Math.max(0, elev), night = 1 - smooth(-0.1, 0.25, elev), dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - night * 0.6);
      const nightK = water ? 0.9 : 0.75;
      if (water) { U.uShallow.value.set(0x3fd0e4); U.uDeep.value.set(0x0a5a86); }
      else { U.uShallow.value.set(0x9fd4f2); U.uDeep.value.set(medium === 'air' ? 0xdfe8ee : 0xf2e2bc); }
      U.uShallow.value.lerp(MURK_S, o * 0.65).lerp(ALGAE, al * 0.35).lerp(DUSK, dusk * 0.3).lerp(NIGHT_S, night * nightK);
      U.uDeep.value.lerp(MURK_D, o * 0.6).lerp(NIGHT_D, night * nightK);
      U.uDens.value = (water ? 0.042 : medium === 'air' ? 0.05 : 0.018) * (1 + o * 1.4) * (1 + night * 0.25);
      U.uAbsorb.value.set(...(water ? [0.035, 0.012, 0.01] : [0, 0, 0])).multiplyScalar(1 + o * 0.5);
      const lightK = 1 - o * 0.45;
      U.uCaus.value = water ? 3.2 * Math.pow(day, 0.7) * (1 - o * 0.75) : 0;
      U.uCausCol.value.set(dusk > 0.4 ? 0xffd6b0 : 0xf4fdff); U.uGlow.value = night * 0.9;
      const az = ((h - 6) / 12) * Math.PI, sd = new V(Math.cos(az) * 0.55, Math.max(0.35, elev) + 0.5, -0.35).normalize();
      sun.position.copy(sd).multiplyScalar(18); sun.target.position.set(0, 0, -1);
      sun.color.set(night > 0.5 ? 0x8fb8ff : dusk > 0.4 ? 0xffc79a : 0xfff6e8);
      sun.intensity = (night > 0.5 ? 0.35 : 0.2 + day * (water ? 3.2 : 2.6)) * lightK;
      domeU.uSunDir.value.copy(sd); domeU.uSunCol.value.set(night > 0.5 ? 0x5a7ab0 : dusk > 0.4 ? 0xffb07a : 0xfff4dc).multiplyScalar((night > 0.5 ? 0.25 : 0.4 + day) * lightK);
      domeU.uSurfCol.value.copy(U.uShallow.value).lerp(C(0xffffff), 0.5).multiplyScalar(water ? (0.25 + day * 0.9) * lightK : 0);
      scene.environmentIntensity = 0.4 + day * 0.2; hemi.intensity = (0.15 + day * 0.65) * lightK;
      rayU.uRay.value = 0.16 * day * (1 - o * 0.7);
      if (snowMat) { snowMat.uniforms.uOp.value = water ? 0.45 + o * 0.5 : 0.25; snowMat.uniforms.uCol.value.set(water ? (night > 0.5 ? 0x7af0ff : 0xe8fbff) : 0xfff2b0); }
      if (rockMat) rockMat.color.set(0xffffff).lerp(C(0x9aa060), Math.max(o, al) * 0.6);
      if (algaeInst) algaeInst.count = Math.round(al * 270);
      /* phase -> how much coral/plant life is in. 30% at phase 1, all of it at the last phase */
      const show = Math.max(1, Math.round(growth.length * (0.3 + (0.7 * st.reef.phase) / Math.max(1, st.reef.phases - 1))));
      growth.forEach((g, i) => { g.visible = i < show; });
      coralMats.forEach((m) => { m.emissive = m.emissive || new THREE.Color(); m.emissive.set(bleached ? 0x5a5a58 : 0x000000); });
      grade.uniforms.sat.value = bleached ? 0.35 : 1.15;
      grade.uniforms.tint.value.set(1, 1, 1).lerp(C(0xd8f0b0), al * 0.5);
      renderer.toneMappingExposure = water ? 1.05 : 1.0;
      if (stats.bloom) { bloom.strength = 0.28 + night * 0.55; bloom.threshold = 0.9 - night * 0.5; }
      envDirty = true; kick();
    }

    /* ===== loop: runs only while visible; reduced motion renders single frames ===== */
    let raf = 0, last = 0, envTick = 0, fpsN = 0, fpsT = 0, fpsChecked = false, warm = 0; /* skip shader-compile frames */
    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight, p = renderer.getPixelRatio();
      if (!w || !h) return false;
      if (canvas.width !== Math.round(w * p) || canvas.height !== Math.round(h * p)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); composer.setPixelRatio(p); composer.setSize(w, h); if (snowMat) snowMat.uniforms.uPx.value = h * p * 0.022; }
      return true;
    }
    function frame(t) {
      raf = 0;
      const reduce = reduceMQ.matches, m = reduce ? 0 : 1, dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016); last = t;
      if (!resize()) return;
      const s = t / 1000;
      U.uTime.value = reduce ? 3 : s;
      if (envDirty && t - envTick > 120) { bakeEnv(); envDirty = false; envTick = t; }
      const a0 = m * Math.sin(s * 0.1) * 0.22;
      camera.position.set(Math.sin(a0) * 7.4, 2.1 + m * Math.sin(s * 0.3) * 0.08, Math.cos(a0) * 7.4); camera.lookAt(0, 1.0, -0.6);
      dome.position.copy(camera.position);
      rays.forEach((r, i) => { r.lookAt(camera.position.x, r.position.y, camera.position.z); r.rotateZ(r.userData.slant + m * Math.sin(s * 0.2 + i) * 0.04); });
      stepCreatures(reduce ? 0.016 : dt, s, reduce ? (food.length ? 1 : 0) : 1);
      composer.render(dt);
      /* fps over ~2 s after a warm-up; below 40 drops bloom for good */
      if (!fpsChecked && !reduce && ++warm > 45) { fpsN++; fpsT += dt; if (fpsT > 2 && fpsN > 20) { stats.fps = Math.round(fpsN / fpsT); fpsChecked = true; if (stats.fps < 40) { bloom.enabled = false; stats.bloom = false; } } }
      if (running() && (!reduce || food.length)) raf = requestAnimationFrame(frame);
    }
    const running = () => inView && document.visibilityState === 'visible';
    function kick() { if (!raf && running()) { last = 0; raf = requestAnimationFrame(frame); } }
    document.addEventListener('visibilitychange', kick);
    reduceMQ.addEventListener('change', kick);
    return { apply, kick, loadCreatures, dropFood, get visitorName() { return visitorName; }, debug: () => ({ food: food.length, creatures: creatures.map((c) => ({ id: c.id, state: c.state, eaten: c.eaten, loco: c.loco, pos: c.pos.toArray().map((x) => +x.toFixed(2)), feeding: !!(c.feed && c.feed.isRunning()) })) }) };
  }

  /* ---------- visibility: lazy start + pause off-screen ---------- */
  const io = new IntersectionObserver((es) => { inView = es.some((e) => e.isIntersecting); if (inView) { if (!engine) start(); else engine.kick(); } }, { rootMargin: '200px 0px' });
  io.observe(card);

  let lastBiome = null, pendingFood = 0;
  const Habitat = {
    el: card, stats,
    get visitor() { return forced ? null : engine ? engine.visitorName : null; },
    mount(slot) { if (slot && card.parentNode !== slot) slot.appendChild(card); },
    setState(g) {
      game = g; paintInfo();
      if (!engine) return;
      const b = sceneBiomeId();
      if (lastBiome !== null && b !== lastBiome) engine.loadCreatures().then(() => engine.apply());
      lastBiome = b; engine.apply();
    },
    feed(n = 6) { if (engine) engine.dropFood(n); else pendingFood += n; },
    visitorOverride,
    debug: () => (engine ? engine.debug() : null),
  };
  G.Habitat = Habitat;
})(window);
