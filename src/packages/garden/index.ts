/* Garden card (plots as SVG, roster plants in 3D) and the Grow → Collection shelf, stat tiles and logbook. */
export { LOOK_LABELS, formatShortDate, plotLook, type GardenPlot } from './lib/labels.ts';
export { plantPool, poolVersion } from './lib/roster.ts';
export { plotSVG } from './lib/plant-3d.ts';
export { collectionHTML, gardenTiles, type GardenTile, type KeepsakeNote } from './lib/collection.ts';
export { logbookHTML, logbookItems, type LogbookItem } from './lib/logbook.ts';
export { setGardenRerender } from './lib/rerender.ts';
