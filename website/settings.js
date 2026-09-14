/* ══════════════════════════════════════════════════════════════════════════
   Rovyl - the settings panel, working

   A screenshot of a settings window answers one question and refuses every
   other. This is the panel itself: the five sections the app ships, their real
   rows, and controls that actually move. Nothing persists and nothing is
   pretend-wired to a backend - flipping a switch here changes this page's copy
   of the config and the things that read it, exactly as the app's does.

   The rows are the app's own, from `PrecisionSettings`: same groups, same
   titles, same descriptions, and the same conditional rows that appear only
   once the feature above them is on. Starting values come from `workspaces.js`,
   so the panel opens on the machine's real configuration.
   ══════════════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const DATA = window.ROVYL || {};
  const LOOK = DATA.look || {};
  const SPACES = (DATA.workspaces || []).filter((w) => w.items && w.items.length);

  const win = document.getElementById('settingsWin');
  const nav = document.getElementById('winNav');
  const main = document.getElementById('winMain');
  if (!win || !nav || !main) return;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ── State ──────────────────────────────────────────────────────────────
     Seeded from the real config so the panel opens on what is actually set. */
  const S = {
    language: 'en',
    openAtLogin: true,
    workspaceSwitchMode: LOOK.switchMode || 'picker',

    globalShortcut: LOOK.globalShortcut || 'Alt+Z',
    shortcutTriggerMode: 'toggle',
    enableMouseTrigger: LOOK.mouseTrigger === true,
    mouseTriggerButton: LOOK.mouseButton || 'middle',
    mouseTriggerMode: LOOK.mouseMode || 'click',
    radialMonitor: LOOK.radialMonitor === 'cursor' ? 'cursor' : 'primary',
    activationThreshold: LOOK.activationThreshold ?? 60,
    radialInstantActivate: LOOK.handsFree ? 'dwell' : 'off',
    radialInstantSensitivity: LOOK.handsFreeSensitivity || 'medium',
    radialInstantDwellMs: LOOK.handsFreeDwellMs ?? 400,

    appearanceTheme: LOOK.theme === 'white' ? 'white' : 'black',
    menuRadius: LOOK.menuRadius ?? 140,
    iconSize: LOOK.iconSize ?? 64,
    appSpacing: LOOK.appSpacing ?? 10,
    radialHoverColor: LOOK.hoverColor || '#FFFFFF',
    radialSelectionMode: 'angle',
    alwaysShowAppLabels: false,
    backdropOpacity: LOOK.backdropOpacity ?? 0.6,
    taskbarOverlay: false,
    taskbarStart: false,
    taskbarApps: false,

    performanceMode: false,
    strictOfflineMode: false,
    gameMode: false,
    gameScope: 'all',

    section: 'trigger',
  };

  const SECTIONS = [
    { id: 'general', label: 'General', icon: 'i-cog', caption: 'Core Rovyl behavior.' },
    { id: 'trigger', label: 'Activation', icon: 'i-mouse', caption: 'How and where the wheel appears.' },
    { id: 'appearance', label: 'Appearance', icon: 'i-sliders', caption: 'Shape, presence, and theme.' },
    { id: 'spaces', label: 'Workspaces', icon: 'i-layers', caption: 'Contexts and their shortcuts.' },
    { id: 'advanced', label: 'Advanced', icon: 'i-shield', caption: 'Performance, protection, and data.' },
  ];

  /* ── Rows ───────────────────────────────────────────────────────────────
     Built per render, because several of them only exist while the feature
     above them is on - a control that stays on screen controlling nothing is
     worse than one that is not offered. */

  const px = (v) => `${Math.round(v)} px`;

  function rowsFor(id) {
    if (id === 'general') return [
      { group: 'Language', title: 'Language', desc: 'The language of this panel and the wheel.',
        kind: 'select', key: 'language',
        choices: [['en', 'English'], ['pt', 'Portugues'], ['es', 'Espanol'], ['de', 'Deutsch'], ['fr', 'Francais'], ['ar', 'Arabic']] },
      { group: 'Startup', title: 'Start with Windows', desc: 'Rovyl is ready as soon as you sign in to Windows.',
        kind: 'bool', key: 'openAtLogin' },
      { group: 'Workspaces', title: 'Workspace switching', desc: 'Use the visual wheel picker or number keys.',
        kind: 'seg', key: 'workspaceSwitchMode', choices: [['picker', 'Picker'], ['hotkeys', 'Keys']] },
    ];

    if (id === 'trigger') return [
      { group: 'Keyboard', title: 'Global shortcut', desc: 'Open the wheel over any application.',
        kind: 'keys', value: S.globalShortcut },
      { group: 'Keyboard', title: 'Shortcut behavior', desc: 'Press once to open and again to close, or hold it open.',
        kind: 'seg', key: 'shortcutTriggerMode', choices: [['toggle', 'Toggle'], ['hold', 'Hold']] },
      { group: 'Mouse', title: 'Mouse trigger', desc: 'Open Rovyl with a mouse button instead of the keyboard.',
        kind: 'bool', key: 'enableMouseTrigger' },
      { group: 'Mouse', title: 'Trigger button', desc: 'Side buttons are usually free; left and right stay with Windows.',
        kind: 'seg', key: 'mouseTriggerButton', choices: [['middle', 'Wheel'], ['x1', 'Back'], ['x2', 'Forward']] },
      { group: 'Mouse', title: 'Gesture behavior', desc: 'Click keeps the wheel open; hold runs the selection on release.',
        kind: 'seg', key: 'mouseTriggerMode', choices: [['click', 'Click'], ['hold', 'Hold']] },
      { group: 'Position', title: 'Monitor',
        desc: S.radialMonitor === 'cursor'
          ? 'The wheel opens on the screen the pointer is already on, so what you launch lands where you are working.'
          : 'The wheel always opens on the main screen, wherever the pointer happens to be.',
        kind: 'seg', key: 'radialMonitor', choices: [['primary', 'Main screen'], ['cursor', 'Follow pointer']] },
      { group: 'Position', title: 'Activation zone', desc: 'Cursor distance required to confirm a target.',
        kind: 'range', key: 'activationThreshold', min: 20, max: 120, step: 1, format: px },
      { group: 'Hands-free', title: 'Launch without clicking',
        desc: 'Hides the pointer and picks by direction - move toward a target and it opens by itself. Escape closes the wheel without opening anything.',
        kind: 'bool', key: 'radialInstantActivate', on: 'dwell', off: 'off' },
      ...(S.radialInstantActivate === 'dwell' ? [
        { group: 'Hands-free', title: 'Direction sensitivity',
          desc: 'How far your hand must travel before that direction is chosen. High picks on the smallest movement.',
          kind: 'seg', key: 'radialInstantSensitivity', choices: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
        { group: 'Hands-free', title: 'Hover time',
          desc: 'How long a target must stay aimed before it opens. Drag to zero and the direction opens the moment it commits.',
          kind: 'range', key: 'radialInstantDwellMs', min: 0, max: 1200, step: 20,
          format: (v) => (Math.round(v) === 0 ? 'Instant' : `${Math.round(v)} ms`) },
      ] : []),
    ];

    if (id === 'appearance') return [
      { kind: 'preview' },
      { group: 'Theme', title: 'Rovyl surfaces', desc: 'Applies to the window and title bar. The wheel remains dark.',
        kind: 'seg', key: 'appearanceTheme', choices: [['black', 'Black'], ['white', 'White']] },
      { group: 'Wheel', title: 'Orbital radius', desc: 'Perceived wheel diameter.',
        kind: 'range', key: 'menuRadius', min: 90, max: 220, step: 1, format: px },
      { group: 'Wheel', title: 'Icon size', desc: 'Visual weight of each target.',
        kind: 'range', key: 'iconSize', min: 36, max: 92, step: 1, format: px },
      { group: 'Wheel', title: 'Target spacing', desc: 'Free space between items.',
        kind: 'range', key: 'appSpacing', min: 0, max: 40, step: 1, format: px },
      { group: 'Wheel', title: 'Hover color', desc: 'Color used by the target under the pointer.',
        kind: 'color', key: 'radialHoverColor' },
      { group: 'Wheel', title: 'Targeting',
        desc: S.radialInstantActivate === 'dwell'
          ? 'Launch without clicking is on, so the wheel always aims by direction - each item owns an equal slice of the screen.'
          : S.radialSelectionMode === 'cursor'
            ? 'Only the icon under the pointer highlights. Release away from every icon to cancel.'
            : 'Aim by direction: the slice you point toward highlights from anywhere on screen.',
        kind: 'seg', key: 'radialSelectionMode', choices: [['angle', 'Direction'], ['cursor', 'Pointer']] },
      { group: 'Wheel', title: 'Persistent labels', desc: 'Keep every target name visible.',
        kind: 'bool', key: 'alwaysShowAppLabels' },
      { group: 'Presence', title: 'Background dimming',
        desc: 'How much the rest of the screen recedes. At 100% it goes: the desktop is covered edge to edge.',
        kind: 'range', key: 'backdropOpacity', min: 0, max: 1, step: 0.01,
        format: (v) => `${Math.round(v * 100)}%` },
      { group: 'Presence', title: 'Quiet the taskbar',
        desc: 'Hide parts of the Windows taskbar while the wheel is open, on the screen the wheel is on. Everything comes back when it closes.',
        kind: 'bool', key: 'taskbarOverlay' },
      ...(S.taskbarOverlay ? [
        { group: 'Presence', title: 'Keep the Start button', desc: 'Start and Task View stay on the bar.',
          kind: 'bool', key: 'taskbarStart' },
        { group: 'Presence', title: 'Keep pinned and open apps', desc: 'The app buttons, and anything else docked beside them.',
          kind: 'bool', key: 'taskbarApps' },
      ] : []),
    ];

    if (id === 'spaces') return [{ kind: 'spaces' }];

    return [
      { group: 'Performance', title: 'Precision mode', desc: 'Prioritize immediate response and reduce visual effects.',
        kind: 'bool', key: 'performanceMode' },
      { group: 'Performance', title: 'Strict offline mode', desc: 'Never reach the network, not even for a website shortcut icon.',
        kind: 'bool', key: 'strictOfflineMode' },
      { group: 'Protection', title: 'Fullscreen protection', desc: 'Prevent accidental openings during games and videos.',
        kind: 'bool', key: 'gameMode' },
      ...(S.gameMode ? [
        { group: 'Protection', title: 'Scope', desc: 'All fullscreen apps or only a selected list.',
          kind: 'seg', key: 'gameScope', choices: [['all', 'All'], ['list', 'List']] },
      ] : []),
      { group: 'Data', title: 'Export settings', desc: 'Save a portable copy of your configuration.',
        kind: 'action', label: 'Export', icon: 'i-up' },
      { group: 'Data', title: 'Import settings', kind: 'action', label: 'Import', icon: 'i-down' },
      { group: 'Data', title: 'Restore defaults', desc: 'Erase local settings and start over.',
        kind: 'action', label: 'Restore', danger: true },
    ];
  }

  /* ── Building blocks ────────────────────────────────────────────────────
     The same controls the app declares: bool, segmented, range, select,
     value-open, action. */

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  const glyph = (id, cls) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', cls || 'ico');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  };

  function set(key, value) {
    S[key] = value;
    render();
  }

  function control(row) {
    if (row.kind === 'bool') {
      const onValue = row.on !== undefined ? row.on : true;
      const offValue = row.off !== undefined ? row.off : false;
      const isOn = S[row.key] === onValue;
      const button = el('button', `toggle${isOn ? ' is-on' : ''}`);
      button.type = 'button';
      button.setAttribute('role', 'switch');
      button.setAttribute('aria-checked', String(isOn));
      button.setAttribute('aria-label', row.title);
      button.addEventListener('click', () => set(row.key, isOn ? offValue : onValue));
      return button;
    }

    if (row.kind === 'seg') {
      const wrap = el('div', 'seg');
      wrap.setAttribute('role', 'group');
      wrap.setAttribute('aria-label', row.title);
      for (const [value, label] of row.choices) {
        const option = el('button', S[row.key] === value ? 'is-on' : '', label);
        option.type = 'button';
        option.addEventListener('click', () => set(row.key, value));
        wrap.append(option);
      }
      return wrap;
    }

    if (row.kind === 'select') {
      const wrap = el('span', 'select');
      const select = el('select');
      select.setAttribute('aria-label', row.title);
      for (const [value, label] of row.choices) {
        const option = el('option', '', label);
        option.value = value;
        if (S[row.key] === value) option.selected = true;
        select.append(option);
      }
      select.addEventListener('change', () => set(row.key, select.value));
      wrap.append(select, glyph('i-chevron'));
      return wrap;
    }

    if (row.kind === 'color') {
      const wrap = el('span', 'color-control');
      const input = el('input');
      input.type = 'color';
      input.value = S[row.key];
      input.setAttribute('aria-label', row.title);
      input.addEventListener('input', () => set(row.key, input.value));
      wrap.append(input, el('b', '', S[row.key].toUpperCase()));
      return wrap;
    }

    if (row.kind === 'keys') {
      const wrap = el('span', 'kbd-set');
      for (const key of row.value.split('+')) wrap.append(el('kbd', '', key.trim()));
      return wrap;
    }

    if (row.kind === 'action') {
      const button = el('button', `btn${row.danger ? ' is-danger' : ''}`, row.label);
      button.type = 'button';
      if (row.icon) button.prepend(glyph(row.icon));
      /* Deliberately inert: this is a tour of the panel, not a copy of the app
         that could write to anything. */
      button.addEventListener('click', () => flash(button));
      return button;
    }

    return null;
  }

  let flashTimer = 0;
  function flash(button) {
    window.clearTimeout(flashTimer);
    button.classList.add('is-flash');
    flashTimer = window.setTimeout(() => button.classList.remove('is-flash'), 420);
  }

  function rangeRow(row) {
    const line = el('div', 'win-row is-slider');
    const copy = el('span', 'win-copy');
    copy.append(el('b', '', row.title));
    if (row.desc) copy.append(el('small', '', row.desc));

    const readout = el('span', 'readout', row.format(S[row.key]));
    const slider = el('span', 'slider');
    const input = el('input');
    input.type = 'range';
    input.min = row.min;
    input.max = row.max;
    input.step = row.step;
    input.value = S[row.key];
    input.setAttribute('aria-label', row.title);
    /* `input`, not `change`: the readout and the preview have to follow the
       thumb, which is the whole reason the preview exists. */
    input.addEventListener('input', () => {
      S[row.key] = Number(input.value);
      readout.textContent = row.format(S[row.key]);
      paintPreview();
    });
    input.addEventListener('change', render);
    slider.append(input);

    line.append(copy, readout, slider);
    return line;
  }

  /* ── The wheel preview ──────────────────────────────────────────────────
     The app puts one at the top of Appearance for a plain reason: radius, icon
     size, spacing and dimming had no visible effect until the panel was closed
     and the wheel triggered, so tuning them meant a round trip per nudge. The
     geometry is computed at full size and one `scale()` makes it small, so what
     moves here is what moves on screen. */

  const PREVIEW_H = 200;
  const PREVIEW_INSET = 14;
  /* The lit slice always carries its name, and the name sits outside the tile,
     so the fit has to pay for it or the top label lands under the frame. */
  const PREVIEW_LABEL_BAND = 30;
  let previewLayer = null;

  function previewItems() {
    const items = (SPACES[0] && SPACES[0].items) || [];
    return items.length ? items : [];
  }

  function buildPreview() {
    const box = el('div', 'wheel-preview');
    const stage = el('div', 'wheel-stage');
    stage.style.height = `${PREVIEW_H}px`;
    const desk = el('div', 'wheel-desk');
    const scrim = el('div', 'wheel-scrim');
    const layer = el('div', 'wheel-layer');
    stage.append(desk, scrim, layer);
    box.append(stage, el('p', 'wheel-caption', 'Your Main workspace, at the size these settings give it.'));
    previewLayer = { stage, scrim, layer };
    return box;
  }

  function paintPreview() {
    if (!previewLayer) return;
    const { scrim, layer } = previewLayer;
    scrim.style.background = `rgba(0, 0, 0, ${S.backdropOpacity})`;

    const items = previewItems();
    const count = items.length || 6;
    /* The app's packing: neighbours may not touch, so a crowded ring pushes the
       radius out rather than letting the tiles overlap. */
    const packed = count > 1
      ? (S.iconSize + S.appSpacing) / 2 / Math.sin(Math.PI / count)
      : 0;
    const radius = Math.max(S.menuRadius, packed);
    const reach = radius + S.iconSize / 2 + PREVIEW_LABEL_BAND;
    const scale = Math.min(1, (PREVIEW_H / 2 - PREVIEW_INSET) / reach);

    layer.replaceChildren();
    layer.style.transform = `scale(${scale})`;

    const hub = el('div', 'wheel-hub');
    hub.style.width = `${Math.round(S.iconSize * 0.84)}px`;
    hub.style.height = `${Math.round(S.iconSize * 0.84)}px`;
    hub.style.borderColor = 'rgba(255,255,255,.3)';
    layer.append(hub);

    items.forEach((item, i) => {
      const angle = (-90 + (360 / count) * i) * (Math.PI / 180);
      const slot = el('div', 'wheel-slot');
      slot.style.transform =
        `translate(${(Math.cos(angle) * radius).toFixed(1)}px, ${(Math.sin(angle) * radius).toFixed(1)}px)`;

      const lit = i === 0;
      const tile = el('div', 'wheel-tile');
      tile.style.width = `${S.iconSize}px`;
      tile.style.height = `${S.iconSize}px`;
      tile.style.borderRadius = `${Math.round(S.iconSize * 0.28)}px`;
      tile.style.background = lit ? S.radialHoverColor : 'rgb(18,18,18)';
      tile.style.borderColor = lit ? S.radialHoverColor : 'rgba(255,255,255,.34)';
      if (item.icon) {
        const img = el('img');
        img.src = item.icon;
        img.alt = '';
        tile.append(img);
      }
      slot.append(tile);

      if (S.alwaysShowAppLabels || lit) {
        const label = el('span', 'wheel-label', item.label);
        /* Outward, never inward: a label under the top slice lands on the hub,
           which is the one place on the wheel that has to stay readable. */
        const below = Math.sin(angle) >= 0;
        label.style.top = below
          ? `${S.iconSize / 2 + 10}px`
          : `${-(S.iconSize / 2 + 10)}px`;
        if (!below) label.style.transform = 'translate(-50%, -100%)';
        if (lit) {
          label.style.background = S.radialHoverColor;
          label.style.borderColor = S.radialHoverColor;
          label.style.color = '#0a0a0b';
        }
        slot.append(label);
      }
      layer.append(slot);
    });
  }

  /* ── Workspaces page ────────────────────────────────────────────────────
     Cards, not rows: the app gave this page up on a list a while ago, because
     a tally of shortcuts read off a thumbnail that already draws every one of
     them said nothing. Each card previews its own wheel in the workspace's own
     colour, and the only lines left are the ones worth saying - Current, or
     Paused. See `WorkspaceCards` and `WorkspaceWheelPreview`. */

  const CARD_RADIUS = 34;

  function cardPreview(ws) {
    const box = el('div', 'zs-ws-preview');
    const accent = ws.color || 'currentColor';

    const ring = el('span', 'zs-ws-preview-ring');
    ring.style.borderColor = ws.color ? `${ws.color}44` : 'currentColor';
    const hub = el('span', 'zs-ws-preview-hub');
    hub.style.background = accent;
    box.append(ring, hub);

    /* Eight is what the thumbnail holds; the app slices there too. */
    const items = ws.items.slice(0, 8);
    items.forEach((item, i) => {
      const angle = ((i * (360 / items.length)) - 90) * (Math.PI / 180);
      const slot = el('span', 'zs-ws-preview-slot');
      slot.style.transform =
        `translate(${(CARD_RADIUS * Math.cos(angle)).toFixed(1)}px, ${(CARD_RADIUS * Math.sin(angle)).toFixed(1)}px)`;
      if (item.icon) {
        const img = el('img', 'zs-ws-preview-img');
        img.src = item.icon;
        img.alt = '';
        slot.append(img);
      }
      box.append(slot);
    });

    if (!items.length) box.append(el('span', 'zs-ws-preview-empty', 'empty'));
    return box;
  }

  function workspacesPage() {
    const grid = el('div', 'zs-ws-grid');

    SPACES.forEach((ws, i) => {
      const current = i === (LOOK.activeWorkspace ?? 0);
      const card = el('div', `zs-ws-card${current ? ' is-current' : ''}${ws.paused ? ' is-paused' : ''}`);
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.append(cardPreview(ws));

      const head = el('span', 'zs-ws-card-head');
      head.append(el('b', '', ws.name));
      if (ws.key) head.append(el('em', '', String(ws.key)));
      card.append(head);

      /* Only the states worth saying: a workspace that is simply available has
         no line at all. */
      if (current || ws.paused) card.append(el('small', '', current ? 'Current' : 'Paused'));

      if (SPACES.length > 1) {
        const remove = el('button', 'zs-ws-card-delete');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Delete ${ws.name}`);
        remove.append(glyph('i-trash'));
        remove.addEventListener('click', (event) => { event.stopPropagation(); flash(remove); });
        card.append(remove);
      }

      card.addEventListener('click', () => flash(card));
      grid.append(card);
    });

    const create = el('button', 'zs-ws-card is-new');
    create.type = 'button';
    create.append(glyph('i-plus'), el('small', '', 'New workspace'));
    create.addEventListener('click', () => flash(create));
    grid.append(create);

    return grid;
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  function render() {
    win.dataset.znTheme = S.appearanceTheme;

    nav.replaceChildren();
    for (const section of SECTIONS) {
      const item = el('li');
      const button = el('button', section.id === S.section ? 'is-active' : '', section.label);
      button.type = 'button';
      button.prepend(glyph(section.icon));
      button.addEventListener('click', () => {
        S.section = section.id;
        render();
        main.scrollTop = 0;
      });
      item.append(button);
      nav.append(item);
    }

    const meta = SECTIONS.find((section) => section.id === S.section);
    main.replaceChildren();

    const head = el('div', 'win-head');
    head.append(el('h3', '', meta.label));
    head.append(el('p', '', meta.caption));
    main.append(head);

    if (S.section === 'spaces') {
      main.append(workspacesPage());
      previewLayer = null;
      return;
    }

    previewLayer = null;
    let group = null;
    let rows = null;

    for (const row of rowsFor(S.section)) {
      if (row.kind === 'preview') {
        main.append(buildPreview());
        continue;
      }
      if (row.group !== group) {
        group = row.group;
        main.append(el('p', 'win-group', group));
        rows = el('div', 'win-rows');
        main.append(rows);
      }
      if (row.kind === 'range') {
        rows.append(rangeRow(row));
        continue;
      }
      const line = el('div', 'win-row');
      const copy = el('span', 'win-copy');
      copy.append(el('b', '', row.title));
      if (row.desc) copy.append(el('small', '', row.desc));
      line.append(copy);
      const node = control(row);
      if (node) line.append(node);
      rows.append(line);
    }

    if (previewLayer) paintPreview();
  }

  const version = document.getElementById('setVersion');
  if (version && LOOK.version) version.textContent = LOOK.version;

  render();
})();
