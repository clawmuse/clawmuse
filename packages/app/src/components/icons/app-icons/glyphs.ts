/**
 * The app's icon drawings, keyed by the Lucide icon each one replaces.
 *
 * Lucide draws for a 2-unit stroke; the app renders at `ICON_STROKE_WIDTH` (2.5), which closes
 * Lucide's 2-unit gaps and blurs dense glyphs. These share one grid built for the heavier stroke:
 * - 24-unit box. Round bodies use r=9.5; square bodies are 17×17 at (3.5, 3.5) with rx=3.
 * - Parallel strokes sit about 5 units apart, leaving at least a 2.5-unit gap.
 * - Arrowheads and chevrons are right angles; arrow shafts run 14 units.
 * - Dots are zero-length round-capped strokes, so they follow the stroke width.
 * - Glyphs too dense for the grid (gear, brain, bug, puzzle) are simplified, not shrunk.
 *
 * Plain data so a script can render a contact sheet of every glyph without React Native.
 */
export type GlyphElement = "path" | "circle" | "rect" | "line" | "ellipse";
export type GlyphNode = [element: GlyphElement, attrs: Record<string, string>][];

const n = (value: number) => String(Math.round(value * 100) / 100);
const p = (d: string): GlyphNode[number] => ["path", { d }];
const c = (cx: number, cy: number, r: number): GlyphNode[number] => [
  "circle",
  { cx: n(cx), cy: n(cy), r: n(r) },
];
const rect = (x: number, y: number, width: number, height: number, rx = 2): GlyphNode[number] => [
  "rect",
  { x: n(x), y: n(y), width: n(width), height: n(height), rx: n(rx) },
];
const dot = (x: number, y: number) => p(`M${n(x)} ${n(y)}h.01`);

function polar(radius: number, degrees: number, cx = 12, cy = 12): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/** Eight arcs of the round body with even gaps. */
function dashedCircle(): GlyphNode {
  const nodes: GlyphNode = [];
  for (let i = 0; i < 8; i++) {
    const [x1, y1] = polar(9.5, i * 45 - 12);
    const [x2, y2] = polar(9.5, i * 45 + 12);
    nodes.push(p(`M${n(x1)} ${n(y1)}A9.5 9.5 0 0 1 ${n(x2)} ${n(y2)}`));
  }
  return nodes;
}

/** A six-tooth gear: fewer, broader teeth than Lucide's so the gaps survive the stroke. */
function gearPath(): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 60;
    for (const [radius, offset] of [
      [6.75, -22],
      [9.5, -12],
      [9.5, 12],
      [6.75, 22],
    ] as const) {
      const [x, y] = polar(radius, a + offset);
      points.push(`${points.length === 0 ? "M" : "L"}${n(x)} ${n(y)}`);
    }
  }
  return `${points.join("")}Z`;
}

