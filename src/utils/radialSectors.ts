/**
 * The wheel's plane, cut into equal shares — the geometry BOTH the aim and the drawing read.
 *
 * It lives away from `RadialMenu` for the reason `radialScrim.ts` does: the wheel must never hold
 * two opinions about where a target is. The index the pointer resolves to and the wedge painted
 * under it are the same arithmetic here, so "it lit one thing and opened another" is not a defect
 * this code can have — and the arithmetic can be proved without mounting React
 * (see scripts/radial-sectors-smoke.mjs).
 *
 * Conventions, once, for everything below:
 *  - Degrees, screen coordinates: x right, y DOWN. Increasing degrees therefore run clockwise,
 *    which is also SVG's positive sweep — hence the `1` on the outer arc.
 *  - Item `i` is centred on `i * (360 / count) - 90`, so item 0 sits at twelve o'clock.
 */

/** Half-open [start, end) in degrees: the share of the plane item `index` owns. */
export function sectorBoundsDeg(index: number, count: number): { startDeg: number; endDeg: number } {
  const sliceAngle = 360 / count;
  const centreDeg = index * sliceAngle - 90;
  return { startDeg: centreDeg - sliceAngle / 2, endDeg: centreDeg + sliceAngle / 2 };
}

/**
 * Which item a displacement from the centre points at. `count` must be > 0.
 *
 * This is the wheel's targeting, full stop — direction and area both call it, and pointer mode
 * calls it too, for the candidate it then distance-tests against the icon.
 */
export function sectorIndexForDelta(deltaX: number, deltaY: number, count: number): number | null {
  if (count <= 0) return null;
  const sliceAngle = 360 / count;
  let angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  const index = Math.floor(((angle + sliceAngle / 2) % 360) / sliceAngle);
  return index >= 0 && index < count ? index : null;
}

/**
 * One wedge, as an SVG path, in a box of side `radiusOuter * 2` whose centre is the wheel's.
 *
 * A single item owns the whole plane, and an arc whose two ends coincide draws nothing at all —
 * SVG collapses it. That ring is stitched from two halves so the one-item wheel still gets an area.
 */
export function annularSectorPath(
  radiusInner: number,
  radiusOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const point = (deg: number, radius: number) => {
    const rad = deg * (Math.PI / 180);
    return `${(radiusOuter + radius * Math.cos(rad)).toFixed(2)} ${(radiusOuter + radius * Math.sin(rad)).toFixed(2)}`;
  };

  if (endDeg - startDeg >= 359.999) {
    return [
      `M ${point(0, radiusOuter)}`,
      `A ${radiusOuter} ${radiusOuter} 0 1 1 ${point(180, radiusOuter)}`,
      `A ${radiusOuter} ${radiusOuter} 0 1 1 ${point(360, radiusOuter)}`,
      `M ${point(0, radiusInner)}`,
      `A ${radiusInner} ${radiusInner} 0 1 0 ${point(180, radiusInner)}`,
      `A ${radiusInner} ${radiusInner} 0 1 0 ${point(360, radiusInner)}`,
      'Z',
    ].join(' ');
  }

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return [
    `M ${point(startDeg, radiusInner)}`,
    `L ${point(startDeg, radiusOuter)}`,
    `A ${radiusOuter} ${radiusOuter} 0 ${largeArc} 1 ${point(endDeg, radiusOuter)}`,
    `L ${point(endDeg, radiusInner)}`,
    `A ${radiusInner} ${radiusInner} 0 ${largeArc} 0 ${point(startDeg, radiusInner)}`,
    'Z',
  ].join(' ');
}

/** A point on the wheel's plane, for the seams drawn between wedges. */
export function polarPoint(
  centre: number,
  radius: number,
  deg: number,
): { x: number; y: number } {
  const rad = deg * (Math.PI / 180);
  return { x: centre + radius * Math.cos(rad), y: centre + radius * Math.sin(rad) };
}

/**
 * Where the fade samples sit, as a fraction of the way from the plateau's end to the rim.
 *
 * Seventeen, not two, and for the reason `radialScrimGradient` gives about its own nine: a long
 * band between two stops is interpolated in 8-bit, and the steps that produces read as banding —
 * concentric rings in something that is supposed to be a dissolve. The wedge fades over hundreds
 * of pixels, several times the scrim's span, so it is sampled several times as densely.
 */
const FALLOFF_SAMPLES = [
  0, 0.06, 0.12, 0.19, 0.25, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.69, 0.75, 0.82, 0.88, 0.94, 1,
];

/**
 * The stops of one wedge gradient: hold, then dissolve.
 *
 * Two regions. From the dead zone out to `falloffStop` the wedge holds near full strength, ramping
 * gently from `nearAlpha` to `farAlpha` — that is the part with the icon in it, and it has to read
 * as a lit SECTION. Past it the alpha falls as `(1 - t)²` all the way to the rim.
 *
 * The square matters twice. Its slope is zero at the end, so the wedge arrives at nothing instead
 * of stopping at something — there is no radius at which a boundary appears. And it is steep at
 * the START, which is what keeps the highlight attached to its icon: a wedge widens as it goes out,
 * so a constant alpha puts most of the lit AREA far from the target and the eye reads the glow as
 * a separate object floating off in that direction.
 */
export function sectorGradientStops(
  innerStop: number,
  falloffStop: number,
  nearAlpha: number,
  farAlpha: number,
): { offset: number; opacity: number }[] {
  const plateau = Math.min(0.98, Math.max(innerStop + 0.01, falloffStop));
  return [
    { offset: innerStop, opacity: nearAlpha },
    ...FALLOFF_SAMPLES.map((t) => ({
      offset: plateau + t * (1 - plateau),
      opacity: farAlpha * (1 - t) * (1 - t),
    })),
  ];
}

/**
 * The alphas each of the three gradients runs between — [at the dead zone, at the plateau's end].
 *
 * Calibrated against the DEFAULT hover colour, which is white. A ramp tuned on a saturated colour
 * blows out when it is white, and white is what most wheels are drawing: the same numbers that
 * read as a confident blue wedge read as a headlight.
 */
export const SECTOR_FILL_ALPHA = [0.46, 0.38] as const;
export const SECTOR_EDGE_ALPHA = [0.68, 0.55] as const;
export const SECTOR_SEAM_ALPHA = [0.16, 0.11] as const;

/**
 * How far the seams run, as a fraction of the wedge's reach, and where they start fading.
 *
 * Shorter than the wedges on purpose. A seam is structure — it answers "where does this one end",
 * which is a question about the part of the wheel being aimed AT. Run to full length they stopped
 * being furniture and became a giant X drawn across the desktop, competing with the thing they are
 * there to explain.
 */
export const SECTOR_SEAM_REACH = 0.55;
export const SECTOR_SEAM_FALLOFF_SCALE = 1.1;
