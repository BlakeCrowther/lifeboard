/* The icon set: line icons (one stroke family on a 24px grid) and cut-paper art icons (mid-century palette, layered
   shapes with a surface-colored cut edge and a hard shadow). icon() draws the art version when one exists. */

/** Line icon name -> SVG inner markup. */
const LINE_ICON_PATHS: Readonly<Record<string, string>> = {
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  sliders:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  auto:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list:'<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r=".9" fill="currentColor"/><circle cx="4.8" cy="12" r=".9" fill="currentColor"/><circle cx="4.8" cy="17.5" r=".9" fill="currentColor"/>',
  leaf:'<path d="M5 19.5C5 10.5 10 5 20 4.5c0 10-5.5 15-14 15"/><path d="M5 19.5l7.5-7.5"/>',
  sprout:'<path d="M12 21v-9"/><path d="M12 12c0-4-3-7-8-7 0 5 3 7 8 7zM12 10c0-3 2.2-6 7.5-6 0 4-2.2 6-7.5 6z"/>',
  info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL:'<path d="M15 5l-7 7 7 7"/>', chevR:'<path d="M9 5l7 7-7 7"/>', chevD:'<path d="M6 9l6 6 6-6"/>',
  wave:'<path d="M2 14.5c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M6.5 10c0-3.5 2.8-5.5 6.5-5.5-1.8 1.2-2.3 3-1 4.8"/>',
  flame:'<path d="M12 21.5c-3.9 0-6.5-2.8-6.5-6.4 0-3.8 2.8-5.6 3.8-9.6 1.9 1.6 2.9 3.6 2.9 5.6 1-.8 1.8-2 1.9-3.7 2.1 1.9 4.4 4.8 4.4 7.7 0 3.6-2.6 6.4-6.5 6.4z"/>',
  heart:'<path d="M12 20s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.4-8 11-8 11z"/>',
  coin:'<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.4c-.5-.9-1.4-1.4-2.6-1.4-1.5 0-2.5.8-2.5 1.9 0 2.6 5.1 1.4 5.1 4.1 0 1.2-1.1 2-2.6 2-1.2 0-2.2-.5-2.7-1.4M12 6.5V8M12 16v1.5"/>',
  house:'<path d="M3.5 11L12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  paw:'<path d="M12 12.5c-3 0-5 3-5 5 0 1.5 1.3 2 2.4 2 1 0 1.6-.5 2.6-.5s1.6.5 2.6.5c1.1 0 2.4-.5 2.4-2 0-2-2-5-5-5z"/><circle cx="5.8" cy="10.2" r="1.7"/><circle cx="9.2" cy="6.2" r="1.7"/><circle cx="14.8" cy="6.2" r="1.7"/><circle cx="18.2" cy="10.2" r="1.7"/>',
  mountain:'<path d="M2.5 19.5l6.5-11 4 6.2 2-3 6.5 7.8z"/><path d="M7.2 11.6l1.8 1.2 1.6-1"/>',
  grip:'<circle cx="9" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.1" fill="currentColor" stroke="none"/>',
  x:'<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  repeat:'<path d="M16.5 3l3 3-3 3M4.5 11V9.5A3.5 3.5 0 0 1 8 6h11.5M7.5 21l-3-3 3-3M19.5 13v1.5A3.5 3.5 0 0 1 16 18H4.5"/>',
  snooze:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 2M5 3.5L2.5 6M19 3.5L21.5 6"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>', down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  gift:'<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.6-3.6-5.5-3.8-5.5-1.5C6.5 8 10 8 12 8zm0 0c1.6-3.6 5.5-3.8 5.5-1.5C17.5 8 14 8 12 8z"/>',
  cart:'<path d="M3 4h2.2l2.3 10.5h10.8L20.5 7.5H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  book:'<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>',
  film:'<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M7.5 4v16M16.5 4v16M3.5 9h4M3.5 15h4M16.5 9h4M16.5 15h4"/>',
  tv:'<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M8.5 2.5l3.5 4 3.5-4"/>',
  star:'<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  rings:'<circle cx="9" cy="14.5" r="5.5"/><circle cx="15" cy="14.5" r="5.5"/><path d="M10 4l2 3 2-3"/>',
  pot:'<path d="M4.5 10h15v5.5a4.5 4.5 0 0 1-4.5 4.5H9a4.5 4.5 0 0 1-4.5-4.5zM2.5 10h2M19.5 10h2M9.5 6.5c0-1 1-1.2 1-2.5M14 6.5c0-1 1-1.2 1-2.5"/>',
  drop:'<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>',
  person:'<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c0-3.8 3.4-6 7.5-6s7.5 2.2 7.5 6"/>',
  social:'<circle cx="9" cy="8.5" r="3.3"/><path d="M2.8 19.5c0-3.4 2.8-5.4 6.2-5.4s6.2 2 6.2 5.4"/><path d="M15.5 5.6a3.3 3.3 0 0 1 0 6M17.5 14.4c2.2.6 3.7 2.4 3.7 5.1"/>',
  dog:'<path d="M5 10.5V6l3 2h8l3-2v4.5c1.8 1.2 2.5 3 2.5 5.3 0 3-3 5-9.5 5S2.5 18.8 2.5 15.8c0-2.3.7-4.1 2.5-5.3z"/><path d="M9.5 13.5h.01M14.5 13.5h.01M11 17h2"/>',
  cat:'<path d="M4.5 20.5V8.5L7 4l3.2 4h3.6L17 4l2.5 4.5v12z"/><path d="M9.3 13.5h.01M14.7 13.5h.01M11 16.8h2"/>',
  med:'<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
  pill:'<path d="M10.6 3.9a4.9 4.9 0 0 1 6.9 6.9l-6.7 6.7a4.9 4.9 0 0 1-6.9-6.9z"/><path d="M7.3 10.2l6.5 6.5"/>',
  drum:'<ellipse cx="12" cy="9" rx="8" ry="3"/><path d="M4 9v7c0 1.7 3.6 3 8 3s8-1.3 8-3V9M15.5 3l-3.5 6M8.5 3l3.5 6"/>',
  chat:'<path d="M4.5 5h15v10.5H10l-5.5 4z"/>',
  shoe:'<path d="M3 17.5v-6l4-1 2.8-5 2.2 1-.9 3.8 8.6 3c.9.3 1.3 1.2 1.3 2.2v2zM3 20.5h18"/>',
  lotus:'<path d="M12 20c-5 0-9-2.8-9-6 3.2 0 6.4 1.2 9 6zM12 20c5 0 9-2.8 9-6-3.2 0-6.4 1.2-9 6zM12 20c-2-3-3-5.6-3-8.6C9 8.3 12 5 12 5s3 3.3 3 6.4c0 3-1 5.6-3 8.6z"/>',
  hourglass:'<path d="M6.5 3h11M6.5 21h11M8 3v3.2l4 5.3 4-5.3V3M8 21v-3.2l4-5.3 4 5.3V21"/>',
  receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.7-7.7a4 4 0 0 0-2-2z"/>',
  car:'<path d="M3.5 16v-4l2-5h13l2 5v4z"/><path d="M3.5 16v3h3v-3M17.5 16v3h3v-3M7.5 12.5h.01M16.5 12.5h.01"/>',
  phone:'<path d="M5 3.5h3.5l1.7 4.3-2.2 1.4a11 11 0 0 0 6.8 6.8l1.4-2.2 4.3 1.7V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5z"/>',
  spark:'<path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M6 6l2.6 2.6M15.4 15.4L18 18M6 18l2.6-2.6M15.4 8.6L18 6"/>',
  target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
  laptop:'<rect x="5" y="5" width="14" height="10" rx="1.5"/><path d="M2.5 19h19"/>',
  pin:'<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  folder:'<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
};

