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

  /* The seven the app ships, in the app's order, each under its own name for itself.
     Someone stranded in a UI they cannot read is looking for the row that LOOKS like
     their language, and "Russian" does not look like Русский. The English name rides
     along as support, as it does in `src/i18n/languages.ts`. */
  /* The six places a dock may sit. Same list, same order, in src/utils/screenDocks.ts. */
  const DOCK_POSITION_CHOICES = [
    ['top-left', 'Top left'],
    ['top-center', 'Top center'],
    ['top-right', 'Top right'],
    ['bottom-left', 'Bottom left'],
    ['bottom-center', 'Bottom center'],
    ['bottom-right', 'Bottom right'],
  ];

  const LANGUAGES = [
    ['en', 'English', 'English'],
    ['es', 'Español', 'Spanish'],
    ['zh', '简体中文', 'Chinese (Simplified)'],
    ['pt', 'Português', 'Portuguese'],
    ['ru', 'Русский', 'Russian'],
    ['de', 'Deutsch', 'German'],
    ['ar', 'العربية', 'Arabic'],
  ];

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
    statusDock: false,
    statusDockPosition: 'bottom-right',
    statusDockIconSize: 18,
    statusDockGap: 10,
    statusDockClock: true,
    statusDockBattery: true,
    statusDockNetwork: true,
    statusDockVolume: true,
    shortcutDock: false,
    shortcutDockPosition: 'bottom-left',
    shortcutDockIconSize: 40,
    shortcutDockGap: 12,
    shortcutDockLabels: false,

    performanceMode: false,
    strictOfflineMode: false,
    gameMode: false,
    gameScope: 'all',

    section: 'trigger',
  };

  /* ── Defaults ───────────────────────────────────────────────────────────
     What `DEFAULT_UI_CONFIG` holds for the keys the panel offers a revert on.
     Only these: the app derives the revert from `configKey`, and a row without one
     (the shortcut, Precision mode, Fullscreen protection) is never offered it. One
     rule for every row, so a row that stops matching cannot go on claiming it is at
     its default. */
  const DEFAULTS = {
    language: 'en',
    openAtLogin: true,
    workspaceSwitchMode: 'picker',
    shortcutTriggerMode: 'toggle',
    enableMouseTrigger: true,
    mouseTriggerButton: 'middle',
    mouseTriggerMode: 'click',
    radialMonitor: 'primary',
    activationThreshold: 60,
    radialInstantActivate: 'off',
    radialInstantSensitivity: 'medium',
    radialInstantDwellMs: 400,
    appearanceTheme: 'black',
    menuRadius: 140,
    iconSize: 64,
    appSpacing: 10,
    radialHoverColor: '#FFFFFF',
    radialSelectionMode: 'angle',
    alwaysShowAppLabels: false,
    backdropOpacity: 0.6,
    statusDock: false,
    statusDockPosition: 'bottom-right',
    statusDockIconSize: 18,
    statusDockGap: 10,
    shortcutDock: false,
    shortcutDockPosition: 'bottom-left',
    shortcutDockIconSize: 40,
    shortcutDockGap: 12,
    strictOfflineMode: false,
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
      /* A select, not the segmented control this was while it held two languages:
         seven buttons are wider than the control column and would wrap into a block
         of chips no eye can scan. The group name stays the English "Language" on
         purpose - it is the one string in this panel that has to stay findable by
         someone who cannot read the rest of it. */
      { group: 'Language', title: 'Language', desc: 'The language of this panel and the wheel.',
        kind: 'select', key: 'language', choices: LANGUAGES },
      { group: 'Startup', title: 'Start with Windows', desc: 'Rovyl is ready as soon as you sign in to Windows.',
        kind: 'bool', key: 'openAtLogin' },
      { group: 'Workspaces', title: 'Workspace switching', desc: 'Use the visual wheel picker or number keys.',
        kind: 'seg', key: 'workspaceSwitchMode', choices: [['picker', 'Picker'], ['hotkeys', 'Keys']] },
    ];

    if (id === 'trigger') return [
      { group: 'Keyboard', title: 'Global shortcut', desc: 'Open the wheel over any application.',
        kind: 'open', value: S.globalShortcut },
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
      { group: 'Shortcut dock', title: 'Shortcut dock',
        desc: 'A strip of your own icons beside the open wheel. Click one to launch it.',
        kind: 'bool', key: 'shortcutDock' },
      ...(S.shortcutDock ? [
        { group: 'Shortcut dock', title: 'Where it sits', desc: 'The corner or edge the strip is placed against.',
          kind: 'select', key: 'shortcutDockPosition', choices: DOCK_POSITION_CHOICES },
        { group: 'Shortcut dock', title: 'Icon size', desc: 'How big each icon is drawn.',
          kind: 'range', key: 'shortcutDockIconSize', min: 24, max: 88, step: 1, format: (v) => `${v} px` },
        { group: 'Shortcut dock', title: 'Spacing', desc: 'The gap between neighbouring icons.',
          kind: 'range', key: 'shortcutDockGap', min: 0, max: 48, step: 1, format: (v) => `${v} px` },
        { group: 'Shortcut dock', title: 'Names under the icons', desc: 'Off by default: a strip of eight names is a menu.',
          kind: 'bool', key: 'shortcutDockLabels' },
      ] : []),
      { group: 'System dock', title: 'System dock',
        desc: 'Time, battery, network and volume, read live, beside the open wheel.',
        kind: 'bool', key: 'statusDock' },
      ...(S.statusDock ? [
        { group: 'System dock', title: 'Where it sits', desc: 'The corner or edge the readouts are placed against.',
          kind: 'select', key: 'statusDockPosition', choices: DOCK_POSITION_CHOICES },
        { group: 'System dock', title: 'Icon size', desc: 'How big the glyphs and the text are drawn.',
          kind: 'range', key: 'statusDockIconSize', min: 12, max: 32, step: 1, format: (v) => `${v} px` },
        { group: 'System dock', title: 'Spacing', desc: 'The gap between neighbouring readouts.',
          kind: 'range', key: 'statusDockGap', min: 0, max: 48, step: 1, format: (v) => `${v} px` },
        { group: 'System dock', title: 'Clock', desc: 'The time, and the date under it.',
          kind: 'bool', key: 'statusDockClock' },
        { group: 'System dock', title: 'Battery', desc: 'Charge level and whether it is plugged in. Hidden on a machine with no battery.',
          kind: 'bool', key: 'statusDockBattery' },
        { group: 'System dock', title: 'Network', desc: 'Wi-Fi signal or a wired connection. Click it for the Windows network panel.',
          kind: 'bool', key: 'statusDockNetwork' },
        { group: 'System dock', title: 'Volume', desc: 'Output level, with a slider you can drag. Click the glyph to mute.',
          kind: 'bool', key: 'statusDockVolume' },
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
        kind: 'action', label: 'Restore', key: 'reset',
        confirm: {
          body: 'Every workspace, shortcut, icon and preference on this PC is deleted and Rovyl restarts. This cannot be undone - use Export settings first if you want a copy.',
          cta: 'Erase everything',
        } },
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

    if (row.kind === 'select') return selectControl(row);

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

    /* A value that opens an editor of its own - the shortcut recorder. The value
       reads as the row's answer and the chevron says there is more behind it; the
       whole row is the hit target, which is what `.is-openable` marks. */
    if (row.kind === 'open') {
      const button = el('button', 'btn is-value');
      button.type = 'button';
      button.setAttribute('aria-label', row.title);
      button.append(el('b', '', row.value), glyph('i-chevron'));
      button.addEventListener('click', () => flash(button));
      return button;
    }

    if (row.kind === 'action') {
      const button = el('button', 'btn', row.label);
      button.type = 'button';
      if (row.icon) button.prepend(glyph(row.icon));
      /* Deliberately inert: this is a tour of the panel, not a copy of the app
         that could write to anything. */
      button.addEventListener('click', () => (row.confirm ? askAgain(row) : flash(button)));
      return button;
    }

    return null;
  }

  /* ── Select ─────────────────────────────────────────────────────────────
     The app's own listbox rather than a native `<select>`, and the reason is the
     reason it is not one there either: Chromium draws that popup from the OS theme,
     so it arrives as a grey Windows listbox in the middle of a panel that controls
     every other pixel of itself.

     Replacing it means owing back what the platform was doing unpaid - arrow keys,
     Home/End, type-ahead, Escape cancelling against Tab committing, focus back on
     the trigger, the active option kept in view. For anyone not using a mouse those
     are not embellishments on a dropdown, they ARE the dropdown. See
     `SelectSettingControl`. */

  /* Mirrors the CSS, and has to be kept in step with it by hand. These numbers only
     decide whether the popup flips, so drift shows up as a list that opens downward
     into a space it does not quite fit, never as a broken layout. */
  const MENU_ROW = 32;
  const MENU_PAD = 8;
  const MENU_MAX = 244;
  const MENU_MIN_W = 208;
  const MENU_GAP = 6;
  const MENU_MARGIN = 8;

  /** The one open listbox, so a click elsewhere - or a re-render - can close it. */
  let openSelect = null;

  function closeSelect(returnFocus) {
    if (!openSelect) return;
    const { list, shade, trigger } = openSelect;
    openSelect = null;
    list.remove();
    shade.remove();
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus({ preventScroll: true });
  }

  /* Down unless down does not fit and up fits better - "better", not "at all",
     because a window short enough to squeeze both should still take the roomier
     side. Measured against `.win`, which is also what the list is painted on: the
     row itself sits in a scroller that would clip the list the moment it was taller
     than the space beneath it. */
  function place(trigger, count) {
    const rect = trigger.getBoundingClientRect();
    const box = win.getBoundingClientRect();
    const height = Math.min(count * MENU_ROW + MENU_PAD, MENU_MAX);
    const width = Math.max(rect.width, MENU_MIN_W);
    const below = box.bottom - rect.bottom - (MENU_GAP + MENU_MARGIN);
    const above = rect.top - box.top - (MENU_GAP + MENU_MARGIN);
    const down = below >= height || below >= above;
    const minLeft = box.left + MENU_MARGIN;
    const left = Math.min(
      Math.max(minLeft, rect.right - width),
      Math.max(minLeft, box.right - width - MENU_MARGIN),
    );
    const top = down
      ? rect.bottom + MENU_GAP
      : Math.max(box.top + MENU_MARGIN, rect.top - MENU_GAP - height);
    return { left: left - box.left, top: top - box.top, width, down };
  }

  function selectControl(row) {
    const wrap = el('span', 'sel');
    const choices = row.choices;
    const selectedIndex = Math.max(0, choices.findIndex(([value]) => value === S[row.key]));
    const chosen = choices[selectedIndex];

    const trigger = el('button', 'sel-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', row.title);
    trigger.append(
      el('span', '', chosen[2] && chosen[2] !== chosen[1] ? chosen[1] + ' \u00b7 ' + chosen[2] : chosen[1]),
      glyph('i-chevron'),
    );
    wrap.append(trigger);

    /** Which option the keyboard is ON, which is not which option is CHOSEN. Arrowing
        must not commit: on this row that would retranslate the whole panel five times
        on the way down to Deutsch. */
    let active = selectedIndex;
    const options = [];
    const typed = { buffer: '', at: 0 };

    const shade = el('div', 'sel-shade');
    shade.setAttribute('role', 'presentation');
    shade.addEventListener('mousedown', () => closeSelect(false));

    const list = el('div', 'sel-list');
    list.id = row.key + '-listbox';
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.setAttribute('aria-label', row.title);

    const paint = () => {
      options.forEach((node, i) => {
        node.classList.toggle('is-active', i === active);
        if (i === active) node.scrollIntoView({ block: 'nearest' });
      });
      list.setAttribute('aria-activedescendant', options[active] ? options[active].id : '');
    };

    const commit = (index) => {
      closeSelect(false);
      set(row.key, choices[index][0]);
    };

    choices.forEach(([value, label, hint], i) => {
      const option = el('div', 'sel-option');
      option.id = row.key + '-option-' + i;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(i === selectedIndex));
      option.append(el('b', '', label));
      if (hint && hint !== label) option.append(el('small', '', hint));
      if (i === selectedIndex) option.append(glyph('i-check'));
      /** Pointer moves the highlight; it does not move focus off the listbox. */
      option.addEventListener('mousemove', () => { active = i; paint(); });
      option.addEventListener('click', () => commit(i));
      options.push(option);
      list.append(option);
    });

    /* Type-ahead: the affordance people use without knowing they use it. `d` jumps to
       Deutsch. A single character CYCLES, so the scan starts one past the current row;
       a longer buffer REFINES, so it includes it - `d`,`e` is still aiming at the
       Deutsch that `d` found. The buffer only accumulates while typing stays brisk.
       Endonym or English name alike: someone hunting for German may type either. */
    const jump = (key) => {
      const now = Date.now();
      typed.buffer = now - typed.at > 900 ? key : typed.buffer + key;
      typed.at = now;
      const query = typed.buffer.toLowerCase();
      const from = query.length === 1 ? active + 1 : active;
      for (let step = 0; step < choices.length; step += 1) {
        const i = (from + step) % choices.length;
        const [, label, hint] = choices[i];
        if (label.toLowerCase().startsWith(query) || (hint || '').toLowerCase().startsWith(query)) {
          active = i;
          paint();
          return;
        }
      }
    };

    list.addEventListener('keydown', (event) => {
      const step = (delta) => {
        event.preventDefault();
        active = clamp(active + delta, 0, choices.length - 1);
        paint();
      };
      switch (event.key) {
        case 'ArrowDown': return step(1);
        case 'ArrowUp': return step(-1);
        case 'PageDown': return step(5);
        case 'PageUp': return step(-5);
        case 'Home': event.preventDefault(); active = 0; return paint();
        case 'End': event.preventDefault(); active = choices.length - 1; return paint();
        case 'Enter':
        case ' ':
          event.preventDefault();
          return commit(active);
        /** Stopped, or the page's own key handling hears an Escape meant for the list. */
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          return closeSelect(true);
        /** Tab commits everywhere else in this panel; leaving it a cancel here would surprise. */
        case 'Tab':
          return commit(active);
        default:
          if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
            event.preventDefault();
            jump(event.key);
          }
      }
    });

    const open = () => {
      const at = place(trigger, choices.length);
      list.classList.toggle('is-up', !at.down);
      list.style.left = at.left + 'px';
      list.style.top = at.top + 'px';
      list.style.width = at.width + 'px';
      win.append(shade, list);
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      openSelect = { list, shade, trigger, count: choices.length };
      /** Every opening starts from what is selected, not from wherever the last visit
          was left. */
      active = selectedIndex;
      paint();
      list.focus({ preventScroll: true });
    };

    /* `mousedown`, not `click`, and the shade depends on it: on `click`, pressing the
       trigger to dismiss would close via the shade, unmount it, and let the release
       land on the now-uncovered trigger and reopen the list. */
    trigger.addEventListener('mousedown', () => (openSelect ? closeSelect(false) : open()));
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });

    return wrap;
  }

  let flashTimer = 0;
  function flash(button) {
    window.clearTimeout(flashTimer);
    button.classList.add('is-flash');
    flashTimer = window.setTimeout(() => button.classList.remove('is-flash'), 420);
  }

  /** Which action row is mid-confirm, so a re-render can put it back the way it was. */
  let confirming = null;
  function askAgain(row) {
    confirming = row.key;
    render();
  }

  /* The revert column comes before the control and ALWAYS exists, even empty: it is
     what keeps the switch in the same place before and after the first click. The
     button inside it appears only once the row has moved off its default - one rule
     for every row, derived here rather than declared per row, so a row that stops
     matching cannot go on claiming it is at its default. */
  function revertSlot(row) {
    const slot = el('span', 'win-revert-slot');
    const key = row.key;
    if (!key || !(key in DEFAULTS) || S[key] === DEFAULTS[key]) return slot;

    const button = el('button', 'win-revert');
    button.type = 'button';
    button.setAttribute('aria-label', `Reset ${row.title} to default`);
    button.title = 'Reset to default';
    button.append(glyph('i-revert'));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      set(key, DEFAULTS[key]);
    });
    slot.append(button);
    return slot;
  }

  function rangeRow(row) {
    const line = el('div', 'win-row is-slider');
    const copy = el('span', 'win-copy');
    copy.append(el('b', '', row.title));
    if (row.desc) copy.append(el('small', '', row.desc));

    const readout = el('span', 'readout', row.format(S[row.key]));
    const control = el('span', 'win-control');
    control.append(revertSlot(row), readout);

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
    /* The ends of the scale, flanking the track: a bare track says how far the thumb
       has come but not what it is a fraction of. */
    slider.append(
      el('span', 'slider-bounds', row.format(row.min)),
      input,
      el('span', 'slider-bounds', row.format(row.max)),
    );

    line.append(copy, control, slider);
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
    /* The listbox is painted on `.win`, not inside the row, so a re-render would
       otherwise leave it floating over a trigger that no longer exists. */
    closeSelect(false);
    win.dataset.znTheme = S.appearanceTheme;

    nav.replaceChildren();
    for (const section of SECTIONS) {
      const item = el('li');
      const button = el('button', section.id === S.section ? 'is-active' : '', section.label);
      button.type = 'button';
      button.prepend(glyph(section.icon));
      button.addEventListener('click', () => {
        S.section = section.id;
        confirming = null;
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
      const line = el('div', `win-row${row.kind === 'open' ? ' is-openable' : ''}`);
      const copy = el('span', 'win-copy');
      copy.append(el('b', '', row.title));
      if (row.desc) copy.append(el('small', '', row.desc));
      line.append(copy);

      const control_ = el('span', 'win-control');
      control_.addEventListener('click', (event) => event.stopPropagation());
      control_.append(revertSlot(row));
      /* Mid-confirm the row swaps its one button for the pair, so the press that
         cannot be undone is never the press already under the pointer. */
      if (row.confirm && confirming === row.key) {
        const actions = el('span', 'confirm-actions');
        const cancel = el('button', 'btn', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => { confirming = null; render(); });
        const go = el('button', 'btn is-danger', row.confirm.cta);
        go.type = 'button';
        go.addEventListener('click', () => { confirming = null; render(); });
        actions.append(cancel, go);
        control_.append(actions);
      } else {
        const node = control(row);
        if (node) control_.append(node);
      }
      line.append(control_);

      /* Under the row, not over it: what it says is the reason the second press
         exists. Red only on the button that does it - a red row would read as an
         error, and nothing has gone wrong yet. */
      if (row.confirm && confirming === row.key) {
        const note = el('p', 'confirm-body');
        note.setAttribute('role', 'alert');
        note.append(glyph('i-alert'), el('span', '', row.confirm.body));
        line.append(note);
        /* Restore defaults is the last row of the section, so the reason for the
           second press opens below the fold unless the pane goes to meet it. */
        requestAnimationFrame(() => note.scrollIntoView({ block: 'nearest' }));
      }

      if (row.kind === 'open') {
        line.addEventListener('click', () => flash(line.querySelector('.btn')));
      }
      rows.append(line);
    }

    if (previewLayer) paintPreview();
  }

  /* The list is placed against `.win` while the trigger lives in `.win-main`, so a
     scroll moves one and not the other. Re-measured rather than remembered. */
  main.addEventListener('scroll', () => {
    if (!openSelect) return;
    const at = place(openSelect.trigger, openSelect.count);
    openSelect.list.classList.toggle('is-up', !at.down);
    openSelect.list.style.left = at.left + 'px';
    openSelect.list.style.top = at.top + 'px';
  });

  const version = document.getElementById('setVersion');
  if (version && LOOK.version) version.textContent = LOOK.version;

  render();
})();
