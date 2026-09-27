/* ══════════════════════════════════════════════════════════════════════════
   Rovyl - the wheel's sound effects, on the page

   Ported from src/utils/radialSound.ts: the same ten bass notes, synthesized
   with Web Audio from the same nodes, through the same master gain and limiter.
   A note on the page is the note in the app. Keep the two in step.

   The page holds ONE copy of the sound settings. The hero wheel plays from it,
   and the Sound section of the settings panel edits it, so a note picked in the
   panel is the note the wheel at the top of the page answers with.

   Browsers will not start audio before a visitor has interacted with the page,
   and the page does not try to: until the first click or key press every note
   is simply skipped, rather than queued up to arrive late or warned about in
   the console - and the Sound switch reads off until then, so the press it
   invites is the one that turns sound on.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let ctx = null;
  let master = null;
  /** The note still sounding, so the next one can cut it: a fast sweep must not pile up into mud. */
  let lastVoice = null;
  let sleepTimer = null;
  let noiseBuffer = null;

  /** How long after the last use the stream is released. Covers a quick reopen. */
  const SLEEP_AFTER_MS = 1500;
  /** Master level, with a limiter behind it; the same chain the sounds were auditioned through. */
  const MASTER_GAIN = 0.7;

  /* ── Settings ───────────────────────────────────────────────────────────
     The app's defaults: both moments on, Sub Tick to open, Thump to move. */
  const settings = {
    radialSounds: true,
    radialSoundVolume: 100,
    radialOpenSound: true,
    radialOpenSoundId: 'sub-tick',
    radialHoverSound: true,
    radialHoverSoundId: 'thump',
  };
  const DEFAULTS = { ...settings };
  /* Then the machine's own picks, when `workspaces.js` carries them. */
  const look = (window.ROVYL && window.ROVYL.look) || {};
  if (look.sounds) {
    for (const key of Object.keys(DEFAULTS)) {
      if (look.sounds[key] !== undefined) settings[key] = look.sounds[key];
    }
  }
  const listeners = new Set();

  /* ── Autoplay ───────────────────────────────────────────────────────────
     No page may start audio before its visitor has clicked or pressed a key.
     `ready` is whether that has happened, and the page's Sound switch shows
     it: a switch that reads "on" while nothing can play gets pressed, turns
     OFF, and has to be pressed again before anything is heard.

     `userActivation.hasBeenActive` is the browser's own answer, and it is
     already true when a capturing listener hears the press that made it so. A
     key the browser does not count (Tab, Escape) leaves it false, and is
     ignored here too rather than unlocking a stream that could not start. */
  let ready = Boolean(navigator.userActivation && navigator.userActivation.hasBeenActive);
  const allowed = () => ready;
  const readyListeners = new Set();

  /* The first gesture starts the stream inside the gesture itself, which is the
     one place every browser lets it start, and lets it sleep again straight away.
     Later notes then only have to resume it.

     A press on a Sound switch is left to the switch: it has to know that this
     press is the one that made sound possible, so that it turns sound ON rather
     than toggling a setting that was on all along. */
  function unlock(event) {
    if (ready) return;
    const target = event && event.target;
    if (target && target.closest && target.closest('[data-sound-switch]')) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    ready = true;
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    if (wanted()) {
      const c = context();
      if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
      sleep();
    }
    for (const listener of readyListeners) listener();
  }
  if (!ready) {
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
  }

  function context() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    master = ctx.createGain();
    master.gain.value = masterGain();
    master.connect(limiter).connect(ctx.destination);
    return ctx;
  }

  /** Squared, because loudness is heard on a log scale: see `masterGain` in the app. */
  function masterGain() {
    const v = normalizeVolume(settings.radialSoundVolume) / 100;
    return MASTER_GAIN * v * v;
  }

  /* ── Building blocks ────────────────────────────────────────────────── */

  /** Gain envelope: silence → `peak` over `attack`, then an exponential fall to silence over `decay`. */
  function envelope(c, t, attack, peak, decay) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** An oscillator, optionally gliding from `from` to `to` over `glide` seconds. */
  function tone(c, type, from, to, t, glide) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + glide);
    return o;
  }

  function lowpass(c, frequency, q = 0.7) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  function noise(c) {
    if (!noiseBuffer || noiseBuffer.sampleRate !== c.sampleRate) {
      noiseBuffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.25), c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = c.createBufferSource();
    source.buffer = noiseBuffer;
    return source;
  }

  function run(nodes, t, duration) {
    for (const node of nodes) {
      node.start(t);
      node.stop(t + duration);
    }
  }

  /* ── The ten ────────────────────────────────────────────────────────── */

  const VOICES = {
    /** Sine 110 → 45 Hz, 120 ms: a soft kick drum. */
    thump(c, out, t) {
      const o = tone(c, 'sine', 110, 45, t, 0.08);
      o.connect(envelope(c, t, 0.002, 0.9, 0.12)).connect(out);
      run([o], t, 0.14);
    },
    /** Sine 58 Hz with a 2.5 kHz tick on top, so it still reads on small speakers. 75 ms. */
    'sub-tick'(c, out, t) {
      const o = tone(c, 'sine', 58, 58, t, 0);
      o.connect(envelope(c, t, 0.001, 0.85, 0.07)).connect(out);
      const n = noise(c);
      const highpass = c.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 2500;
      n.connect(highpass).connect(envelope(c, t, 0.0005, 0.12, 0.006)).connect(out);
      run([o, n], t, 0.09);
    },
    /** Triangle 190 → 75 Hz through a 450 Hz lowpass, 75 ms: knuckle on a desk. */
    knock(c, out, t) {
      const o = tone(c, 'triangle', 190, 75, t, 0.05);
      o.connect(lowpass(c, 450, 1)).connect(envelope(c, t, 0.001, 1.0, 0.07)).connect(out);
      run([o], t, 0.09);
    },
    /** Two saws at 55 Hz through a resonant lowpass snapping 1.4 kHz → 140 Hz, 160 ms. */
    pluck(c, out, t) {
      const a = tone(c, 'sawtooth', 55, 55, t, 0);
      const b = tone(c, 'sawtooth', 55.4, 55.4, t, 0);
      const f = lowpass(c, 1400, 6);
      f.frequency.setValueAtTime(1400, t);
      f.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      a.connect(f);
      b.connect(f);
      f.connect(envelope(c, t, 0.002, 0.34, 0.16)).connect(out);
      run([a, b], t, 0.18);
    },
    /** Square 82 Hz through a 320 Hz lowpass, 65 ms: an old console menu. */
    pulse(c, out, t) {
      const o = tone(c, 'square', 82, 82, t, 0);
      o.connect(lowpass(c, 320, 0.7)).connect(envelope(c, t, 0.004, 0.32, 0.06)).connect(out);
      run([o], t, 0.08);
    },
    /** Sine 240 → 38 Hz, 200 ms: a falling "bwomp". */
    drop(c, out, t) {
      const o = tone(c, 'sine', 240, 38, t, 0.16);
      o.connect(envelope(c, t, 0.003, 0.85, 0.2)).connect(out);
      run([o], t, 0.22);
    },
    /** Noise under a 220 Hz lowpass with a sine 95 → 70 Hz, 50 ms: a fingertip on felt. */
    'felt-tap'(c, out, t) {
      const n = noise(c);
      n.connect(lowpass(c, 220, 1.2)).connect(envelope(c, t, 0.001, 1.6, 0.045)).connect(out);
      const o = tone(c, 'sine', 95, 70, t, 0.04);
      o.connect(envelope(c, t, 0.001, 0.5, 0.05)).connect(out);
      run([n, o], t, 0.07);
    },
    /** Sine 90 → 65 Hz, frequency-modulated at 36 Hz, 115 ms: a bouncy wobble. */
    rubber(c, out, t) {
      const o = tone(c, 'sine', 90, 65, t, 0.1);
      const m = tone(c, 'sine', 36, 36, t, 0);
      const depth = c.createGain();
      depth.gain.setValueAtTime(40, t);
      depth.gain.exponentialRampToValueAtTime(1, t + 0.1);
      m.connect(depth).connect(o.frequency);
      o.connect(envelope(c, t, 0.002, 0.85, 0.11)).connect(out);
      run([o, m], t, 0.13);
    },
    /** Saws at 55 and 57.2 Hz beating through a 520 Hz lowpass, 105 ms. */
    reese(c, out, t) {
      const a = tone(c, 'sawtooth', 55, 55, t, 0);
      const b = tone(c, 'sawtooth', 57.2, 57.2, t, 0);
      const f = lowpass(c, 520, 2);
      a.connect(f);
      b.connect(f);
      f.connect(envelope(c, t, 0.004, 0.3, 0.1)).connect(out);
      run([a, b], t, 0.12);
    },
    /** Saturated sine at 160 Hz, 32 ms: a phone's vibration tap. */
    haptic(c, out, t) {
      const o = tone(c, 'sine', 160, 160, t, 0);
      const shaper = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 127.5 - 1) * 3) / Math.tanh(3);
      shaper.curve = curve;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.42, t + 0.001);
      g.gain.setValueAtTime(0.42, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.032);
      o.connect(shaper).connect(g).connect(out);
      run([o], t, 0.04);
    },
  };

  /** In the order the settings list them - the order they were auditioned in. */
  const SOUNDS = [
    { id: 'thump', name: 'Thump' },
    { id: 'sub-tick', name: 'Sub Tick' },
    { id: 'knock', name: 'Knock' },
    { id: 'pluck', name: 'Pluck' },
    { id: 'pulse', name: 'Pulse' },
    { id: 'drop', name: 'Drop' },
    { id: 'felt-tap', name: 'Felt Tap' },
    { id: 'rubber', name: 'Rubber' },
    { id: 'reese', name: 'Reese' },
    { id: 'haptic', name: 'Haptic' },
  ];

  const normalize = (value, fallback) =>
    (typeof value === 'string' && Object.prototype.hasOwnProperty.call(VOICES, value) ? value : fallback);

  function normalizeVolume(value) {
    const n = typeof value === 'number' && Number.isFinite(value) ? value : 100;
    return Math.round(Math.min(100, Math.max(0, n)));
  }

  /* ── Which note, when ───────────────────────────────────────────────── */

  /** What each moment plays, with `null` for a moment that is switched off. */
  function resolve() {
    const on = settings.radialSounds !== false;
    return {
      open: on && settings.radialOpenSound !== false ? normalize(settings.radialOpenSoundId, 'sub-tick') : null,
      hover: on && settings.radialHoverSound !== false ? normalize(settings.radialHoverSoundId, 'thump') : null,
    };
  }

  const wanted = () => {
    const sounds = resolve();
    return sounds.open !== null || sounds.hover !== null;
  };

  /** The centre, as a highlight. Everything else that can be lit is an item. */
  const HUB = '__hub__';
  /** How long after the opening note a highlight change stays silent - about the note's own length. */
  const QUIET_MS = 150;

  /**
   * The app's `noteForHighlight`. An item plays the hover note; the centre plays
   * the OPENING note, but only once the aim has been out to an item since the
   * wheel opened; and nothing plays in the first `QUIET_MS`, where it would land
   * on top of the opening note and cut it off.
   */
  function noteFor(target, aimedAway, msSinceOpen, sounds) {
    if (target === null || msSinceOpen < QUIET_MS) return null;
    if (target === HUB) return aimedAway ? sounds.open : null;
    return sounds.hover;
  }

  /* ── Playback ───────────────────────────────────────────────────────── */

  function wake() {
    if (sleepTimer !== null) {
      window.clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    if (!allowed()) return;
    const c = context();
    if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
  }

  /** Releases the stream shortly after the last use. Calling it again restarts the wait. */
  function sleep() {
    if (!ctx) return;
    if (sleepTimer !== null) window.clearTimeout(sleepTimer);
    sleepTimer = window.setTimeout(() => {
      sleepTimer = null;
      if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
    }, SLEEP_AFTER_MS);
  }

  function play(id) {
    if (!allowed()) return;
    const c = context();
    if (!c || !master) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    const t = c.currentTime + 0.005;
    if (lastVoice) lastVoice.gain.setTargetAtTime(0, t, 0.006);
    const voice = c.createGain();
    voice.connect(master);
    (VOICES[id] || VOICES.thump)(c, voice, t);
    lastVoice = voice;
    window.setTimeout(() => voice.disconnect(), 400);
  }

  /** One note from outside the wheel - the panel - releasing the stream again once it has played. */
  function preview(id) {
    play(id);
    sleep();
  }

  /* ── The page's copy of the settings ────────────────────────────────── */

  function set(patch) {
    Object.assign(settings, patch);
    if (master) master.gain.value = masterGain();
    for (const listener of listeners) listener(settings);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /** Called once, when the page becomes allowed to play. */
  function onReady(listener) {
    readyListeners.add(listener);
    return () => readyListeners.delete(listener);
  }

  window.RovylSound = {
    SOUNDS,
    DEFAULTS,
    HUB,
    settings,
    set,
    subscribe,
    isReady: allowed,
    onReady,
    /** For a Sound switch's own press, which the automatic unlock leaves alone. */
    unlock: () => unlock(null),
    resolve,
    normalize,
    normalizeVolume,
    noteFor,
    wake,
    sleep,
    play,
    preview,
  };
})();
