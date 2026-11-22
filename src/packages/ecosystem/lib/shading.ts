/* Shared shading (ported from the v5 reef): caustics, absorption and view-direction fog, patched into the standard materials.
   Land and air reuse it with caustics and absorption off, so the "water" fog becomes sky haze. */
import type { Three, ThreeKit } from './kit.ts';

export const FUNCS = `uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform float uDens; uniform float uCaus; uniform vec3 uCausCol; uniform vec3 uAbsorb; uniform float uSurfY;
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
#ifdef PROP_SWAY
attribute float _sway_w; attribute float _sway_p; uniform vec4 uPSway; uniform float uSwayT;
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
#ifdef PROP_SWAY
  /* scenery shader sway (models/shared/blender/lib.py shader_sway): uPSway = (amp m, period s, lift 0..1, per-copy phase);
     _sway_w = how free this point is, _sway_p = how far its wave lags the base. Prop-local space, meters. */
  float pt = 6.2832 * uSwayT / uPSway.y + uPSway.w - _sway_p * 2.2;
  transformed.x += sin(pt) * uPSway.x * _sway_w;
  transformed.z += sin(pt + 1.7) * uPSway.x * .45 * _sway_w;
  transformed.y += max(0., sin(pt - .5)) * uPSway.z * uPSway.x * _sway_w;
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

export interface SharedUniforms {
  uTime: { value: number };
  uDeep: { value: Three.Color };
  uShallow: { value: Three.Color };
  uDens: { value: number };
  uCaus: { value: number };
  uCausCol: { value: Three.Color };
  uAbsorb: { value: Three.Vector3 };
  uSurfY: { value: number };
  uGlow: { value: number };
  uGlowCol: { value: Three.Color };
}

export type ExtraUniforms = Record<string, { value: unknown }>;

export interface Shading {
  uniforms: SharedUniforms;
  /** patch a material with the shared shading; `extra` = its own uniforms (sway amount, prop sway) */
  patch: <M extends Three.Material>(material: M, extra?: ExtraUniforms) => M;
}

export function createShading(kit: ThreeKit): Shading {
  const { THREE } = kit;
  const uniforms: SharedUniforms = {
    uTime: { value: 0 }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uDens: { value: 0.05 }, uCaus: { value: 1 },
    uCausCol: { value: new THREE.Color(1, 1, 1) }, uAbsorb: { value: new THREE.Vector3() }, uSurfY: { value: 9 }, uGlow: { value: 0 }, uGlowCol: { value: new THREE.Color(0x58e6ff) },
  };
  const patch = <M extends Three.Material>(material: M, extra: ExtraUniforms = {}): M => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, extra);
      shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_DEFORM).replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_WORLD);
      shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + FRAG_CAUSTIC).replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_GLOW).replace('#include <fog_fragment>', FRAG_FOG);
    };
    material.customProgramCacheKey = () => 'lbhab1';
    return material;
  };
  return { uniforms, patch };
}
