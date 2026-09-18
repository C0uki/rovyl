/* Area targeting, drawn - ported from src/utils/radialSectors.ts and the
   `RadialSectors` component in src/components/RadialMenu.tsx. The wedge being
   aimed at is lit by a straight gradient along its own bisector (the beam),
   multiplied by one radial mask for the whole plane (the reach) so it still
   arrives at nothing on the rim. Faint seams mark where each wedge ends.
   Keep the numbers in step with the app. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  const FALLOFF_SAMPLES = [
    0, 0.06, 0.12, 0.19, 0.25, 0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.69, 0.75, 0.82, 0.88, 0.94, 1,
  ];
  const FILL_ALPHA = [0.46, 0.38];
  const EDGE_ALPHA = [0.68, 0.55];
  const SEAM_ALPHA = [0.16, 0.11];
  const SEAM_REACH = 0.55;
  const SEAM_FALLOFF_SCALE = 1.1;
  const ALPHA_COUNT = 8;
  const BEAM_RUN = 0.5;

  const boundsDeg = (index, count) => {
    const slice = 360 / count;
    const centre = index * slice - 90;
    return { startDeg: centre - slice / 2, endDeg: centre + slice / 2 };
  };
  const centreDeg = (index, count) => index * (360 / count) - 90;

  const polar = (centre, radius, deg) => {
    const rad = deg * (Math.PI / 180);
    return { x: centre + radius * Math.cos(rad), y: centre + radius * Math.sin(rad) };
  };

  function sectorPath(inner, outer, startDeg, endDeg) {
    const p = (deg, r) => {
      const pt = polar(outer, r, deg);
      return `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
    };
    if (endDeg - startDeg >= 359.999) {
      return [
        `M ${p(0, outer)}`,
        `A ${outer} ${outer} 0 1 1 ${p(180, outer)}`,
        `A ${outer} ${outer} 0 1 1 ${p(360, outer)}`,
        `M ${p(0, inner)}`,
        `A ${inner} ${inner} 0 1 0 ${p(180, inner)}`,
        `A ${inner} ${inner} 0 1 0 ${p(360, inner)}`,
        'Z',
      ].join(' ');
    }
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return [
      `M ${p(startDeg, inner)}`,
      `L ${p(startDeg, outer)}`,
      `A ${outer} ${outer} 0 ${large} 1 ${p(endDeg, outer)}`,
      `L ${p(endDeg, inner)}`,
      `A ${inner} ${inner} 0 ${large} 0 ${p(startDeg, inner)}`,
      'Z',
    ].join(' ');
  }

  const plateauStop = (innerStop, falloffStop) =>
    Math.min(0.98, Math.max(innerStop + 0.01, falloffStop));
  const beamCurve = (t, lean) => lean + (1 - lean) * (1 - t) * (1 - t);
  const leanWithRoom = (lean, plateau) =>
    1 - (1 - lean) * Math.min(1, (1 - plateau) / BEAM_RUN);
  const beamLean = (count) => Math.sin(Math.PI / Math.max(count, 2));
  const beamAlphas = (alphas, count) => {
    const temper = Math.min(1, Math.sqrt(Math.max(count, 1) / ALPHA_COUNT));
    return [alphas[0] * temper, alphas[1] * temper];
  };

  function gradientStops(innerStop, falloffStop, near, far) {
    const plateau = plateauStop(innerStop, falloffStop);
    return [
      { offset: innerStop, opacity: near },
      ...FALLOFF_SAMPLES.map((t) => ({
        offset: plateau + t * (1 - plateau),
        opacity: far * (1 - t) * (1 - t),
      })),
    ];
  }

  function beamStops(innerStop, falloffStop, near, far, lean) {
    const plateau = plateauStop(innerStop, falloffStop);
    const reached = leanWithRoom(lean, plateau);
    return [
      { offset: 0, opacity: near },
      ...FALLOFF_SAMPLES.map((t) => ({
        offset: plateau + t * (1 - plateau),
        opacity: far * beamCurve(t, reached),
      })),
    ];
  }

  function reachStops(innerStop, falloffStop, lean) {
    const plateau = plateauStop(innerStop, falloffStop);
    const reached = leanWithRoom(lean, plateau);
    return [
      { offset: innerStop, opacity: 1 },
      ...FALLOFF_SAMPLES.map((t) => ({
        offset: plateau + t * (1 - plateau),
        opacity: ((1 - t) * (1 - t)) / beamCurve(t, reached),
      })),
    ];
  }

  const node = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  const stopsInto = (grad, stops, color) => {
    for (const stop of stops) {
      grad.append(node('stop', {
        offset: stop.offset.toFixed(4),
        'stop-color': color,
        'stop-opacity': stop.opacity.toFixed(4),
      }));
    }
    return grad;
  };

  let uid = 0;

  /**
   * Fill `svg` with `count` wedges. Returns the wedge paths, in item order, so
   * the caller lights one by setting its opacity. Draws nothing (and returns
   * []) when the ring would be inside out.
   */
  function draw(svg, { count, inner, outer, falloff, color = '#FFFFFF' }) {
    svg.replaceChildren();
    if (count < 1 || outer <= inner + 8) return [];
    const id = `rs${uid += 1}`;
    const size = Math.max(outer * 2, 2);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);

    const innerStop = inner / outer;
    const falloffStop = Math.min(0.9, Math.max(innerStop + 0.02, falloff / outer));
    const seamEnd = outer * SEAM_REACH;
    const seamFalloffStop = Math.min(
      0.9,
      Math.max(innerStop + 0.02, (falloff * SEAM_FALLOFF_SCALE) / seamEnd),
    );
    const lean = beamLean(count);
    const fill = beamStops(innerStop, falloffStop, ...beamAlphas(FILL_ALPHA, count), lean);
    const edge = beamStops(innerStop, falloffStop, ...beamAlphas(EDGE_ALPHA, count), lean);
    const seam = gradientStops(innerStop / SEAM_REACH, seamFalloffStop, SEAM_ALPHA[0], SEAM_ALPHA[1]);

    const linear = (gid, stops, deg, length, c) => {
      const far = polar(outer, length, deg);
      return stopsInto(node('linearGradient', {
        id: gid, gradientUnits: 'userSpaceOnUse',
        x1: outer, y1: outer, x2: far.x.toFixed(2), y2: far.y.toFixed(2),
      }), stops, c);
    };

    const defs = node('defs', {});
    for (let i = 0; i < count; i += 1) {
      defs.append(linear(`${id}-b${i}`, fill, centreDeg(i, count), outer, color));
      defs.append(linear(`${id}-e${i}`, edge, centreDeg(i, count), outer, color));
      if (count > 1) defs.append(linear(`${id}-s${i}`, seam, boundsDeg(i, count).startDeg, seamEnd, '#FFFFFF'));
    }
    defs.append(stopsInto(
      node('radialGradient', { id: `${id}-reach`, cx: '50%', cy: '50%', r: '50%' }),
      reachStops(innerStop, falloffStop, lean),
      '#FFFFFF',
    ));
    const mask = node('mask', { id: `${id}-mask`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: size, height: size });
    mask.append(node('rect', { width: size, height: size, fill: `url(#${id}-reach)` }));
    defs.append(mask);
    svg.append(defs);

    const group = node('g', { mask: `url(#${id}-mask)` });
    const wedges = [];
    for (let i = 0; i < count; i += 1) {
      const { startDeg, endDeg } = boundsDeg(i, count);
      const path = node('path', {
        class: 'sector',
        d: sectorPath(inner, outer, startDeg, endDeg),
        fill: `url(#${id}-b${i})`,
        stroke: `url(#${id}-e${i})`,
        'stroke-width': 1.25,
        'vector-effect': 'non-scaling-stroke',
      });
      path.style.opacity = '0';
      group.append(path);
      wedges.push(path);
    }
    svg.append(group);

    if (count > 1) {
      for (let i = 0; i < count; i += 1) {
        const deg = boundsDeg(i, count).startDeg;
        const a = polar(outer, inner, deg);
        const b = polar(outer, seamEnd, deg);
        svg.append(node('line', {
          x1: a.x.toFixed(2), y1: a.y.toFixed(2), x2: b.x.toFixed(2), y2: b.y.toFixed(2),
          stroke: `url(#${id}-s${i})`,
          'stroke-width': 1,
          'vector-effect': 'non-scaling-stroke',
        }));
      }
    }
    return wedges;
  }

  window.RovylSectors = { draw };
})();
