/**
 * Area targeting's geometry — `src/utils/radialSectors.ts`.
 *
 * The wheel is allowed exactly one opinion about where a target is. The pointer resolves an index;
 * the SVG paints a wedge. If those two ever disagree, the wheel lights one shortcut and opens
 * another — and it does so silently, at the one moment the user is least able to tell what went
 * wrong. This file exists to make that class of bug impossible to ship:
 *
 * 1. Every direction on the plane belongs to exactly one item, and to the item whose wedge covers
 *    it. Proved by sweeping the full circle at a fine step, for every wheel size worth having.
 * 2. The shares are equal. That is the whole promise of the mode: two items, half the screen each;
 *    four items, a quarter each.
 * 3. The paths are paths. A one-item wheel is the case that breaks naively — an arc whose ends
 *    coincide draws nothing — and a wheel with one shortcut still has to show its area.
 * 4. The highlight arrives at nothing. The wedge reaches the edge of the window, so whatever alpha
 *    it still has there is drawn as a straight cut across the desktop. Its gradient therefore has
 *    to land on exactly zero at the rim, with its stops in order and sampled densely enough that a
 *    fade hundreds of pixels long does not band.
 * 5. And it still arrives at nothing once the beam is drawn STRAIGHT out along the wedge rather
 *    than in a ring around the hub. A linear fade crosses the wedge's far corners before its tip,
 *    so the zero has to be moved in to meet them — otherwise the rim keeps alpha the window cuts.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "rovyl-radial-sectors-"));

/** Wheel sizes that matter: one item, the even splits the user names, and a crowded wheel. */
const COUNTS = [1, 2, 3, 4, 5, 6, 8, 12, 20];

