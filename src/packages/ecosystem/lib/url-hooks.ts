/* Test hooks read from the page URL. The artifact host passes only plain #name hashes, so every hook also works as
   #<name>-<value> in the hash. These names are a contract with the model pipeline's page-test and capture tools. */

/** Visitor test hook: force a roster creature into the scene, in its own biome. ?visitor=<id>, #visitor=<id> or #visitor-<id>. */
export function visitorFromUrl(href: string): string | null {
  const url = new URL(href);
  const query = url.searchParams.get('visitor');
  if (query) return query;
  const hash = decodeURIComponent(url.hash.slice(1));
  const match = /(?:^|[&/])visitor=([\w-]+)/.exec(hash) ?? /^(?:labs-)?visitor-([\w-]+)$/.exec(hash);
  return match?.[1] ?? null;
}

/** One hook's value: ?<name>=<value>, or <name>=<value> / <name>-<value> in the hash (word characters only). */
export function hookFromUrl(name: string, href: string): string | null {
  const url = new URL(href);
  const query = url.searchParams.get(name);
  if (query) return query;
  const match = new RegExp('(?:^|[&/])' + name + '[=-](\\w+)').exec(decodeURIComponent(url.hash.slice(1)));
  return match?.[1] ?? null;
}

export interface SceneHooks {
  /** ?scene=<key>: render that builder with no biome scenery (old-biome check) */
  forcedScene: string | null;
  /** ?phase=<1-5>: pin the growth phase (shows that phase's scenery tiers complete) */
  forcedPhase: number | null;
  /** ?weather=<condition text> */
  forcedWeather: string | null;
  /** ?month=<1-12> */
  forcedMonth: number | null;
  /** QA capture (models/shared/tools/capture_ecosystem.ts): ?inspect=<scenery id> places one copy of that prop in front of the camera */
  inspectId: string | null;
  /** ?inspect_src=<path to its -glb.js> (query only) */
  inspectSrc: string | null;
  /** ?biome=<id> */
  forcedBiome: string | null;
  /** ?hour=<0-23> pins the sun */
  forcedHour: string | null;
  /** creature rest QA (docs/design/creature-rest.md): ?rest=<on>_<pose>, e.g. rock_cling */
  forcedRest: string | null;
  /** ?perch=1 starts every resting creature on its perch */
  forcedPerch: boolean;
  forcedVisitor: string | null;
}

export function readSceneHooks(href: string): SceneHooks {
  const hook = (name: string): string | null => hookFromUrl(name, href);
  return {
    forcedScene: hook('scene'),
    forcedPhase: Number(hook('phase')) || null,
    forcedWeather: hook('weather'),
    forcedMonth: Number(hook('month')) || null,
    inspectId: hook('inspect'),
    inspectSrc: new URL(href).searchParams.get('inspect_src'),
    forcedBiome: hook('biome'),
    forcedHour: hook('hour'),
    forcedRest: hook('rest'),
    forcedPerch: !!hook('perch'),
    forcedVisitor: visitorFromUrl(href),
  };
}
