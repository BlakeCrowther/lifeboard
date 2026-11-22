/* Media queries the views and actions read. */
export const phoneLayout = matchMedia('(max-width:699px)');
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
/** The ring card's task panel: open by default except on a phone. */
export const ringTasksOpenByDefault = (): boolean => !phoneLayout.matches;