try {
  await build({
    root,
    logLevel: "warn",
    build: {
      ssr: join(root, "src", "utils", "radialSectors.ts"),
      outDir,
      emptyOutDir: true,
      target: "node20",
      minify: false,
      rollupOptions: { output: { format: "es", entryFileNames: "entry.mjs" } },
    },
    ssr: { noExternal: true },
  });

  const {
    sectorBoundsDeg,
    sectorIndexForDelta,
    annularSectorPath,
    polarPoint,
    sectorBeamEndStop,
    sectorCentreDeg,
    sectorGradientStops,
    SECTOR_FILL_ALPHA,
    SECTOR_EDGE_ALPHA,
    SECTOR_SEAM_ALPHA,
    SECTOR_SEAM_REACH,
  } = await import(pathToFileURL(join(outDir, "entry.mjs")).href);

  let n = 0;
  const check = (fn) => { fn(); n += 1; };

  /** Which wedge a bearing falls in, read off the DRAWN bounds — never off the aim's arithmetic. */
  const drawnIndexAt = (deg, count) => {
    for (let i = 0; i < count; i += 1) {
      const { startDeg, endDeg } = sectorBoundsDeg(i, count);
      const offset = ((deg - startDeg) % 360 + 360) % 360;
      if (offset < endDeg - startDeg) return i;
    }
    return null;
  };

  // ── 1. What is lit is what opens ──────────────────────────────────────────
  check(() => {
    for (const count of COUNTS) {
      const sliceAngle = 360 / count;
      for (let deg = 0; deg < 360; deg += 0.05) {
        /**
         * Skip the seams themselves. A boundary is one line, not an area: which side of it a
         * float lands on is a rounding question and no user can aim at it on purpose. What has to
         * hold is the INSIDE of every wedge.
         */
        const fromSeam = Math.abs((((deg + 90 + sliceAngle / 2) % sliceAngle) + sliceAngle) % sliceAngle);
        if (fromSeam < 0.01 || sliceAngle - fromSeam < 0.01) continue;

        const rad = (deg * Math.PI) / 180;
        const aimed = sectorIndexForDelta(Math.cos(rad) * 200, Math.sin(rad) * 200, count);
        const painted = drawnIndexAt(deg, count);
        assert.equal(
          aimed,
          painted,
          `${count} items, bearing ${deg.toFixed(2)}°: the aim says ${aimed}, the wedge drawn there is ${painted}`,
        );
      }
    }
  });

  // ── 2. Equal shares ───────────────────────────────────────────────────────
  check(() => {
    for (const count of COUNTS) {
      const spans = Array.from({ length: count }, (_, i) => {
        const { startDeg, endDeg } = sectorBoundsDeg(i, count);
        return endDeg - startDeg;
      });
      for (const span of spans) {
        assert.ok(
          Math.abs(span - 360 / count) < 1e-9,
          `${count} items: a wedge spans ${span}°, not ${360 / count}°`,
        );
      }
      assert.ok(
        Math.abs(spans.reduce((sum, span) => sum + span, 0) - 360) < 1e-9,
        `${count} items: the wedges must add up to the whole plane`,
      );
    }
  });

  /** The wheel's own convention: item 0 is at twelve o'clock, and straight up must select it. */
  check(() => {
    for (const count of COUNTS) {
      assert.equal(sectorIndexForDelta(0, -200, count), 0, `${count} items: straight up is item 0`);
    }
  });

  /** Two items really is half the screen each — the example the mode is explained with. */
  check(() => {
    assert.equal(sectorIndexForDelta(200, 0, 2), 1, "two items: the right half belongs to item 1");
    assert.equal(sectorIndexForDelta(-200, 0, 2), 0, "two items: the left half belongs to item 0");
    assert.equal(sectorIndexForDelta(0, 200, 2), 1, "two items: straight down is item 1's half");
  });

  /** An empty level has no share to give out. */
  check(() => assert.equal(sectorIndexForDelta(100, 100, 0), null));

  // ── 3. The paths are drawable ─────────────────────────────────────────────
  check(() => {
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        const { startDeg, endDeg } = sectorBoundsDeg(i, count);
        const d = annularSectorPath(60, 300, startDeg, endDeg);
        assert.ok(d.startsWith("M "), `${count}/${i}: a path starts with a move`);
        assert.ok(d.endsWith(" Z"), `${count}/${i}: a filled wedge has to close`);
        assert.ok(!/NaN|Infinity|undefined/.test(d), `${count}/${i}: ${d}`);
        /** Both radii have to appear, or what was drawn is a disc and not a ring. */
        assert.ok(d.includes("A 300 300"), `${count}/${i}: no outer arc in ${d}`);
        assert.ok(d.includes("A 60 60"), `${count}/${i}: no inner arc in ${d}`);
      }
    }
  });

  /** One item owns the plane, and the ring it gets is stitched from two halves. */
  check(() => {
    const { startDeg, endDeg } = sectorBoundsDeg(0, 1);
    assert.equal(endDeg - startDeg, 360);
    const d = annularSectorPath(60, 300, startDeg, endDeg);
    assert.equal((d.match(/A 300 300/g) || []).length, 2, `the outer ring needs two arcs: ${d}`);
    assert.equal((d.match(/A 60 60/g) || []).length, 2, `the inner ring needs two arcs: ${d}`);
  });

  /** The seams are drawn from the same bounds the wedges are, so they land on the wedges' edges. */
  check(() => {
    const outer = 300;
    for (const count of COUNTS.filter((c) => c > 1)) {
      for (let i = 0; i < count; i += 1) {
        const { startDeg } = sectorBoundsDeg(i, count);
        const near = polarPoint(outer, 60, startDeg);
        const far = polarPoint(outer, outer, startDeg);
        assert.ok(
          Math.abs(Math.hypot(near.x - outer, near.y - outer) - 60) < 1e-9 &&
            Math.abs(Math.hypot(far.x - outer, far.y - outer) - outer) < 1e-9,
          `${count}/${i}: the seam does not run from the dead zone to the rim`,
        );
      }
    }
  });

  // ── 4. The highlight arrives at nothing ───────────────────────────────────
  const ALPHAS = [SECTOR_FILL_ALPHA, SECTOR_EDGE_ALPHA, SECTOR_SEAM_ALPHA];
  /** Every shape of wheel: a tight dead zone against a distant rim, and the squeezed opposite. */
  const GEOMETRIES = [
    [0.12, 0.32], [0.2, 0.5], [0.05, 0.2], [0.4, 0.7], [0.6, 0.62], [0.88, 0.9],
  ];

  check(() => {
    for (const [inner, falloff] of GEOMETRIES) {
      for (const [near, far] of ALPHAS) {
        const stops = sectorGradientStops(inner, falloff, near, far);
        const last = stops[stops.length - 1];
        assert.equal(
          last.offset,
          1,
          `inner ${inner} / falloff ${falloff}: the gradient must run all the way to the rim`,
        );
        assert.ok(
          last.opacity < 1e-9,
          `inner ${inner} / falloff ${falloff}: alpha ${last.opacity} at the rim would be cut by the window edge`,
        );
      }
    }
  });

  /** Out-of-order stops are silently clamped by SVG, which would collapse the fade into a ring. */
  check(() => {
    for (const [inner, falloff] of GEOMETRIES) {
      for (const [near, far] of ALPHAS) {
        const stops = sectorGradientStops(inner, falloff, near, far);
        for (let i = 1; i < stops.length; i += 1) {
          assert.ok(
            stops[i].offset >= stops[i - 1].offset,
            `inner ${inner} / falloff ${falloff}: stop ${i} at ${stops[i].offset} goes backwards`,
          );
        }
        for (const stop of stops) {
          assert.ok(stop.offset >= 0 && stop.offset <= 1, `offset ${stop.offset} is off the gradient`);
          assert.ok(stop.opacity >= 0 && stop.opacity <= 1, `opacity ${stop.opacity} is not an alpha`);
        }
      }
    }
  });

  /** Monotonic, and never brighter than where it started: a dissolve, not a second glow. */
  check(() => {
    for (const [inner, falloff] of GEOMETRIES) {
      const [near, far] = SECTOR_FILL_ALPHA;
      const stops = sectorGradientStops(inner, falloff, near, far);
      for (let i = 1; i < stops.length; i += 1) {
        assert.ok(
          stops[i].opacity <= stops[i - 1].opacity + 1e-9,
          `inner ${inner}: alpha rises again at stop ${i} (${stops[i - 1].opacity} → ${stops[i].opacity})`,
        );
      }
      assert.ok(stops[0].opacity <= 1 && stops[0].opacity === near);
    }
  });

  /**
   * The samples reproduce the curve they stand for.
   *
   * A gradient is drawn as straight lines between its stops, so the stop list is an approximation
   * of `(1 - t)²` and the question is how good. Too few and the dissolve becomes a fan of flat
   * facets with a visible kink at every stop — which is the same defect as a sudden fade, just
   * repeated. (Stop density is NOT what keeps an 8-bit ramp from banding: that is fixed by the
   * total alpha range over the distance, and no number of stops changes it.)
   */
  check(() => {
    for (const [inner, falloff] of GEOMETRIES) {
      for (const [near, far] of ALPHAS) {
        const stops = sectorGradientStops(inner, falloff, near, far);
        const plateau = stops[1].offset;
        if (plateau >= 1 - 1e-9) continue;
        let worst = 0;
        for (let i = 1; i < stops.length - 1; i += 1) {
          const a = stops[i];
          const b = stops[i + 1];
          if (b.offset - a.offset < 1e-9) continue;
          /** Sample the chord against the curve it is standing in for. */
          for (let k = 1; k < 8; k += 1) {
            const offset = a.offset + ((b.offset - a.offset) * k) / 8;
            const chord = a.opacity + ((b.opacity - a.opacity) * k) / 8;
            const t = (offset - plateau) / (stops[stops.length - 1].offset - plateau);
            worst = Math.max(worst, Math.abs(chord - far * (1 - t) * (1 - t)));
          }
        }
        assert.ok(
          worst <= 0.004,
          `inner ${inner} / falloff ${falloff}: the stops miss the curve by ${worst.toFixed(4)} — the fade will show facets`,
        );
      }
    }
  });

  // ── 5. The beam runs straight, and still arrives at nothing ──────────────
  /**
   * The wedge is lit by a LINEAR gradient along its own bisector, so its fade is a set of bands
   * perpendicular to that direction rather than arcs around the hub. That buys the direction back
   * at one cost worth proving away: a band reaches the wedge's far CORNERS before it reaches the
   * point of the bisector, so a fade that finished at the rim would still have alpha in those
   * corners — and the outer arc between them would be drawn as a curved cut across the desktop.
   * `sectorBeamEndStop` lands the zero at the corners instead, which is where `cos(half slice)`
   * comes from: everything from there to the rim is already nothing.
   */
  /** What the gradient paints at `offset`, the way SVG does it — straight lines between stops. */
  const alphaAt = (stops, offset) => {
    if (offset <= stops[0].offset) return stops[0].opacity;
    for (let i = 1; i < stops.length; i += 1) {
      if (offset <= stops[i].offset) {
        const span = stops[i].offset - stops[i - 1].offset;
        if (span < 1e-12) return stops[i].opacity;
        const t = (offset - stops[i - 1].offset) / span;
        return stops[i - 1].opacity + (stops[i].opacity - stops[i - 1].opacity) * t;
      }
    }
    return stops[stops.length - 1].opacity;
  };

  check(() => {
    let linearCases = 0;
    for (const count of COUNTS) {
      for (const [inner, falloff] of GEOMETRIES) {
        const endStop = sectorBeamEndStop(count, inner);
        if (endStop === null) {
          /** The ring is the fallback, and the ring is only allowed where the beam cannot go. */
          assert.ok(
            count < 3 || inner > Math.cos(Math.PI / count) * 0.7,
            `${count} items, inner ${inner}: a linear beam was refused where it would have drawn`,
          );
          continue;
        }
        linearCases += 1;
        assert.ok(
          Math.abs(endStop - Math.cos(Math.PI / count)) < 1e-12 && endStop > 0 && endStop < 1,
          `${count} items: the fade has to end at the corners' projection, not at ${endStop}`,
        );
        for (const [near, far] of ALPHAS) {
          const stops = sectorGradientStops(inner, falloff, near, far, endStop);
          const last = stops[stops.length - 1];
          assert.equal(last.offset, 1, `${count} items: the gradient still has to span its whole run`);
          assert.ok(last.opacity < 1e-9, `${count} items: alpha ${last.opacity} left at the rim`);
          /**
           * The corner itself, and every point of the outer arc past it: a wedge point at radius
           * `r` and `theta` off the bisector falls at `r·cos(theta)` along the gradient, so the
           * whole rim lies at `endStop` or beyond.
           */
          for (const offset of [endStop, (endStop + 1) / 2, 1]) {
            assert.ok(
              alphaAt(stops, offset) < 1e-9,
              `${count} items, inner ${inner}: ${alphaAt(stops, offset)} alpha at ${offset} is a cut on the rim`,
            );
          }
          /**
           * And the near end holds: the dead zone's own corners are foreshortened onto the axis
           * too, so the hold has to have started before them or the wedge begins on a flat strip.
           */
          assert.ok(
            stops[0].offset <= inner * endStop + 1e-9,
            `${count} items, inner ${inner}: the hold starts at ${stops[0].offset}, past the dead zone's corner`,
          );
          /** It is still a dissolve on the way there, not a step. */
          for (let i = 1; i < stops.length; i += 1) {
            assert.ok(stops[i].offset >= stops[i - 1].offset, `${count} items: stop ${i} goes backwards`);
            assert.ok(
              stops[i].opacity <= stops[i - 1].opacity + 1e-9,
              `${count} items: alpha rises again at stop ${i}`,
            );
            assert.ok(stops[i].offset >= 0 && stops[i].offset <= 1, "offset off the gradient");
          }
          /** The dissolve needs room, or the fade is a boundary with extra steps in it. */
          assert.ok(
            endStop - stops[1].offset > 0.05,
            `${count} items, inner ${inner}: only ${(endStop - stops[1].offset).toFixed(3)} of the run left to fade in`,
          );
        }
      }
    }
    assert.ok(linearCases > 0, "no wheel at all got a linear beam — the fallback has swallowed the mode");
  });

  /**
   * The gradient points where the aim does. Its vector is the wedge's bisector, and if those two
   * ever parted the wheel would light a beam down one slice while opening the item in another.
   */
  check(() => {
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        const deg = sectorCentreDeg(i, count);
        const { startDeg, endDeg } = sectorBoundsDeg(i, count);
        assert.ok(
          Math.abs(deg - (startDeg + endDeg) / 2) < 1e-9,
          `${count}/${i}: the beam runs down ${deg}°, the wedge is centred on ${(startDeg + endDeg) / 2}°`,
        );
        const rad = (deg * Math.PI) / 180;
        assert.equal(
          sectorIndexForDelta(Math.cos(rad) * 200, Math.sin(rad) * 200, count),
          i,
          `${count}/${i}: aiming straight down the beam must select the item it belongs to`,
        );
      }
    }
  });

  /** The seams are furniture, not the highlight: shorter, and fainter than the fill. */
  check(() => {
    assert.ok(SECTOR_SEAM_REACH > 0 && SECTOR_SEAM_REACH < 1, "seams must stop short of the wedges");
    assert.ok(
      SECTOR_SEAM_ALPHA[0] < SECTOR_FILL_ALPHA[0],
      "a seam that outshines the lit wedge is drawing attention to the wrong thing",
    );
    assert.ok(
      SECTOR_EDGE_ALPHA[0] > SECTOR_FILL_ALPHA[0],
      "the wedge's sides carry its angle, so they have to read above its fill",
    );
  });

  console.log(`radial-sectors-smoke: OK (${n} assertions)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
