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

/** The direction item `index` is aimed at — the bisector its highlight runs along. */
export function sectorCentreDeg(index: number, count: number): number {
  return index * (360 / count) - 90;
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
 * as a lit SECTION. Past it the alpha falls as `(1 - t)²` all the way to `endStop`, which is the
 * rim unless the caller knows the shape runs out sooner along the gradient's own axis.
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
  endStop: number = 1,
): { offset: number; opacity: number }[] {
  const end = Math.min(1, Math.max(0.05, endStop));
  /**
   * Where the hold has to have STARTED, which is not the dead zone when the run is a straight line.
   *
   * A wedge point at radius `r`, `θ` off the axis, falls at `r·cosθ` along that line — so the
   * nearest thing the wedge owns is the corner of its dead zone, foreshortened by the same `end`
   * the rim's corners are. Starting the hold at `innerStop` would leave those corners in front of
   * the first stop, holding `nearAlpha` flat over a strip that is meant to be inside the hub.
   */
  const start = Math.min(end - 0.03, innerStop * end);
  /**
   * The hold keeps its true reach where the run is long enough to afford it, and gives way when it
   * is not: past this the dissolve would have fewer pixels than it needs and the wedge would end on
   * a step. Both are worse than a highlight that hugs the wheel a little more closely.
   */
  const plateau = Math.min(
    end - 0.02,
    Math.max(start + 0.01, Math.min(falloffStop, start + 0.6 * (end - start))),
  );
  return [
    { offset: start, opacity: nearAlpha },
    ...FALLOFF_SAMPLES.map((t) => ({
      offset: plateau + t * (end - plateau),
      opacity: farAlpha * (1 - t) * (1 - t),
    })),
    /** Past the point where the fade landed on zero there is only zero — see `sectorBeamEndStop`. */
    ...(end < 1 ? [{ offset: 1, opacity: 0 }] : []),
  ];
}

/**
 * Where a wedge's LINEAR beam must have reached zero — or `null` when it must not be linear at all.
 *
 * The beam runs straight out along the wedge's bisector, so it fades in bands across that
 * direction instead of in rings around the hub. The last thing the wedge has on screen is a
 * CORNER, out where a straight side meets the rim, and a corner sits half a slice off-axis — it
 * therefore falls on the band `cos(half slice)` along. Land the zero there and the corners, the
 * arc between them and everything past it are already nothing: the wedge still reaches the frame
 * having disappeared, which is the property the radial version was built around and the one a
 * curved cut across the desktop would cost.
 *
 * `null` is the two cases where that cannot be bought:
 *  - Two items or one. A half-plane's straight side is a full 90° off its bisector, so the whole
 *    diameter lies on ONE band: no gradient along that axis fades it, and it ends at the frame at
 *    whatever alpha it was holding.
 *  - A dead zone so large against the rim that the wedge's corners are behind it. There is no
 *    room left between the two for a dissolve, and what is drawn would be a step.
 * Both go back to the ring, where every ray fades alike and neither can happen.
 */
export function sectorBeamEndStop(count: number, innerStop: number): number | null {
  if (count < 3) return null;
  const end = Math.cos(Math.PI / count);
  return innerStop <= end * 0.7 ? end : null;
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