/** One art icon layer: SVG element, its attributes, palette class suffix (`ac-<color>`). */
type ArtLayer = readonly [element: string, attributes: string, color: string];
/** Art icon name -> layers, back to front. */
const ART_ICON_LAYERS: Readonly<Record<string, readonly ArtLayer[]>> = {
heart:[['path','d="M12 20.5s-8.5-4.8-8.5-11.3A4.7 4.7 0 0 1 12 6.3a4.7 4.7 0 0 1 8.5 2.9c0 6.5-8.5 11.3-8.5 11.3z"','warm']],
pill:[['path','d="M12 8H7.6a4 4 0 0 0 0 8H12z" transform="rotate(-45 12 12)"','warm'],['path','d="M12 8h4.4a4 4 0 0 1 0 8H12z" transform="rotate(-45 12 12)"','paper']],
coin:[['circle','cx="12" cy="12" r="8.6"','sun'],['circle','cx="12" cy="12" r="5.4"','sunD'],['rect','x="11.1" y="8.6" width="1.8" height="6.8" rx=".9"','sun']],
house:[['path','d="M5.5 10.8V20.5h13v-9.7"','paper'],['path','d="M2.8 11.8L12 4l9.2 7.8z"','warm'],['rect','x="10.2" y="14.6" width="3.6" height="5.9" rx=".5"','earth'],['rect','x="14.9" y="12.8" width="2.4" height="2.4" rx=".3"','sky']],
dog:[['ellipse','cx="6.3" cy="10" rx="2.3" ry="4.3" transform="rotate(22 6.3 10)"','earth'],['ellipse','cx="17.7" cy="10" rx="2.3" ry="4.3" transform="rotate(-22 17.7 10)"','earth'],['ellipse','cx="12" cy="12.8" rx="6.2" ry="6.6"','sun'],['ellipse','cx="12" cy="15.7" rx="3.3" ry="2.6"','paper'],['ellipse','cx="12" cy="14.4" rx="1.3" ry=".95"','ink'],['circle','cx="9.4" cy="11.3" r=".95"','ink'],['circle','cx="14.6" cy="11.3" r=".95"','ink']],
cat:[['path','d="M5 10V3.8l4.2 3.4h5.6L19 3.8V10c1.3 1.4 2 3.1 2 5 0 3.6-3.6 5.8-9 5.8S3 18.6 3 15c0-1.9.7-3.6 2-5z"','warm'],['path','d="M6.4 6.6v2.6l2-1z"','paper'],['path','d="M17.6 6.6v2.6l-2-1z"','paper'],['ellipse','cx="9" cy="13" rx="1" ry="1.3"','ink'],['ellipse','cx="15" cy="13" rx="1" ry="1.3"','ink'],['path','d="M11 15.6h2l-1 1.2z"','earth']],
leaf:[['path','d="M4.5 20C4.5 10.5 10 4.5 20.5 4c0 10.5-6 16-16 16z"','leaf'],['path','d="M5.6 19.4L15.5 9.5l.6.6-9.9 9.9z"','paper']],
sprout:[['path','d="M7 14h10l-1.3 6.5H8.3z"','warm'],['path','d="M12 14c0-4-3-7.5-7.5-7.5 0 4.6 3 7.5 7.5 7.5z"','leaf'],['path','d="M12 11.5c0-3.3 2.4-6.5 7-6.5 0 4-2.4 6.5-7 6.5z"','leafL']],
gift:[['rect','x="4.5" y="11.2" width="15" height="9.3" rx="1"','plum'],['rect','x="3.5" y="8" width="17" height="4" rx="1"','plum'],['rect','x="10.9" y="8" width="2.2" height="12.5"','sun'],['path','d="M12 8c-1.5-3.8-5.8-4-5.8-1.6C6.2 8 9.8 8 12 8zm0 0c1.5-3.8 5.8-4 5.8-1.6C17.8 8 14.2 8 12 8z"','sun']],
chat:[['path','d="M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.5l-5 4v-4H6a2 2 0 0 1-2-2z"','sky'],['circle','cx="8.5" cy="10" r="1.15"','paper'],['circle','cx="12" cy="10" r="1.15"','paper'],['circle','cx="15.5" cy="10" r="1.15"','paper']],
car:[['path','d="M3 16.5v-4l2.2-5.2A2 2 0 0 1 7 6h10a2 2 0 0 1 1.8 1.3l2.2 5.2v4z"','warm'],['path','d="M6.6 11.5l1.4-3.6h8l1.4 3.6z"','paper'],['circle','cx="7.3" cy="17" r="2.2"','ink'],['circle','cx="16.7" cy="17" r="2.2"','ink'],['circle','cx="5" cy="13.9" r=".9"','sun'],['circle','cx="19" cy="13.9" r=".9"','sun']],
laptop:[['rect','x="4.5" y="4.5" width="15" height="11" rx="1.5"','sky'],['rect','x="6.2" y="6.2" width="11.6" height="7.6" rx=".5"','paper'],['path','d="M2 17.5h20l-1.4 2.3H3.4z"','earth']],
mountain:[['circle','cx="17.5" cy="6.5" r="2.6"','sun'],['path','d="M2 20.5l7-12 4.3 6.8 2.4-3.4 6.3 8.6z"','leaf'],['path','d="M7.1 11.7L9 8.5l1.9 3-1.9 1.2z"','paper']],
book:[['path','d="M5.5 4.8A2 2 0 0 1 7.5 2.8h11.3v16H7.5a2 2 0 0 0-2 2z"','plum'],['path','d="M5.5 20.8a2 2 0 0 1 2-2h11.3v2.6H7.5a2 2 0 0 1-2-.6z"','paper'],['rect','x="9" y="6.5" width="6.5" height="1.6" rx=".8"','paper']],
wave:[['path','d="M2 21v-6.5c1.6-4.6 5.2-8.3 10.6-8.3 3.3 0 5.6 1.6 6.4 4-2.4-.9-5.2.2-5.4 2.8-.2 2.3 2.1 3.6 4.4 3 1.6-.4 2.9-.2 4 .5V21z"','sky'],['path','d="M13.6 13c.2-2.6 3-3.7 5.4-2.8-.8-2.4-3.1-4-6.4-4-2 0-3.8.5-5.2 1.5 3-.4 5.3.7 6.2 5.3z"','paper']],
spark:[['path','d="M10 2.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z"','sun'],['path','d="M17.5 13.5c.4 2 1.1 2.7 3 3-1.9.4-2.6 1.1-3 3-.4-1.9-1.1-2.6-3-3 1.9-.3 2.6-1 3-3z"','warm']],
med:[['rect','x="8.8" y="3.5" width="6.4" height="4.5" rx="1.2"','earth'],['rect','x="3.5" y="6.5" width="17" height="13.5" rx="2"','warm'],['path','d="M10.6 9.6h2.8v2.6H16V15h-2.6v2.6h-2.8V15H8v-2.8h2.6z"','paper']],
receipt:[['path','d="M5.5 2.8h13v18.5l-2.2-1.5-2.1 1.5-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5z"','paper'],['rect','x="8.3" y="6.6" width="7.4" height="1.6" rx=".8"','sunD'],['rect','x="8.3" y="9.8" width="5" height="1.6" rx=".8"','sunD'],['circle','cx="15.2" cy="15.4" r="2.8"','leaf']],
wrench:[['path','d="M15.2 3.6a4.6 4.6 0 0 0-1.4 5.3L4.4 18.3a2 2 0 0 0 2.8 2.8l9.4-9.4a4.6 4.6 0 0 0 5.3-1.4l-2.7-.7-.8-2.7 2.7-.8a4.6 4.6 0 0 0-5.9-2.5z"','sky']],
rings:[['path','fill-rule="evenodd" d="M9 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11zm0 1.9a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 1 1 0-7.2z"','sun'],['path','fill-rule="evenodd" d="M15 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11zm0 1.9a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 1 1 0-7.2z"','sunD'],['path','d="M13.1 4.6h3.8l1.3 1.6L15 9.1l-3.2-2.9z"','sky']],
phone:[['rect','x="6.5" y="2.5" width="11" height="19" rx="2.2"','plum'],['rect','x="8" y="5" width="8" height="12.5" rx=".6"','paper'],['circle','cx="12" cy="19.4" r=".9"','paper']],
lotus:[['path','d="M12 20c-5 0-9-2.8-9-6 3.2 0 6.4 1.2 9 6z"','warm'],['path','d="M12 20c5 0 9-2.8 9-6-3.2 0-6.4 1.2-9 6z"','warm'],['path','d="M12 20c-2-3-3-5.6-3-8.6C9 8.3 12 5 12 5s3 3.3 3 6.4c0 3-1 5.6-3 8.6z"','plum']],
target:[['circle','cx="12" cy="12" r="9"','warm'],['circle','cx="12" cy="12" r="6.2"','paper'],['circle','cx="12" cy="12" r="3.5"','warm'],['circle','cx="12" cy="12" r="1.1"','paper']],
paw:[['path','d="M12 12.3c-3.1 0-5.2 3-5.2 5.2 0 1.6 1.4 2.2 2.6 2.2 1 0 1.6-.5 2.6-.5s1.6.5 2.6.5c1.2 0 2.6-.6 2.6-2.2 0-2.2-2.1-5.2-5.2-5.2z"','earth'],['ellipse','cx="5.6" cy="10.4" rx="1.8" ry="2.2"','earth'],['ellipse','cx="9.2" cy="6.4" rx="1.8" ry="2.3"','earth'],['ellipse','cx="14.8" cy="6.4" rx="1.8" ry="2.3"','earth'],['ellipse','cx="18.4" cy="10.4" rx="1.8" ry="2.2"','earth']],
person:[['path','d="M4.5 20.5c0-3.9 3.4-6.2 7.5-6.2s7.5 2.3 7.5 6.2z"','sky'],['circle','cx="12" cy="8.3" r="3.9"','sun']],
drum:[['rect','x="13.6" y="1.6" width="1.6" height="9" rx=".8" transform="rotate(32 14.4 6.1)"','earth'],['rect','x="8.8" y="1.6" width="1.6" height="9" rx=".8" transform="rotate(-32 9.6 6.1)"','earth'],['path','d="M4 10v7.4c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9V10"','warm'],['path','d="M4 14.2c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9v1.6c0 1.6-3.6 2.9-8 2.9s-8-1.3-8-2.9z"','sunD'],['ellipse','cx="12" cy="10" rx="8" ry="2.8"','paper']],
shoe:[['path','d="M3 17.5v-6.3c0-.7.6-1.2 1.3-1.1L8 10.6l2.5-3.1 3.5 2.6c1.1.8 2.4 1.3 3.8 1.5l2.4.4c.9.2 1.8 1 1.8 2v3.5z"','sky'],['path','d="M9.6 10.5l1.4-1.7 1.3 1-1.4 1.7zM11.6 12l1.4-1.7 1.3 1-1.4 1.7z"','paper'],['rect','x="2.5" y="16.5" width="19.5" height="3.2" rx="1.3"','paper'],['path','d="M15.5 12.6c1.6.6 3.3.9 5 1.1l.6 1.6h-6.4z"','warm']],
flame:[['path','d="M12 21.5c-4 0-7-2.7-7-6.5 0-4.5 4.3-6.5 4.8-11.5 3 1.6 4.6 4.2 4.6 6.6.9-.6 1.5-1.6 1.7-2.8 2 1.8 2.9 4.5 2.9 7.2 0 4-3 7-7 7z"','warm'],['path','d="M12 21.5c-2 0-3.4-1.3-3.4-3.2 0-2.3 2-3.4 2.6-5.6 2.3 1.2 4.2 3.2 4.2 5.6 0 1.9-1.4 3.2-3.4 3.2z"','sun']],
drop:[['path','d="M12 2.8s6.5 7.2 6.5 11.7a6.5 6.5 0 0 1-13 0C5.5 10 12 2.8 12 2.8z"','sky'],['ellipse','cx="9.6" cy="14.8" rx="1.1" ry="1.8"','paper']],
cart:[['circle','cx="10.4" cy="6.2" r="2.2"','leaf'],['circle','cx="15" cy="5.8" r="2.4"','sun'],['path','d="M2.5 3.3h3.2l3 11.3h10v1.6H7.6L4.6 4.9H2.5z"','earth'],['path','d="M5.6 7.3h15l-1.8 6.6a1.5 1.5 0 0 1-1.5 1.1H8.3z"','warm'],['circle','cx="9" cy="19.2" r="1.7"','ink'],['circle','cx="17" cy="19.2" r="1.7"','ink']],
star:[['path','d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"','sun']],
pot:[['rect','x="1.6" y="12" width="3.4" height="1.9" rx=".95"','earth'],['rect','x="19" y="12" width="3.4" height="1.9" rx=".95"','earth'],['rect','x="10.4" y="6.6" width="3.2" height="2.6" rx="1"','earth'],['path','d="M4 10.5h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"','warm'],['rect','x="3" y="8.6" width="18" height="2.8" rx="1.4"','sky']],
film:[['rect','x="3" y="9" width="18" height="11.5" rx="1.5"','plum'],['path','d="M3.2 5.6l16.9-2.9.6 3.4L3.8 9z"','paper'],['path','d="M6.4 5.2l2.4-.4.9 3-2.4.4zM11.2 4.4l2.4-.4.9 3-2.4.4zM16 3.6l2.4-.4.9 3-2.4.4z"','ink'],['rect','x="6" y="12.8" width="8.5" height="1.6" rx=".8"','paper'],['rect','x="6" y="15.8" width="5" height="1.6" rx=".8"','paper']],
tv:[['path','d="M7.3 3.1l.9-.8 3.8 3.3 3.8-3.3.9.8L12 7.4z"','earth'],['rect','x="3" y="6.4" width="18" height="12.6" rx="2"','earth'],['rect','x="5" y="8.4" width="11" height="8.6" rx="1"','sky'],['circle','cx="18.5" cy="10.4" r="1"','sun'],['circle','cx="18.5" cy="13.8" r="1"','paper'],['rect','x="6" y="19" width="2.4" height="2" rx=".5"','earth'],['rect','x="15.6" y="19" width="2.4" height="2" rx=".5"','earth']],
hourglass:[['path','d="M6.5 4.9h11c0 3.5-2.5 5.3-4.3 7.1 1.8 1.8 4.3 3.6 4.3 7.1h-11c0-3.5 2.5-5.3 4.3-7.1C9 10.2 6.5 8.4 6.5 4.9z"','paper'],['path','d="M8.6 7.4h6.8c-.6 1.3-1.9 2.4-3.4 3.6-1.5-1.2-2.8-2.3-3.4-3.6z"','sun'],['path','d="M8 19.1c.4-1.9 2.2-3.2 4-3.8 1.8.6 3.6 1.9 4 3.8z"','sun'],['rect','x="5" y="2.5" width="14" height="2.6" rx="1"','earth'],['rect','x="5" y="18.9" width="14" height="2.6" rx="1"','earth']],
pin:[['path','d="M12 21.5s-6.8-6.4-6.8-11.6a6.8 6.8 0 0 1 13.6 0c0 5.2-6.8 11.6-6.8 11.6z"','warm'],['circle','cx="12" cy="9.8" r="2.6"','paper']],
list:[['rect','x="4.5" y="3.5" width="15" height="18" rx="2"','earth'],['rect','x="6.5" y="6" width="11" height="13.5" rx=".6"','paper'],['rect','x="9" y="2.3" width="6" height="3.4" rx="1"','sky'],['circle','cx="9" cy="9.8" r="1.1"','leaf'],['rect','x="11" y="9.1" width="4.8" height="1.4" rx=".7"','sunD'],['circle','cx="9" cy="13.2" r="1.1"','leaf'],['rect','x="11" y="12.5" width="4.8" height="1.4" rx=".7"','sunD'],['circle','cx="9" cy="16.6" r="1.1"','warm'],['rect','x="11" y="15.9" width="3.4" height="1.4" rx=".7"','sunD']],
sun:[...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => ['rect', `x="11.1" y="1.4" width="1.8" height="3.8" rx=".9" transform="rotate(${String(a)} 12 12)"`, 'sunD'] as const),['circle','cx="12" cy="12" r="5"','sun']],
calendar:[['rect','x="3.5" y="5" width="17" height="15.5" rx="2"','paper'],['path','d="M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3h-17z"','warm'],['rect','x="7.2" y="2.8" width="1.9" height="4.4" rx=".95"','earth'],['rect','x="14.9" y="2.8" width="1.9" height="4.4" rx=".95"','earth'],['rect','x="6.5" y="12.4" width="3" height="2.8" rx=".6"','sky'],['rect','x="10.6" y="12.4" width="3" height="2.8" rx=".6"','sunD'],['rect','x="14.6" y="12.4" width="3" height="2.8" rx=".6"','sunD'],['rect','x="6.5" y="16" width="3" height="2.8" rx=".6"','sunD']],
social:[['path','d="M11.5 18.5c0-3.3 2.3-5.2 5.3-5.2s5.2 1.9 5.2 5.2z"','plum'],['circle','cx="16.8" cy="8.8" r="3"','sunD'],['path','d="M2 20.5c0-3.7 3-6 6.6-6s6.6 2.3 6.6 6z"','sky'],['circle','cx="8.6" cy="9.4" r="3.6"','sun']]
};

const ariaOf = (label: string | undefined): string => (label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"');

function artIconSvg(layers: readonly ArtLayer[], size: number, label: string | undefined): string {
  return `<svg class="i art" style="--s:${String(size)}px" viewBox="0 0 24 24" ${ariaOf(label)}><g class="art-sh" transform="translate(.8 1.1)">${layers.map(([element, attributes]) => `<${element} ${attributes}/>`).join('')}</g>${layers.map(([element, attributes, color]) => `<${element} ${attributes} class="ac-${color}"/>`).join('')}</svg>`;
}

/** An icon as SVG markup: the art icon when there is one, else the line icon (unknown names draw `spark`). */
export function icon(name: string, size = 22, label?: string): string {
  const layers = ART_ICON_LAYERS[name];
  if (layers) return artIconSvg(layers, size, label);
  return `<svg class="i" style="--s:${String(size)}px" viewBox="0 0 24 24" ${ariaOf(label)}>${LINE_ICON_PATHS[name] ?? LINE_ICON_PATHS['spark'] ?? ''}</svg>`;
}

export const hasLineIcon = (name: string): boolean => Object.hasOwn(LINE_ICON_PATHS, name);