function sunRays(): GlyphNode {
  const nodes: GlyphNode = [];
  for (let i = 0; i < 8; i++) {
    const [x1, y1] = polar(7.75, i * 45);
    const [x2, y2] = polar(10, i * 45);
    nodes.push(p(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`));
  }
  return nodes;
}

const CIRCLE = c(12, 12, 9.5);
const SQUARE = rect(3.5, 3.5, 17, 17, 3);
const FILE_BODY = p("M6.5 21.5a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2H14l5.5 5.5v11.5a2 2 0 0 1-2 2z");
const FILE_FOLD = p("M13.5 2.5V7a1 1 0 0 0 1 1h5");
const FOLDER = p(
  "M19.5 19.5a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.4a2 2 0 0 1-1.7-.95l-.8-1.3A2 2 0 0 0 7.9 3.75H4.5a2 2 0 0 0-2 2V17.5a2 2 0 0 0 2 2z",
);
const SHIELD = p(
  "M19.5 12.5c0 5-3.5 7.5-7.2 8.8a1 1 0 0 1-.6 0C8 20 4.5 17.5 4.5 12.5V6.25a1 1 0 0 1 1-1c2 0 4.25-1.1 5.8-2.45a1.1 1.1 0 0 1 1.4 0c1.55 1.35 3.8 2.45 5.8 2.45a1 1 0 0 1 1 1z",
);
const MESSAGE_SQUARE = p(
  "M21 16a2.5 2.5 0 0 1-2.5 2.5H7.5l-3.3 2.75A.75.75 0 0 1 3 20.7V6a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 6z",
);
const COPY_BACK = p("M4.5 15.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2");
const COPY_FRONT = rect(8.5, 8.5, 13, 13, 2.5);
const TRIANGLE = p("M10.27 4a2 2 0 0 1 3.46 0l8 14A2 2 0 0 1 20 21H4a2 2 0 0 1-1.73-3z");
const SEARCH_LENS = c(10.5, 10.5, 7.5);
const SEARCH_HANDLE = p("m16 16 4.75 4.75");
const PACKAGE_BODY = p(
  "M11 21.2a2 2 0 0 0 2 0l6.5-3.75a2 2 0 0 0 1-1.73V8.28a2 2 0 0 0-1-1.73L13 2.8a2 2 0 0 0-2 0L4.5 6.55a2 2 0 0 0-1 1.73v7.44a2 2 0 0 0 1 1.73z",
);
const PACKAGE_SEAMS = [p("M12 21.5V12"), p("M3.8 7.25 12 12l8.2-4.75")];
const PULL_REQUEST_BASE = [c(6, 5.5, 2.75), p("M6 8.25V20.5")];
const SLASH = p("m3 3 18 18");

const GLYPH_TABLE = {
  // Shapes and status marks on the round body.
  circle: [CIRCLE],
  "circle-alert": [CIRCLE, p("M12 7.5v4"), dot(12, 16.5)],
  "circle-check": [CIRCLE, p("m8 12.25 2.75 2.75L16 9.5")],
  "circle-check-big": [p("M21.3 10.25A9.5 9.5 0 1 1 16.75 3.8"), p("m8.5 11 3 3L21 4.5")],
  "circle-x": [CIRCLE, p("m15 9-6 6"), p("m9 9 6 6")],
  "circle-plus": [CIRCLE, p("M12 7.5v9"), p("M7.5 12h9")],
  "circle-slash": [CIRCLE, p("m8.5 15.5 7-7")],
  "circle-dot": [CIRCLE, c(12, 12, 1.5)],
  "circle-dashed": dashedCircle(),
  "circle-gauge": [
    p("M16.01 3.39A9.5 9.5 0 1 0 20.61 7.99"),
    c(12, 12, 2),
    p("m13.5 10.5 4.75-4.75"),
  ],
  "circle-question-mark": [
    CIRCLE,
    p("M9.5 9.25a2.6 2.6 0 0 1 5 1c0 1.75-2.5 2.25-2.5 2.25"),
    dot(12, 16.75),
  ],
  clock: [CIRCLE, p("M12 7v5l3.5 2")],
  info: [CIRCLE, p("M12 16.5v-4.5"), dot(12, 7.5)],
  globe: [CIRCLE, p("M12 2.5a14 14 0 0 0 0 19 14 14 0 0 0 0-19"), p("M2.5 12h19")],
  compass: [CIRCLE, p("m15.5 8.5-2 5-5 2 2-5z")],
  gauge: [p("M4.22 17.95A9.5 9.5 0 1 1 19.78 17.95"), p("m12 13.5 3.75-3.75")],
  target: [CIRCLE, c(12, 12, 4.5), dot(12, 12)],
  "rotate-ccw-clock": [
    p("M3.5 12a8.5 8.5 0 1 0 8.5-8.5 9.2 9.2 0 0 0-6.25 2.6L3.5 8.5"),
    p("M3.5 3.5v5h5"),
    p("M12 7.5V12l3.5 2"),
  ],
  "calendar-clock": [
    p("M20.5 8.5V6.5a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H8"),
    p("M3.5 9.5h5"),
    p("M8 2.5v3.5"),
    p("M16 2.5v3.5"),
    c(16.5, 16.5, 5.25),
    p("M16.5 14.25v2.25l1.5 1"),
  ],
  timer: [c(12, 13.5, 7.75), p("M9.5 2.5h5"), p("m12 13.5 2.75-2.75")],
  "user-round": [c(12, 8, 4.5), p("M19.5 21a7.5 7.5 0 0 0-15 0")],

  // Square body and panels.
  square: [SQUARE],
  "square-dot": [SQUARE, c(12, 12, 1.25)],
  "square-minus": [SQUARE, p("M8 12h8")],
  "square-plus": [SQUARE, p("M8 12h8"), p("M12 8v8")],
  "square-check-big": [
    p("M20.5 11v6.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3h10"),
    p("m8.5 11 3 3L21 4.5"),
  ],
  "square-terminal": [SQUARE, p("m7.75 9.25 2.75 2.75-2.75 2.75"), p("M12.75 15h3.5")],
  "square-pen": [
    p("M11.5 3.5h-5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3v-5"),
    p("M18.25 2.75a1.77 1.77 0 0 1 2.5 2.5l-8.5 8.5-3.5 1 1-3.5z"),
  ],
  "columns-2": [SQUARE, p("M12 3.5v17")],
  "rows-2": [SQUARE, p("M3.5 12h17")],
  "panel-left": [SQUARE, p("M9 3.5v17")],
  "panel-right": [SQUARE, p("M15 3.5v17")],
  image: [SQUARE, c(9, 9, 1.5), p("m20.5 15-3.4-3.4a2 2 0 0 0-2.8 0L6.5 20.5")],
  focus: [
    c(12, 12, 2.75),
    p("M3.5 7.5v-1a3 3 0 0 1 3-3h1"),
    p("M16.5 3.5h1a3 3 0 0 1 3 3v1"),
    p("M20.5 16.5v1a3 3 0 0 1-3 3h-1"),
    p("M7.5 20.5h-1a3 3 0 0 1-3-3v-1"),
  ],
  scan: [
    p("M3.5 7.5v-1a3 3 0 0 1 3-3h1"),
    p("M16.5 3.5h1a3 3 0 0 1 3 3v1"),
    p("M20.5 16.5v1a3 3 0 0 1-3 3h-1"),
    p("M7.5 20.5h-1a3 3 0 0 1-3-3v-1"),
  ],
  maximize: [
    p("M8 3.5H6.5a3 3 0 0 0-3 3V8"),
    p("M20.5 8V6.5a3 3 0 0 0-3-3H16"),
    p("M3.5 16v1.5a3 3 0 0 0 3 3H8"),
    p("M16 20.5h1.5a3 3 0 0 0 3-3V16"),
  ],
  minimize: [
    p("M8.5 3.5v2a3 3 0 0 1-3 3h-2"),
    p("M20.5 8.5h-2a3 3 0 0 1-3-3v-2"),
    p("M3.5 15.5h2a3 3 0 0 1 3 3v2"),
    p("M15.5 20.5v-2a3 3 0 0 1 3-3h2"),
  ],
  "maximize-2": [
    p("M15 3.5h5.5V9"),
    p("m20.5 3.5-6.5 6.5"),
    p("m3.5 20.5 6.5-6.5"),
    p("M9 20.5H3.5V15"),
  ],
  "minimize-2": [
    p("m14 10 6.5-6.5"),
    p("M19.5 10H14V4.5"),
    p("m3.5 20.5 6.5-6.5"),
    p("M4.5 14H10v5.5"),
  ],

  // Plain marks.
  check: [p("M19.5 6.5 9 17l-4.5-4.5")],
  x: [p("M18 6 6 18"), p("m6 6 12 12")],
  plus: [p("M5 12h14"), p("M12 5v14")],
  ellipsis: [c(5, 12, 1), c(12, 12, 1), c(19, 12, 1)],
  "ellipsis-vertical": [c(12, 5, 1), c(12, 12, 1), c(12, 19, 1)],
  "triangle-alert": [TRIANGLE, p("M12 8.5v4"), dot(12, 16.75)],
  activity: [p("M21.5 12h-3.25l-3 8.5-6.5-17-3 8.5H2.5")],
  "audio-lines": [p("M2.5 10v4"), p("M7 6.5v11"), p("M12 3v18"), p("M17 7.5v9"), p("M21.5 10v4")],
  zap: [p("M13.5 2.5 4.5 13.5h7l-1 8 9-11h-7z")],
  sparkles: [
    p("M10.5 3.5 12.25 10l6.25 1.75-6.25 1.75-1.75 6.5-1.75-6.5-6.25-1.75L8.75 10z"),
    p("M19 2.5v4"),
    p("M21 4.5h-4"),
    dot(19.5, 19.5),
  ],
  star: [
    p(
      "M11.53 2.8a.53.53 0 0 1 .94 0l2.4 4.86a1.5 1.5 0 0 0 1.13.82l5.37.78a.53.53 0 0 1 .3.9l-3.89 3.79a1.5 1.5 0 0 0-.43 1.33l.92 5.35a.53.53 0 0 1-.77.56l-4.8-2.53a1.5 1.5 0 0 0-1.4 0l-4.8 2.53a.53.53 0 0 1-.77-.56l.92-5.35a1.5 1.5 0 0 0-.43-1.33L2.33 10.16a.53.53 0 0 1 .3-.9l5.37-.78a1.5 1.5 0 0 0 1.13-.82z",
    ),
  ],
  moon: [p("M20.5 13.25A8.75 8.75 0 1 1 10.75 3.5a6.75 6.75 0 0 0 9.75 9.75z")],
  sun: [c(12, 12, 3.75), ...sunRays()],
  cloud: [p("M17.5 19H8.5a6.5 6.5 0 1 1 6.3-8.1h2.7a4.05 4.05 0 0 1 0 8.1z")],
  "mouse-pointer-2": [
    p(
      "M4.5 5.2a.55.55 0 0 1 .7-.7l14.6 5.9a.5.5 0 0 1-.06.95l-5.6 1.45a2 2 0 0 0-1.44 1.44l-1.45 5.6a.5.5 0 0 1-.95.06z",
    ),
  ],

  // Arrows, chevrons and motion.
  "chevron-down": [p("m6 9 6 6 6-6")],
  "chevron-up": [p("m18 15-6-6-6 6")],
  "chevron-left": [p("m15 18-6-6 6-6")],
  "chevron-right": [p("m9 18 6-6-6-6")],
  "arrow-down": [p("M12 5v14"), p("m18 13-6 6-6-6")],
  "arrow-up": [p("M12 19V5"), p("m6 11 6-6 6 6")],
  "arrow-left": [p("M19 12H5"), p("m11 18-6-6 6-6")],
  "arrow-right": [p("M5 12h14"), p("m13 6 6 6-6 6")],
  "arrow-up-right": [p("m7 17 9.5-9.5"), p("M7.5 7h9.5v9.5")],
  "arrow-down-to-line": [p("M12 3.5V16"), p("m6.5 10.5 5.5 5.5 5.5-5.5"), p("M5 20.5h14")],
  "arrow-up-to-line": [p("M5 3.5h14"), p("m6.5 13.5 5.5-5.5 5.5 5.5"), p("M12 8v12.5")],
  "arrow-left-to-line": [p("M3.5 5v14"), p("M13.5 6.5 8 12l5.5 5.5"), p("M8 12h12.5")],
  "arrow-right-to-line": [p("M20.5 5v14"), p("m10.5 6.5 5.5 5.5-5.5 5.5"), p("M16 12H3.5")],
  "arrow-down-up": [
    p("m3.5 16 3.5 3.5 3.5-3.5"),
    p("M7 19.5v-15"),
    p("M20.5 8 17 4.5 13.5 8"),
    p("M17 4.5v15"),
  ],
  move: [
    p("M12 2.5v19"),
    p("M2.5 12h19"),
    p("m9 5.5 3-3 3 3"),
    p("m15 18.5-3 3-3-3"),
    p("m18.5 9 3 3-3 3"),
    p("m5.5 9-3 3 3 3"),
  ],
  "corner-down-left": [p("M20 4.5V11a4 4 0 0 1-4 4H4.5"), p("m9.5 10-5 5 5 5")],
  "corner-up-left": [p("M20 19.5V13a4 4 0 0 0-4-4H4.5"), p("M9.5 14 4.5 9l5-5")],
  "undo-2": [p("M9 14 4 9l5-5"), p("M4 9h10.5a5.25 5.25 0 0 1 0 10.5H11")],
  "refresh-ccw": [
    p("M20.5 12A8.5 8.5 0 0 0 12 3.5a9.2 9.2 0 0 0-6.25 2.6L3.5 8.5"),
    p("M3.5 3.5v5h5"),
    p("M3.5 12a8.5 8.5 0 0 0 8.5 8.5 9.2 9.2 0 0 0 6.25-2.6l2.25-2.4"),
    p("M15.5 15.5h5v5"),
  ],
  "rotate-cw": [
    p("M20.5 12A8.5 8.5 0 1 1 12 3.5a9.2 9.2 0 0 1 6.25 2.6l2.25 2.4"),
    p("M20.5 3.5v5h-5"),
  ],
  download: [
    p("M12 14.5v-11"),
    p("m7.5 10 4.5 4.5 4.5-4.5"),
    p("M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"),
  ],
  upload: [
    p("M12 3.5v11"),
    p("M16.5 8 12 3.5 7.5 8"),
    p("M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15"),
  ],
  import: [
    p("M12 3v11"),
    p("m8.5 10.5 3.5 3.5 3.5-3.5"),
    p(
      "M8 5.5H5a2.5 2.5 0 0 0-2.5 2.5v9A2.5 2.5 0 0 0 5 19.5h14a2.5 2.5 0 0 0 2.5-2.5V8A2.5 2.5 0 0 0 19 5.5h-3",
    ),
  ],
  "external-link": [
    p("M15 3.5h5.5V9"),
    p("m10.5 13.5 10-10"),
    p("M17.5 13.5v5a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h5"),
  ],
  send: [p("M21 3 10.5 13.5"), p("M21 3 14.5 21l-4-7.5L3 9.5z")],
  split: [
    p("M15.5 3.5h5v5"),
    p("M8.5 3.5h-5v5"),
    p("M12 21V13.5a4 4 0 0 0-1.17-2.83L3.5 3.5"),
    p("m14.5 9.5 6-6"),
  ],

  // Lists and text.
  menu: [p("M4 6h16"), p("M4 12h16"), p("M4 18h16")],
  "text-align-justify": [p("M3.5 6h17"), p("M3.5 12h17"), p("M3.5 18h17")],
  "list-checks": [
    p("M13.5 6h7"),
    p("M13.5 12h7"),
    p("M13.5 18h7"),
    p("m3.5 6.5 2 2L9 5"),
    p("m3.5 17.5 2 2L9 16"),
  ],
  "list-todo": [
    p("M13.5 6h7"),
    p("M13.5 12h7"),
    p("M13.5 18h7"),
    p("m3.5 17.5 2 2L9 16"),
    rect(3.5, 3.5, 5.5, 5.5, 1.5),
  ],
  "list-chevrons-down-up": [
    p("M3.5 6h7.5"),
    p("M3.5 12h7.5"),
    p("M3.5 18h7.5"),
    p("m14.5 4.5 3.5 3.5 3.5-3.5"),
    p("m14.5 19.5 3.5-3.5 3.5 3.5"),
  ],
  "list-chevrons-up-down": [
    p("M3.5 6h7.5"),
    p("M3.5 12h7.5"),
    p("M3.5 18h7.5"),
    p("m14.5 8 3.5-3.5L21.5 8"),
    p("m14.5 16 3.5 3.5 3.5-3.5"),
  ],
  "list-minus": [p("M15.5 6h-12"), p("M10.5 12h-7"), p("M15.5 18h-12"), p("M20.5 12h-6")],
  "list-plus": [
    p("M15.5 6h-12"),
    p("M10.5 12h-7"),
    p("M15.5 18h-12"),
    p("M17.5 9v6"),
    p("M20.5 12h-6"),
  ],
  "text-wrap": [
    p("M3.5 5.5h17"),
    p("M3.5 12h13.5a3.5 3.5 0 0 1 0 7H13"),
    p("m15.5 16.5-2.5 2.5 2.5 2.5"),
    p("M3.5 18.5h5"),
  ],
  pilcrow: [p("M13 4v16"), p("M17.5 4v16"), p("M19.5 4H9.75a4.5 4.5 0 0 0 0 9H13")],
  type: [
    p("M12 4.5V20"),
    p("M4.5 7.5V6a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19.5 6v1.5"),
    p("M9 20h6"),
  ],
  languages: [
    p("M2.5 5h11"),
    p("M7 2.5v2.5"),
    p("M11 5c-.9 4-3.5 7-7.5 9"),
    p("M5.5 8.5c1.2 2 3 3.75 5.5 5"),
    p("m21.5 21.5-4.5-10-4.5 10"),
    p("M14 18h6"),
  ],
  captions: [
    rect(2.5, 4.5, 19, 15, 3),
    p("M7 14.5h3.5"),
    p("M14.5 14.5h2.5"),
    p("M7 10h2"),
    p("M13 10h4"),
  ],
  summary: [
    p("M15 4.5H7.5"),
    p("M7.5 9.5h11"),
    p("M7.5 14.5h6.5"),
    p("M3.5 4.5V17a2 2 0 0 0 2 2h15.5"),
    p("m18 16 3 3-3 3"),
  ],

  // Files and folders.
  file: [FILE_BODY, FILE_FOLD],
  "file-text": [FILE_BODY, FILE_FOLD, p("M8.5 8.5h2"), p("M8.5 13h7"), p("M8.5 17.5h7")],
  "file-plus": [FILE_BODY, FILE_FOLD, p("M12 11.5v6"), p("M9 14.5h6")],
  "file-diff": [FILE_BODY, p("M12 6.5v6"), p("M9 9.5h6"), p("M9 17h6")],
  "file-exclamation-point": [FILE_BODY, FILE_FOLD, p("M12 11v3"), dot(12, 17.5)],
  "file-symlink": [
    p("M4.5 11V4.5a2 2 0 0 1 2-2H14l5.5 5.5v11.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2"),
    FILE_FOLD,
    p("M2.5 16H12"),
    p("m9 13 3 3-3 3"),
  ],
  files: [
    p("M15 2.5h-4A2 2 0 0 0 9 4.5v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8z"),
    p("M14.5 2.5V7a1 1 0 0 0 1 1H21"),
    p("M5.5 7A2 2 0 0 0 3.5 9v10.5a2 2 0 0 0 2 2H13a2 2 0 0 0 2-2"),
  ],
  folder: [FOLDER],
  "folder-plus": [FOLDER, p("M12 10.5v5.5"), p("M9.25 13.25h5.5")],
  "folder-minus": [FOLDER, p("M9.25 13.25h5.5")],
  "folder-open": [
    p(
      "m6 13.5 1.4-2.7A2 2 0 0 1 9.17 9.75H20a1.8 1.8 0 0 1 1.75 2.25l-1.4 5.5a2.5 2.5 0 0 1-2.4 2H4.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.7.95l.8 1.3a2 2 0 0 0 1.7.95h5.4a2 2 0 0 1 2 2v.75",
    ),
  ],
  "folder-tree": [
    p(
      "M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z",
    ),
    p(
      "M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2a1 1 0 0 0-.8-.4h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1z",
    ),
    p("M3.5 3v13a2 2 0 0 0 2 2H8.5"),
    p("M3.5 7.5h5"),
  ],
  "folder-git-2": [
    p(
      "M9 19.5H4.5a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2h3.4a2 2 0 0 1 1.7.95l.8 1.3a2 2 0 0 0 1.7.95h7.4a2 2 0 0 1 2 2v3.5",
    ),
    c(13.5, 12.5, 2),
    c(19.5, 19, 2),
    p("M13.5 14.5v7"),
    p("M17.5 19a4 4 0 0 1-4-4"),
  ],
  archive: [
    rect(2.5, 3.5, 19, 5, 1.5),
    p("M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10"),
    p("M10 13h4"),
  ],
  inbox: [
    p("M21.5 12.5H16l-1.5 3h-5l-1.5-3H2.5"),
    p(
      "M5.7 5.1 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5l-3.2-7.4A2 2 0 0 0 16.5 4h-9a2 2 0 0 0-1.8 1.1z",
    ),
  ],
  "clipboard-paste": [
    rect(8.5, 2, 7, 4, 1),
    p("M15.5 4H17a2.5 2.5 0 0 1 2.5 2.5V8"),
    p("M8.5 4H7a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 7 22h10.5a2 2 0 0 0 2-1.5"),
    p("M11 14.5h10.5"),
    p("m18 11 3.5 3.5L18 18"),
  ],
  copy: [COPY_FRONT, COPY_BACK],
  "copy-plus": [COPY_FRONT, COPY_BACK, p("M15 12v6"), p("M12 15h6")],
  "copy-x": [COPY_FRONT, COPY_BACK, p("m12.75 12.75 4.5 4.5"), p("m12.75 17.25 4.5-4.5")],
  "book-open": [
    p("M12 6.5V21"),
    p(
      "M2.5 4.5a1 1 0 0 1 1-1h4.5a4 4 0 0 1 4 3 4 4 0 0 1 4-3h4.5a1 1 0 0 1 1 1V17a1 1 0 0 1-1 1H15.5a3.5 3.5 0 0 0-3.5 3 3.5 3.5 0 0 0-3.5-3h-5a1 1 0 0 1-1-1z",
    ),
  ],
  tag: [
    p(
      "M12.6 3.1A2 2 0 0 0 11.17 2.5H4.5a2 2 0 0 0-2 2v6.67a2 2 0 0 0 .6 1.43l8.3 8.3a2.4 2.4 0 0 0 3.4 0l6.1-6.1a2.4 2.4 0 0 0 0-3.4z",
    ),
    dot(7.5, 7.5),
  ],
  paperclip: [
    p(
      "m16 6.5-8 8a1.9 1.9 0 0 0 2.7 2.7l8-8.1a3.85 3.85 0 0 0-5.4-5.45L5.3 11.7a5.8 5.8 0 0 0 8.2 8.2l7-7",
    ),
  ],
  link: [
    p("M10 13a4.8 4.8 0 0 0 7.24.52l2.9-2.9a4.8 4.8 0 0 0-6.79-6.79l-1.6 1.6"),
    p("M14 11a4.8 4.8 0 0 0-7.24-.52l-2.9 2.9a4.8 4.8 0 0 0 6.79 6.79l1.6-1.6"),
  ],
  "link-2": [p("M9 17H7.5a5 5 0 0 1 0-10H9"), p("M15 7h1.5a5 5 0 0 1 0 10H15"), p("M8.5 12h7")],
  unlink: [
    p("m18.5 12.5 1.75-1.75a4.8 4.8 0 0 0-6.8-6.8L11.75 5.7"),
    p("m5.5 11.5-1.75 1.75a4.8 4.8 0 0 0 6.8 6.8l1.7-1.75"),
    p("M8 2.5V5"),
    p("M2.5 8H5"),
    p("M16 19v2.5"),
    p("M19 16h2.5"),
  ],

  // Git and source control.
  "git-branch": [
    c(6, 18.5, 2.75),
    c(18, 5.5, 2.75),
    p("M6 3v12.75"),
    p("M15.25 5.5A9.25 9.25 0 0 0 6 14.75"),
  ],
  "git-commit-horizontal": [c(12, 12, 3.25), p("M2.5 12h6.25"), p("M15.25 12h6.25")],
  "git-merge": [c(6, 5.5, 2.75), c(18, 18.5, 2.75), p("M6 8.25V21"), p("M6 9.5a9 9 0 0 0 9.25 9")],
  "git-pull-request": [
    ...PULL_REQUEST_BASE,
    c(18, 18.5, 2.75),
    p("M18 15.75V8.5a2 2 0 0 0-2-2h-3"),
    p("m15 4-2.5 2.5L15 9"),
  ],
  "git-pull-request-closed": [
    ...PULL_REQUEST_BASE,
    c(18, 18.5, 2.75),
    p("M18 11.5v4.25"),
    p("m15.75 3.25 4.5 4.5"),
    p("m15.75 7.75 4.5-4.5"),
  ],
  "git-pull-request-draft": [...PULL_REQUEST_BASE, c(18, 18.5, 2.75), dot(18, 5.5), dot(18, 10.5)],
  "git-compare-arrows": [
    c(5.5, 5.5, 2.75),
    c(18.5, 18.5, 2.75),
    p("M12 5.5h4.5a2 2 0 0 1 2 2v8.25"),
    p("m14.5 8.5-3-3 3-3"),
    p("M12 18.5H7.5a2 2 0 0 1-2-2V8.25"),
    p("m9.5 15.5 3 3-3 3"),
  ],
  diff: [p("M12 3.5v12"), p("M6 9.5h12"), p("M6 20.5h12")],
  code: [p("m16 18 6-6-6-6"), p("m8 6-6 6 6 6")],
  "code-xml": [p("m18 16 4-4-4-4"), p("m6 8-4 4 4 4"), p("m14.5 4-5 16")],
  terminal: [p("m4.5 17 5.5-5.5-5.5-5.5"), p("M12.5 18.5h7")],
  workflow: [rect(3, 3, 8, 8, 2), rect(13, 13, 8, 8, 2), p("M7 11v4a2 2 0 0 0 2 2h4")],
  network: [
    rect(9, 2.5, 6, 6, 1.5),
    rect(2.5, 15.5, 6, 6, 1.5),
    rect(15.5, 15.5, 6, 6, 1.5),
    p("M5.5 15.5v-2a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v2"),
    p("M12 8.5v4"),
  ],
  blocks: [
    rect(14, 2.5, 7.5, 7.5, 1.5),
    p(
      "M10.5 21.5V8a1 1 0 0 0-1-1h-5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2H15a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2.5",
    ),
  ],
  boxes: [rect(2.5, 13, 8, 8, 1.5), rect(13.5, 13, 8, 8, 1.5), rect(8, 3, 8, 8, 1.5)],
  package: [PACKAGE_BODY, ...PACKAGE_SEAMS, p("m7.75 4.65 8.2 4.75")],
  "package-plus": [
    p(
      "M20.5 11V8.28a2 2 0 0 0-1-1.73L13 2.8a2 2 0 0 0-2 0L4.5 6.55a2 2 0 0 0-1 1.73v7.44a2 2 0 0 0 1 1.73L11 21.2a2 2 0 0 0 2 0l.75-.43",
    ),
    ...PACKAGE_SEAMS,
    p("M19 14.5v6"),
    p("M16 17.5h6"),
  ],
  layers: [
    p(
      "M12.83 2.68a2 2 0 0 0-1.66 0L3.1 6.38a.9.9 0 0 0 0 1.64l8.07 3.7a2 2 0 0 0 1.66 0l8.07-3.7a.9.9 0 0 0 0-1.64z",
    ),
    p("m2.5 12.5 8.67 3.97a2 2 0 0 0 1.66 0l8.67-3.97"),
    p("m2.5 17.25 8.67 3.97a2 2 0 0 0 1.66 0l8.67-3.97"),
  ],

  // Messages and voice.
  "message-square": [MESSAGE_SQUARE],
  "message-square-code": [MESSAGE_SQUARE, p("m9.5 8-2.5 2.5L9.5 13"), p("m14.5 13 2.5-2.5L14.5 8")],
  "message-square-plus": [MESSAGE_SQUARE, p("M12 7.5v6"), p("M9 10.5h6")],
  "message-circle": [p("M7.9 20.1A9.5 9.5 0 1 0 3.9 16.1L2.5 21.5z")],
  mic: [rect(8.75, 2.5, 6.5, 12, 3.25), p("M18.5 10.5v1a6.5 6.5 0 0 1-13 0v-1"), p("M12 18v3.5")],
  "mic-off": [
    p("M15.25 9.5V5.75a3.25 3.25 0 0 0-6-1.73"),
    p("M8.75 9v2.25a3.25 3.25 0 0 0 5.3 2.52"),
    p("M18.5 10.5v1a6.5 6.5 0 0 1-.6 2.73"),
    p("M5.5 10.5v1a6.5 6.5 0 0 0 10.8 4.88"),
    p("M12 18v3.5"),
    SLASH,
  ],
  "mic-vocal": [
    c(15.5, 7.5, 5),
    p("m11.5 10-6.4 7.3a1 1 0 0 0 .05 1.35l.65.65a1 1 0 0 0 1.35.05L14 13"),
    p("M17 21c-1-.75-2.25-1.25-3.5-1.25-2 0-3.5 2-5.5 1.75"),
  ],
  headphones: [
    p("M3.5 18.5V12a8.5 8.5 0 0 1 17 0v6.5"),
    rect(3.5, 13.5, 4.5, 7.5, 2),
    rect(16, 13.5, 4.5, 7.5, 2),
  ],
  bell: [
    p("M4 16h16c-1.5-1.5-2.5-3-2.5-7.5a5.5 5.5 0 0 0-11 0C6.5 13 5.5 14.5 4 16z"),
    p("M9.75 19.75a2.6 2.6 0 0 0 4.5 0"),
  ],
  camera: [
    p(
      "M14.4 4.5a2 2 0 0 1 1.66.89L17 6.75h2.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2H7l.94-1.36A2 2 0 0 1 9.6 4.5z",
    ),
    c(12, 12.75, 3.25),
  ],
  play: [
    p(
      "M6 4.9a1.5 1.5 0 0 1 2.27-1.29l11.5 6.9a1.5 1.5 0 0 1 0 2.58l-11.5 6.9A1.5 1.5 0 0 1 6 19.1z",
    ),
  ],
  pause: [rect(5, 3.5, 4.5, 17, 1.5), rect(14.5, 3.5, 4.5, 17, 1.5)],

  // Devices and infrastructure.
  monitor: [rect(2.5, 3.5, 19, 13, 2.5), p("M8 20.5h8"), p("M12 16.5v4")],
  laptop: [rect(4.5, 3.5, 15, 10, 2), p("M3.5 19.5h17")],
  smartphone: [rect(5.5, 2.5, 13, 19, 2.5), dot(12, 17.5)],
  tablet: [rect(4.5, 2.5, 15, 19, 2.5), dot(12, 17.5)],
  server: [rect(2.5, 5.5, 19, 13, 2.5), dot(6.5, 10), dot(6.5, 14)],
  "hard-drive": [
    p("M2.5 12.5v5a2.5 2.5 0 0 0 2.5 2.5h14a2.5 2.5 0 0 0 2.5-2.5v-5"),
    p("M21.5 12.5H2.5l3.05-6.85A2 2 0 0 1 7.37 4.5h9.26a2 2 0 0 1 1.82 1.15z"),
    dot(6.5, 16.25),
    dot(10, 16.25),
  ],
  cpu: [
    rect(4.5, 4.5, 15, 15, 2.5),
    rect(9, 9, 6, 6, 1),
    p("M9 2v2.5"),
    p("M15 2v2.5"),
    p("M9 19.5V22"),
    p("M15 19.5V22"),
    p("M2 9h2.5"),
    p("M2 15h2.5"),
    p("M19.5 9H22"),
    p("M19.5 15H22"),
  ],
  database: [
    ["ellipse", { cx: "12", cy: "5.5", rx: "8.5", ry: "3" }],
    p("M3.5 5.5v13a8.5 3 0 0 0 17 0v-13"),
    p("M3.5 12a8.5 3 0 0 0 17 0"),
  ],
  keyboard: [
    rect(2.5, 4.5, 19, 15, 2.5),
    dot(7, 9),
    dot(10.5, 9),
    dot(14, 9),
    dot(17.5, 9),
    dot(8.75, 12.25),
    dot(12.25, 12.25),
    dot(15.75, 12.25),
    p("M8 15.75h8"),
  ],
  "keyboard-off": [
    p("M9.5 4.5h9.5a2.5 2.5 0 0 1 2.5 2.5v9"),
    p("M18.5 19.5H5A2.5 2.5 0 0 1 2.5 17V7A2.5 2.5 0 0 1 5 4.5"),
    dot(7, 9),
    dot(14, 9),
    dot(17.5, 9),
    p("M8 15.75h7"),
    SLASH,
  ],
  "qr-code": [
    rect(3, 3, 6, 6, 1.5),
    rect(15, 3, 6, 6, 1.5),
    rect(3, 15, 6, 6, 1.5),
    p("M15 15h3v3"),
    dot(21, 15),
    dot(15, 21),
    p("M18 21h3v-3"),
    dot(12, 3.5),
    dot(3.5, 12),
    dot(12, 12),
  ],
  plug: [
    p("M12 21.5v-4.5"),
    p("M9 7.5v-5"),
    p("M15 7.5v-5"),
    p("M6.5 7.5h11v4.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 6.5 12z"),
  ],
  bot: [
    rect(4.5, 8, 15, 12, 2.5),
    p("M12 8V4H9"),
    p("M2.5 14h2"),
    p("M19.5 14h2"),
    p("M9.25 12.5v3"),
    p("M14.75 12.5v3"),
  ],
  house: [
    p(
      "M3.5 10a2 2 0 0 1 .7-1.5l6.5-5.6a2 2 0 0 1 2.6 0l6.5 5.6a2 2 0 0 1 .7 1.5v9a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2z",
    ),
    p("M9.5 21v-6.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V21"),
  ],

  // Shields and permissions.
  shield: [SHIELD],
  "shield-alert": [SHIELD, p("M12 7.5V11"), dot(12, 15.5)],
  "shield-check": [SHIELD, p("m9 11.75 2 2 4-4")],
  "shield-plus": [SHIELD, p("M9 11.75h6"), p("M12 8.75v6")],
  "shield-ellipsis": [SHIELD, dot(8, 11.75), dot(12, 11.75), dot(16, 11.75)],
  "shield-question-mark": [
    SHIELD,
    p("M9.75 9a2.4 2.4 0 0 1 4.6 1c0 1.5-2.35 2-2.35 2"),
    dot(12, 15.75),
  ],
  "shield-off": [
    p(
      "M19.4 14.4c.07-.6.1-1.23.1-1.9V6.25a1 1 0 0 0-1-1c-2 0-4.25-1.1-5.8-2.45a1.1 1.1 0 0 0-1.4 0 12.5 12.5 0 0 1-1.95 1.4",
    ),
    p("M5.5 5.25a1 1 0 0 0-1 1v6.25c0 5 3.5 7.5 7.2 8.8a1 1 0 0 0 .6 0c2.1-.73 4-1.8 5.25-3.35"),
    SLASH,
  ],
  eye: [
    p("M2.5 12.35a.9.9 0 0 1 0-.7 10.3 10.3 0 0 1 19 0 .9.9 0 0 1 0 .7 10.3 10.3 0 0 1-19 0z"),
    c(12, 12, 2.75),
  ],
  "eye-off": [
    p("M10.75 5.2A10.3 10.3 0 0 1 21.5 11.65a.9.9 0 0 1 0 .7 10.5 10.5 0 0 1-1.4 2.4"),
    p("M14.1 14.1a2.75 2.75 0 0 1-4.2-4.2"),
    p("M17.4 17.4A10.3 10.3 0 0 1 2.5 12.35a.9.9 0 0 1 0-.7 10.3 10.3 0 0 1 4.15-4.95"),
    SLASH,
  ],
  pin: [
    p("M12 16.5v5"),
    p(
      "M9 10.6a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.1v.4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.4a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7a1 1 0 0 1 1-1 1.75 1.75 0 0 0 0-3.5H8a1.75 1.75 0 0 0 0 3.5 1 1 0 0 1 1 1z",
    ),
  ],
  "pin-off": [
    p("M12 16.5v5"),
    p("M15 9.5V7a1 1 0 0 1 1-1 1.75 1.75 0 0 0 0-3.5H8"),
    p("M9 9v1.6a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.1v.4a1 1 0 0 0 1 1h10.5"),
    SLASH,
  ],

  // Tools and objects. Simplified where Lucide's detail cannot hold the 2.5 stroke.
  settings: [p(gearPath()), c(12, 12, 2.75)],
  "settings-2": [
    p("M3.5 7h7.5"),
    p("M19 7h1.5"),
    c(15.5, 7, 3),
    p("M3.5 17H5"),
    p("M13 17h7.5"),
    c(8.5, 17, 3),
  ],
  search: [SEARCH_LENS, SEARCH_HANDLE],
  "zoom-in": [SEARCH_LENS, SEARCH_HANDLE, p("M10.5 8v5"), p("M8 10.5h5")],
  "zoom-out": [SEARCH_LENS, SEARCH_HANDLE, p("M8 10.5h5")],
  trash: [
    p("M3.5 6h17"),
    p("M18.5 6v13.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6"),
    p("M8.5 6V4.5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2V6"),
    p("M10 11v5.5"),
    p("M14 11v5.5"),
  ],
  pencil: [p("M17.5 3.5a2.12 2.12 0 0 1 3 3L7.5 19.5l-4.5 1.5 1.5-4.5z"), p("m15 6 3 3")],
  scissors: [
    c(6, 6, 2.75),
    c(6, 18, 2.75),
    p("M8 8l4 4"),
    p("M20.5 3.5 8 16"),
    p("m14.75 14.75 5.75 5.75"),
  ],
  hammer: [
    p("m14 11.5-9 9a1.77 1.77 0 0 1-2.5-2.5l9-9"),
    p(
      "M9.5 3h3.25a6 6 0 0 1 4.25 1.75l1.5 1.5a2 2 0 0 1 .6 1.42V8.5l2.4 2.4-3 3-2.4-2.4H15a2 2 0 0 1-1.42-.58L11 8.5V6.5z",
    ),
  ],
  wrench: [
    p(
      "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.9 7.9l-7.1 7.1a2.12 2.12 0 0 1-3-3l7.1-7.1a6 6 0 0 1 7.9-7.9z",
    ),
  ],
  "flask-conical": [
    p(
      "M14 2.5V8.4a2 2 0 0 0 .25.96l5.4 9.9A1.5 1.5 0 0 1 18.33 21.5H5.67a1.5 1.5 0 0 1-1.32-2.24l5.4-9.9A2 2 0 0 0 10 8.4V2.5",
    ),
    p("M8.5 2.5h7"),
    p("M7 15.5h10"),
  ],
  "test-tube": [p("M14.5 2.5v17a2.5 2.5 0 0 1-5 0v-17"), p("M8 2.5h8"), p("M14.5 15h-5")],
  microscope: [
    p("M3.5 21.5h17"),
    p("M14 21.5a7 7 0 0 0 0-14"),
    p("M6.5 18h7.5"),
    p("M9 12.5a2 2 0 0 1-2-2V6.5h5.5v4a2 2 0 0 1-2 2z"),
    p("M8 6.5V3.5a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 1v3"),
  ],
  stethoscope: [
    p("M5 2.5H4.5a2 2 0 0 0-2 2v4a5.5 5.5 0 0 0 11 0v-4a2 2 0 0 0-2-2H11"),
    p("M8 14v1a5.5 5.5 0 0 0 11 0v-3"),
    c(19, 9.5, 2.25),
  ],
  bug: [
    p("M9 7.5V6.5a3 3 0 0 1 6 0v1"),
    p("M8.5 7.5h7a2.5 2.5 0 0 1 2.5 2.5v4a6 6 0 0 1-12 0v-4a2.5 2.5 0 0 1 2.5-2.5z"),
    p("M12 12v8"),
    p("M2.5 13H6"),
    p("M18 13h3.5"),
    p("M3.5 7.5 6 9"),
    p("M20.5 7.5 18 9"),
    p("M3.5 19.5 6.5 17"),
    p("M20.5 19.5 17.5 17"),
  ],
  brain: [
    p("M12 5.5v15"),
    p(
      "M12 5.5a3 3 0 0 0-5.8-1A3.5 3.5 0 0 0 3.6 9.4 3.75 3.75 0 0 0 4.5 16a3.75 3.75 0 0 0 7.5 3.5",
    ),
    p(
      "M12 5.5a3 3 0 0 1 5.8-1 3.5 3.5 0 0 1 2.6 4.9 3.75 3.75 0 0 1-.9 6.6 3.75 3.75 0 0 1-7.5 3.5",
    ),
  ],
  puzzle: [
    p(
      "M4.5 7.5a1 1 0 0 1 1-1h3a2.5 2.5 0 1 1 5 0h3a1 1 0 0 1 1 1v3a2.5 2.5 0 1 1 0 5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z",
    ),
  ],
  rocket: [
    p("M9.5 15.5 7.5 13.5c1.75-5 5.5-9.5 13-11-1.5 7.5-6 11.25-11 13z"),
    p("M7.5 13.5H3.75s.5-3 2-4c1.5-1 4.75-.25 4.75-.25"),
    p("M10.5 16.5v3.75s3-.5 4-2c1-1.5.25-4.75.25-4.75"),
    p("M5 16.5c-1.5 1.25-2 4.5-2 4.5s3.25-.5 4.5-2"),
  ],
  palette: [
    p(
      "M12 21.5a9.5 9.5 0 1 1 9.5-9.5 4.5 4.5 0 0 1-4.5 4.5h-2a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",
    ),
    dot(8, 8.5),
    dot(13, 6.75),
    dot(17, 10.5),
    dot(6.75, 13.5),
  ],
  feather: [
    p("M12.5 19.5H5V12l6.5-6.5a5.3 5.3 0 0 1 7.5 7.5z"),
    p("M16 8 2.5 21.5"),
    p("M17 15.5H9"),
  ],
  gift: [
    rect(3, 7.5, 18, 4, 1.25),
    p("M19.5 11.5v8a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5v-8"),
    p("M12 7.5V21"),
    p("M12 7.5C11 5 9.5 3 7.75 3a2.25 2.25 0 0 0 0 4.5"),
    p("M12 7.5C13 5 14.5 3 16.25 3a2.25 2.25 0 0 1 0 4.5"),
  ],
} satisfies Record<string, GlyphNode>;

export type GlyphName = keyof typeof GLYPH_TABLE;
export const GLYPHS: Record<GlyphName, GlyphNode> = GLYPH_TABLE;
