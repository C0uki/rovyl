/* The app's background dimming, ported from src/utils/radialScrim.ts so the
   page paints the same pixels the product does: a smoothstep pool centred on
   the wheel that, past 70%, lifts into a monitor-wide sheet and at 100% is a
   flat fill. Keep the two in step. */
(function () {
  const SCRIM_FLATTEN_FROM = 0.7;
  const DEFAULT_DIM = 0.9;

  function alphas(backdropOpacity) {
    const dim = Number.isFinite(backdropOpacity)
      ? Math.min(1, Math.max(0, backdropOpacity))
      : DEFAULT_DIM;
    const peak = 0.22 + 0.78 * dim * dim;
    const flatten = Math.max(0, (dim - SCRIM_FLATTEN_FROM) / (1 - SCRIM_FLATTEN_FROM));
    return { peak, floor: peak * flatten * flatten };
  }

  /* A centre is pixels, or any CSS length when the box is not laid out yet. */
  const at = (v) => (typeof v === 'number' ? `${Math.round(v)}px` : v);

  function gradient(position, backdropOpacity, backdropRadius) {
    const { peak, floor } = alphas(backdropOpacity);
    if (floor >= peak) {
      const flat = `rgba(4,5,7,${peak.toFixed(3)})`;
      return `linear-gradient(${flat}, ${flat})`;
    }
    const scrimRadius = Math.round(backdropRadius * 2);
    const stops = [0, 0.12, 0.25, 0.38, 0.5, 0.62, 0.75, 0.88, 1]
      .map((t) => {
        const falloff = 1 - (3 * t * t - 2 * t * t * t);
        return `rgba(4,5,7,${(floor + (peak - floor) * falloff).toFixed(3)}) ${Math.round(t * scrimRadius)}px`;
      })
      .join(', ');
    return `radial-gradient(circle at ${at(position.x)} ${at(position.y)}, ${stops})`;
  }

  /* The app's `backdropRadius`: where the pool holds before it starts to fall. */
  function radius(menuRadius, iconSize, spacing) {
    return Math.ceil(menuRadius + iconSize * 0.75 + Math.max(18, spacing || 0));
  }

  window.RovylScrim = { alphas, gradient, radius, DEFAULT_DIM };
})();
