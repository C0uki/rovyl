/* ══════════════════════════════════════════════════════════════════════════
   Rovyl - website behaviour

   The hero wheel is the page's one real argument: the product is a gesture, and
   a gesture cannot be described in a paragraph. So it is rebuilt here with the
   app's own geometry and state machine - bloom, presence, sustained aim, launch
   echo - and it hands over to the pointer the moment one arrives, because
   aiming it yourself is the demonstration.

   Everything animated is `transform` + `opacity`, and nothing runs while it is
   off screen.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* `workspaces.js` is generated from an installed Rovyl by
     `tools/sync-workspaces.mjs`: the real workspaces, in the real order, with
     the icons the app extracted from the Start Menu. A mock-up full of invented
     shortcuts is a drawing; this is the product. */
  const DATA = window.ROVYL || {};
  const LOOK = DATA.look || {};
  const SPACES = (DATA.workspaces || []).filter((w) => w.items && w.items.length);

  /* ── Header ─────────────────────────────────────────────────────────────
     The hairline only appears once the page has actually moved: a border under
     a bar sitting at the top of an unscrolled page is a line with nothing to
     separate. */
  const nav = document.getElementById('nav');
  if (nav) {
    const sync = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  /* ── Scroll reveal ──────────────────────────────────────────────────────
     Siblings arrive in sequence rather than all at once; the stagger is capped
     so a twelve-card grid does not turn into a queue. */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    const seen = new WeakSet();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        const siblings = [...entry.target.parentElement.children];
        const step = Math.min(siblings.indexOf(entry.target), 8) * 45;
        entry.target.style.transitionDelay = `${step}ms`;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  }

  /* ── Workspace cards ────────────────────────────────────────────────────
     The app's own idiom: each card previews its OWN wheel, with the real icons
     in the real positions. The item count is the whole difference between them,
     which is the point the section is making. */
  const strip = document.getElementById('wsStrip');
  if (strip && SPACES.length) {
    for (const [index, ws] of SPACES.entries()) {
      const card = document.createElement('figure');
      card.className = `ws${index === 0 ? ' is-current' : ''}`;

      const preview = document.createElement('div');
      preview.className = 'ws-preview';
      const hub = document.createElement('i');
      hub.className = 'ws-hub';
      preview.append(hub);

      const radius = 37;
      ws.items.forEach((item, i) => {
        const angle = (-90 + (360 / ws.items.length) * i) * (Math.PI / 180);
        const dot = document.createElement('i');
        dot.className = 'ws-dot';
        dot.style.transform =
          `translate(calc(-50% + ${(Math.cos(angle) * radius).toFixed(2)}px),` +
          ` calc(-50% + ${(Math.sin(angle) * radius).toFixed(2)}px))`;
        if (item.icon) {
          const img = document.createElement('img');
          img.src = item.icon;
          img.alt = '';
          img.loading = 'lazy';
          dot.append(img);
        }
        preview.append(dot);
      });

      const caption = document.createElement('figcaption');
      caption.append(ws.name);
      const key = document.createElement('kbd');
      key.textContent = ws.key;
      caption.append(key);

      card.append(preview, caption);
      strip.append(card);
    }
  }

  /* ══ The wheel ═════════════════════════════════════════════════════════
     Rebuilt with the app's own state machine - bloom, presence, sustained aim,
     launch echo - and, because the config says `workspaceSwitchMode: "picker"`,
     with the app's own two levels: the wheel OPENS on the workspaces, and the
     one you aim at replaces the ring with its shortcuts. There is no separate
     switcher on the page because there is none in the product.
     ══════════════════════════════════════════════════════════════════════ */

  const stage = document.getElementById('stage');
  const wheel = document.getElementById('wheel');
  const scrim = document.getElementById('scrim');
  const hub = document.getElementById('hub');
  const pill = document.getElementById('pill');
  const pillName = document.getElementById('pillName');
  const pillChip = document.getElementById('pillChip');
  const cards = [...document.querySelectorAll('.ws-strip .ws')];
  const hfSwitch = document.getElementById('handsFree');
  if (!stage || !wheel || !SPACES.length) return;

  const ECHO_MS = 520;
  const DWELL_MS = 620;
  /* The app's own default hover time for the hands-free gesture
     (`DEFAULTS.radialInstantDwellMs`). The arc is the only sign a timer is
     running, so the demo uses the shipped number rather than a made-up one. */
  const HANDS_FREE_MS = 400;
  const PICKER = LOOK.switchMode === 'picker' && SPACES.length > 1;

  /* The app's own appearance settings, honoured rather than guessed at. */
  stage.style.setProperty('--scrim-o', String(LOOK.backdropOpacity ?? 0.6));
  stage.style.setProperty('--hover', LOOK.hoverColor || '#ffffff');
  stage.style.setProperty('--echo', `${ECHO_MS}ms`);
  stage.style.setProperty('--dwell', `${DWELL_MS}ms`);
  /* `menuRadius`/`iconSize` are a RATIO here, not pixels: the stage is not a
     screen, so the wheel is fitted to it (see `measure`) with the app's
     proportion between the two preserved. */
  const TILE_RATIO = (LOOK.iconSize ?? 64) / (LOOK.menuRadius ?? 140);
  const SPACING = LOOK.appSpacing ?? 10;

  /**
   * Rounded rectangle that STARTS at the top, centred - ported from the app's
   * `roundedRectPathFromTop`. A `<rect>`'s implicit path begins after the
   * top-left arc, so a progress ring drawn on one starts at an arbitrary point
   * of the top edge. A clock that does not start at twelve reads as a bug.
   */
  function roundedRectPathFromTop(size, inset, radius) {
    const near = inset;
    const far = size - inset;
    const mid = size / 2;
    const r = Math.max(0, Math.min(radius, (far - near) / 2));
    return [
      `M ${mid} ${near}`,
      `L ${far - r} ${near}`,
      `A ${r} ${r} 0 0 1 ${far} ${near + r}`,
      `L ${far} ${far - r}`,
      `A ${r} ${r} 0 0 1 ${far - r} ${far}`,
      `L ${near + r} ${far}`,
      `A ${r} ${r} 0 0 1 ${near} ${far - r}`,
      `L ${near} ${near + r}`,
      `A ${r} ${r} 0 0 1 ${near + r} ${near}`,
      'Z',
    ].join(' ');
  }

  const svg = (name) => document.createElementNS('http://www.w3.org/2000/svg', name);

  /** A workspace's picker glyph, drawn from the Lucide nodes the app uses. */
  function lucideSvg(nodes) {
    const root = svg('svg');
    root.setAttribute('class', 'ico');
    root.setAttribute('viewBox', '0 0 24 24');
    for (const node of nodes) {
      const el = svg(node.tag);
      for (const [key, value] of Object.entries(node.attrs)) el.setAttribute(key, value);
      root.append(el);
    }
    return root;
  }

  /* ── Levels ─────────────────────────────────────────────────────────────
     Level 0 is the workspace picker - synthetic slices, one per workspace,
     carrying the number key as a hint exactly as `buildWorkspacePickerItems`
     does. Level 1 is the workspace you aimed at. */

  const pickerItems = () => SPACES.map((ws, i) => ({
    label: ws.name,
    glyph: ws.glyph,
    hint: String(ws.key ?? i + 1),
    pick: i,
  }));

  let level = PICKER ? 0 : 1;
  let space = 0;
  let slices = [];

  function buildSlice(item) {
    const root = document.createElement('div');
    root.className = 'slice';

    const inner = document.createElement('div');
    inner.className = 'slice-inner';

    const ring = svg('svg');
    ring.setAttribute('class', 'dwell');
    const arc = svg('path');
    arc.setAttribute('pathLength', '1');
    ring.append(arc);

    const wave = document.createElement('div');
    wave.className = 'wave';
    const waveLate = document.createElement('div');
    waveLate.className = 'wave is-late';

    const tile = document.createElement('div');
    tile.className = 'tile';
    if (item.icon) {
      /* The rounded mask only goes on when there IS a raster icon to clip -
         Chromium antialiases masks worse than borders, so the app turns it on
         for the same reason and no other. */
      tile.classList.add('has-icon');
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = '';
      img.decoding = 'async';
      tile.append(img);
    } else if (item.glyph) {
      tile.append(lucideSvg(item.glyph));
    } else {
      const fallback = svg('svg');
      fallback.setAttribute('class', 'ico');
      const use = svg('use');
      use.setAttribute('href', '#i-app');
      fallback.append(use);
      tile.append(fallback);
    }

    /* The label plate, with the app's optional chip beside the name - the
       workspace slices are what that chip exists for. */
    const label = document.createElement('span');
    label.className = 'slice-label';
    const name = document.createElement('span');
    name.textContent = item.label;
    label.append(name);
    if (item.hint) {
      const chip = document.createElement('i');
      chip.textContent = item.hint;
      label.append(chip);
    }

    inner.append(ring, wave, waveLate, tile, label);
    root.append(inner);
    wheel.append(root);
    return { root, ring, arc, item };
  }

  /** Swap the ring for another level. The bloom IS the transition, as in the app. */
  function loadLevel() {
    for (const slice of slices) slice.root.remove();
    const items = level === 0 ? pickerItems() : SPACES[space].items;
    slices = items.map(buildSlice);
    if (pillName) pillName.textContent = SPACES[space].name;
    /* At the root the chip is the centre's label; inside a level it is the way
       back out. */
    if (pillChip) pillChip.textContent = level === 0 ? (LOOK.centerLabel || 'Center') : 'Back';
    stage.dataset.level = String(level);
    armReadyAt = Date.now() + 320;
    cards.forEach((card, i) => card.classList.toggle('is-current', i === space));
    measure();
  }

  /* ── Geometry ───────────────────────────────────────────────────────────
     Radius and tile size come from the stage, never from a fixed number: the
     ratio between them is the app's default pair (radius 140, icon 64).

     Sizing off `min(width, height)` alone was not enough. The wheel is not the
     only thing in the stage - the aimed slice puts a label under its tile, and
     the workspace pill sits under the whole wheel - so a radius that fitted the
     TILES still pushed the pill onto the bottom edge and the bottom label into
     the pill. The radius is therefore solved from a budget: reserve the bands
     those two need, keep a gutter no element may cross, and give the wheel what
     is left. */
  const GUTTER = 28;     // nothing comes closer than this to a stage edge
  const RING = 8;        // the aimed tile paints a ring and a glow OUTSIDE itself
  const LABEL_BAND = 34; // the aimed slice's label, under its tile
  const PILL_GAP = 18;   // between that label and the workspace pill
  const PILL_H = 26;     // the workspace pill itself

  /* Everything extra hangs BELOW the hub - the label under the aimed tile, then
     the pill under the whole wheel - so a hub parked at the stage's centre puts
     the composition low and leaves a void up top. Lifting the hub by half of
     what hangs below centres the composition instead of the wheel, and because
     the two margins then match, the same gutter buys a visibly larger wheel. */
  const LIFT = (LABEL_BAND + PILL_GAP + PILL_H) / 2;

  let radius = 150;
  let tile = 64;

  function measure() {
    const box = stage.getBoundingClientRect();

    /* A tile is `TILE_RATIO` of the radius and is drawn centred on it, so what
       the wheel occupies from the centre outwards is `radius * (1 + ratio/2)`.
       With the lift applied, the top and bottom budgets are the same number. */
    const reach = 1 + TILE_RATIO / 2;
    const vBudget = box.height / 2 - GUTTER - RING - LIFT;
    /* Sideways only the widest label overhangs its tile - half of one pill. */
    const hBudget = box.width / 2 - GUTTER - RING - 46;
    radius = clamp(Math.min(vBudget, hBudget) / reach, 62, 168);
    /* Neighbours must not touch, and a workspace with eight shortcuts packs
       tighter than one with three - the chord between two slices is the ceiling
       on the tile, exactly as `packedRadius` is in the app. */
    const n = Math.max(slices.length, 1);
    const chord = n > 1 ? 2 * radius * Math.sin(Math.PI / n) - SPACING : Infinity;
    tile = clamp(Math.min(radius * TILE_RATIO, chord), 28, 68);
    const hubSize = Math.round(tile * 0.84);

    stage.style.setProperty('--origin-y', `${-Math.round(LIFT)}px`);
    stage.style.setProperty('--tile', `${Math.round(tile)}px`);
    stage.style.setProperty('--hub', `${hubSize}px`);

    const ringSize = Math.round(tile) + 14;
    const inset = (ringSize - Math.round(tile)) / 2 - 1.25;
    const ringRadius = Math.min(18 + inset, (ringSize - 2.5) / 2);
    const path = roundedRectPathFromTop(ringSize, 1.25, ringRadius);
    for (const slice of slices) {
      slice.ring.setAttribute('width', ringSize);
      slice.ring.setAttribute('height', ringSize);
      slice.ring.setAttribute('viewBox', `0 0 ${ringSize} ${ringSize}`);
      slice.arc.setAttribute('d', path);
    }
    /* The pill clears the bottom tile's label; the second term is the hard stop,
       so however the budget worked out it never crosses the gutter. Both are
       measured from the stage's centre, hence the lift. */
    if (pill) {
      const below = Math.min(
        -LIFT + radius + tile / 2 + LABEL_BAND + PILL_GAP,
        box.height / 2 - GUTTER - PILL_H,
      );
      pill.style.setProperty('--pill-y', `${Math.round(below)}px`);
    }
  }

  const angleOf = (i) => -90 + (360 / slices.length) * i;

  /* ── States ─────────────────────────────────────────────────────────────
     Presence is one transform per slice: position and scale together, so a
     change of aim only swaps a value and never asks for layout. */

  let open = false;
  let active = -1;
  let firing = false;

  function paint() {
    slices.forEach((slice, i) => {
      const s = slice.root.style;
      if (!open) {
        s.setProperty('--tx', '0px');
        s.setProperty('--ty', '0px');
        s.setProperty('--ts', '0.2');
        s.setProperty('--to', '0');
        return;
      }
      const rad = angleOf(i) * (Math.PI / 180);
      s.setProperty('--tx', `${(Math.cos(rad) * radius).toFixed(2)}px`);
      s.setProperty('--ty', `${(Math.sin(rad) * radius).toFixed(2)}px`);

      if (active < 0) {
        s.setProperty('--ts', '1');
        s.setProperty('--to', '1');
      } else {
        const gap = Math.min(
          Math.abs(i - active),
          slices.length - Math.abs(i - active),
        );
        s.setProperty('--ts', gap === 0 ? '1.1' : gap === 1 ? '1' : '0.93');
        s.setProperty('--to', gap === 0 ? '1' : gap === 1 ? '0.95' : '0.78');
      }
      slice.root.classList.toggle('is-active', i === active);
    });

    hub.style.setProperty('--hub-s', open ? '1' : '0.2');
    hub.style.setProperty('--hub-o', open ? '1' : '0');
    scrim.classList.toggle('is-on', open);
    pill.classList.toggle('is-on', open);
    pill.style.transform = open
      ? 'translate(-50%, var(--pill-y))'
      : 'translate(-50%, 0) scale(.9)';
  }

  function setActive(index) {
    if (active === index) return;
    active = index;
    paint();
    /* A new aim restarts the clock; the dead zone stops it. Only in manual
       mode - the unattended loop drives its own arc. */
    if (manual) armDwell(index);
  }

  function reset() {
    firing = false;
    window.clearTimeout(dwellTimer);
    dwellTimer = 0;
    for (const slice of slices) {
      slice.root.classList.remove('is-fired', 'is-faded', 'is-dwelling', 'is-active');
    }
    active = -1;
  }

  /** The launch echo: everything else leaves, the confirmed tile kicks and two
      waves go out of it. Nothing else is on screen by then - which is the whole
      point of the echo. */
  function fire(index) {
    if (firing || index < 0) return;
    firing = true;
    slices.forEach((slice, i) => {
      slice.root.classList.remove('is-dwelling');
      slice.root.classList.add(i === index ? 'is-fired' : 'is-faded');
    });
    scrim.classList.remove('is-on');
  }

  /* ── The unattended loop ────────────────────────────────────────────────
     It plays the full gesture - hold, aim, sustained aim, release - and hands
     over the instant a pointer enters the stage. */

  let timers = [];
  const after = (ms, fn) => timers.push(window.setTimeout(fn, ms));
  const stopTimers = () => { timers.forEach(window.clearTimeout); timers = []; };

  let target = 0;
  let looping = false;

  /**
   * Enter the workspace a picker slice points at - the app's own handler: it
   * pushes that workspace onto the stack and swaps the ring for its shortcuts.
   */
  function enterSpace(index) {
    space = ((index % SPACES.length) + SPACES.length) % SPACES.length;
    level = 1;
    reset();
    loadLevel();
    paint();
  }

  /** Back out to the picker, which is where the wheel opens. */
  function toRoot() {
    level = PICKER ? 0 : 1;
    reset();
    loadLevel();
    paint();
  }

  /* One pass of the real gesture: open on the picker, aim a workspace, enter it,
     aim a shortcut, launch. Three levels of the product in one loop, and not a
     word of copy spent on any of them. */
  let nextSpace = 0;

  function cycle() {
    if (!looping) return;
    stopTimers();
    toRoot();
    open = true;
    paint();

    let t = 0;
    const aim = (index, then) => {
      after((t += 620), () => {
        setActive(index);
        if (slices[index]) slices[index].root.classList.add('is-dwelling');
      });
      after((t += DWELL_MS), then);
    };

    if (PICKER) {
      aim(nextSpace, () => {
        enterSpace(nextSpace);
        open = true;
        paint();
      });
    }

    /* The shortcut it lands on: a different one each pass, so the loop is not
       the same throw three times. */
    const shortcut = () => {
      const items = SPACES[nextSpace].items.length;
      return items ? (nextSpace * 3 + 1) % items : 0;
    };

    after((t += 120), () => {
      const index = shortcut();
      setActive(index);
      if (slices[index]) slices[index].root.classList.add('is-dwelling');
    });
    after((t += DWELL_MS), () => fire(shortcut()));
    after((t += ECHO_MS), () => {
      open = false;
      toRoot();
      paint();
    });
    /* Short: the gesture ending is worth showing, a bare wallpaper is not. */
    after((t += 460), () => {
      nextSpace = (nextSpace + 1) % SPACES.length;
      cycle();
    });
  }

  function startLoop() {
    if (looping) return;
    looping = true;
    cycle();
  }

  function stopLoop() {
    looping = false;
    stopTimers();
  }

  /* ── Aiming it yourself ─────────────────────────────────────────────────
     By direction, like the app's default: the slice is chosen from the vector
     out of the centre, and inside the activation zone nothing is aimed at -
     that dead zone is what cancels. */

  let manual = false;

  /* ── Launch without clicking ────────────────────────────────────────────
     The app's hands-free gesture, switchable here so it can be felt rather
     than read about: the pointer stops existing, the aim alone lights a
     target, and holding that aim opens it. Nothing is ever clicked. */

  let handsFree = LOOK.handsFree === true;
  let dwellTimer = 0;
  /* A level swap puts new slices under a still pointer. Without a settling
     window the first move after it would resolve an aim the user never made -
     the app wins the same window back on every level, not only on every open. */
  let armReadyAt = 0;

  function cancelDwell() {
    window.clearTimeout(dwellTimer);
    dwellTimer = 0;
    for (const slice of slices) slice.root.classList.remove('is-dwelling');
  }

  /** What a sustained aim resolves to - a workspace opens, a shortcut launches. */
  function commit(index) {
    const chosen = slices[index];
    if (!chosen || firing) return;
    if (chosen.item && chosen.item.pick !== undefined) {
      enterSpace(chosen.item.pick);
      open = true;
      paint();
      return;
    }
    fire(index);
    after(ECHO_MS, () => { open = false; reset(); paint(); });
    /* Back to the picker, so the next throw can start straight away. */
    after(ECHO_MS + 260, () => { if (manual) { toRoot(); open = true; paint(); } });
  }

  function armDwell(index) {
    cancelDwell();
    if (!handsFree || !manual || firing || index < 0) return;
    const settling = armReadyAt - Date.now();
    if (settling > 0) {
      dwellTimer = window.setTimeout(() => armDwell(active), settling);
      return;
    }
    const slice = slices[index];
    if (!slice) return;
    slice.root.style.setProperty('--dwell', `${HANDS_FREE_MS}ms`);
    slice.root.classList.add('is-dwelling');
    dwellTimer = window.setTimeout(() => commit(index), HANDS_FREE_MS);
  }

  function setHandsFree(on) {
    handsFree = on;
    cancelDwell();
    stage.classList.toggle('is-handsfree', on);
    if (hfSwitch) {
      hfSwitch.setAttribute('aria-checked', String(on));
      hfSwitch.querySelector('.toggle').classList.toggle('is-on', on);
    }
    if (on && manual && active >= 0) armDwell(active);
  }

  if (hfSwitch) {
    setHandsFree(handsFree);
    hfSwitch.addEventListener('click', () => setHandsFree(!handsFree));
  }

  function enterManual() {
    if (manual) return;
    manual = true;
    stopLoop();
    stage.classList.add('is-manual');
    stopTimers();
    toRoot();
    open = true;
    paint();
  }

  function leaveManual() {
    if (!manual) return;
    manual = false;
    cancelDwell();
    stage.classList.remove('is-manual');
    stopTimers();
    toRoot();
    open = false;
    paint();
    after(320, startLoop);
  }

  function aimAt(event) {
    /* `pointerenter` is not guaranteed (a pointer parked on the stage before the
       page settles never crosses the boundary), so the first move takes over too. */
    if (!manual) enterManual();
    if (firing) return;
    const box = stage.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2 - LIFT);
    const distance = Math.hypot(dx, dy);

    /* The activation zone: closer than this and the gesture is a cancel, so
       nothing may be lit. */
    if (distance < Math.max(tile * 0.62, 34)) {
      setActive(-1);
      return;
    }
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const step = 360 / slices.length;
    const index = ((Math.round((deg + 90) / step) % slices.length) + slices.length) % slices.length;
    setActive(index);
  }

  /* The centre, inside a level, is the way back out - the pill's "Back" chip
     names the same gesture. At the root it is inert here, and says so. */
  hub.addEventListener('click', (event) => {
    if (level === 0) return;
    event.stopPropagation();
    cancelDwell();
    toRoot();
    open = true;
    paint();
  });

  /* Only where a pointer can actually hover. On a touch screen the stage stays a
     picture that plays itself: taking the gesture there would mean swallowing
     the scroll that carries the reader down the page. */
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('pointerenter', enterManual);
    stage.addEventListener('pointermove', aimAt);
    stage.addEventListener('pointerleave', leaveManual);

    stage.addEventListener('pointerdown', (event) => {
      if (!manual) { enterManual(); aimAt(event); }
      if (firing || active < 0) return;
      event.preventDefault();

      /* On the picker a release does not launch anything - it opens that
         workspace's ring, which is the whole point of the level. */
      const chosen = slices[active];
      if (chosen && chosen.item && chosen.item.pick !== undefined) {
        enterSpace(chosen.item.pick);
        return;
      }

      fire(active);
      after(ECHO_MS, () => { open = false; reset(); paint(); });
      after(ECHO_MS + 260, () => { if (manual) { toRoot(); open = true; paint(); } });
    });
  }

  /* ── Lifecycle ──────────────────────────────────────────────────────────
     Nothing runs while the stage is off screen or the tab is hidden: idle work
     nobody is watching is work the page should not be doing. */

  loadLevel();
  paint();

  let visible = false;
  const resume = () => {
    if (visible && !manual && !document.hidden) startLoop();
    else stopLoop();
  };

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    resume();
  }, { threshold: 0.2 }).observe(stage);

  document.addEventListener('visibilitychange', resume);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => { measure(); paint(); }, 140);
  }, { passive: true });

  /* Under reduced motion the loop still runs - the gesture is the content -
     but the CSS above strips the echo and the transitions down to nothing. */
  reduced.addEventListener('change', resume);
})();
