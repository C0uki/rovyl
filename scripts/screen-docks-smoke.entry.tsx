/**
 * Entry for `scripts/screen-docks-smoke.mjs`. A real source file so it resolves `../src/...`
 * through the project's own Vite config. Not imported by the app.
 *
 * It renders `ScreenDocks` the way the wheel does and reports what came out. The questions it
 * answers are the ones nobody can answer by reading the component: that two docks asked for the
 * same region produce ONE positioned shell rather than two boxes drawn on top of each other, that
 * the sizes the settings sliders hold actually reach the DOM, and that a readout with nothing to
 * report draws nothing rather than a zero.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScreenDocks, dockStackHeight } from "../src/components/ScreenDocks";
import {
  normalizeShortcutDock,
  normalizeStatusDock,
  type DockPosition,
} from "../src/utils/screenDocks";
import type { AppItem, SystemStatus } from "../src/types";
/** English, as the wheel's own first frame uses it — this suite asserts layout, not wording. */
import { en as wheelStrings } from "../src/i18n/wheel/en";

const NOOP = () => {};

function item(id: string, label: string, iconName: string): AppItem {
  return {
    id,
    type: "app",
    label,
    iconName,
    iconSource: "lucide",
    command: label.toLowerCase(),
    commandType: "app",
    description: label,
  };
}

const LAPTOP: SystemStatus = {
  volume: 40,
  muted: false,
  network: "wifi",
  signal: 72,
  battery: 63,
  charging: false,
};

const DESKTOP: SystemStatus = {
  volume: 15,
  muted: true,
  network: "ethernet",
  signal: -1,
  /** No battery, which is the case a naive readout paints as "empty". */
  battery: -1,
  charging: true,
};

function render(
  statusRaw: unknown,
  shortcutsRaw: unknown,
  systemStatus: SystemStatus,
  isOpen = true,
): string {
  return renderToStaticMarkup(
    React.createElement(ScreenDocks, {
      isOpen,
      status: normalizeStatusDock(statusRaw),
      shortcuts: normalizeShortcutDock(shortcutsRaw),
      systemStatus,
      strings: wheelStrings,
      onLaunch: NOOP,
      onOpenPanel: NOOP,
      onVolume: NOOP,
      onMute: NOOP,
    }),
  );
}

const BOTH_ON_LEFT = {
  status: { enabled: true, position: "bottom-left" as DockPosition, iconSize: 20, gap: 14 },
  shortcuts: {
    enabled: true,
    position: "bottom-left" as DockPosition,
    iconSize: 44,
    gap: 12,
    showLabels: true,
    items: [item("a", "Chrome", "Globe"), item("b", "Steam", "Gamepad2")],
  },
};

const APART = {
  status: { ...BOTH_ON_LEFT.status, position: "bottom-right" as DockPosition },
  shortcuts: BOTH_ON_LEFT.shortcuts,
};

export function collect() {
  const both = render(BOTH_ON_LEFT.status, BOTH_ON_LEFT.shortcuts, LAPTOP);
  const apart = render(APART.status, APART.shortcuts, LAPTOP);
  const desktop = render(APART.status, APART.shortcuts, DESKTOP);
  const nothing = render({ enabled: false }, { enabled: true, items: [] }, LAPTOP);
  const closed = render(APART.status, APART.shortcuts, LAPTOP, false);

  const shells = (html: string) => html.split("zn-dock-shell").length - 1;
  const plates = (html: string) => html.split("zn-dock-plate").length - 1;

  return {
    /** The markup itself, so a failed assertion above can be read instead of guessed at. */
    markup: { both, apart, desktop, closed },

    /* One region, one positioned shell — but still both plates inside it. */
    sharedRegionShells: shells(both),
    sharedRegionPlates: plates(both),
    /* Two regions, two shells. */
    separateRegionShells: shells(apart),
    separateRegionPlates: plates(apart),

    /* The sliders reach the DOM: gap on each plate, icon size on each tile. */
    shortcutGapApplied: both.includes("gap:12px"),
    statusGapApplied: both.includes("gap:14px"),
    /* 44px tile + the 14px label row the dock reserves when names are on. */
    shortcutTileSized: both.includes("width:44px;height:58px"),

    /* Both icons, in the order they were configured, with their names under them. */
    tileCount: both.split("zn-dock-tile-art").length - 1,
    labelsShown: both.includes("Chrome") && both.includes("Steam"),
    orderKept: both.indexOf("Chrome") < both.indexOf("Steam"),

    /* A laptop shows the charge; a desktop with no battery shows no battery at all. */
    laptopShowsBattery: apart.includes("63%"),
    desktopShowsBattery: desktop.includes("zn-dock-battery"),
    /* And it must not have fallen back to a zero. */
    desktopShowsZeroPercent: desktop.includes(">0%<"),

    /* Wi-Fi reports its signal; a cable has none to report. */
    laptopShowsSignal: apart.includes("72%"),
    /** A cable has no signal quality, so the network readout is a glyph and nothing else. */
    ethernetShowsNoSignal: !desktop.includes("Wi-Fi"),

    /* A muted endpoint draws an empty bar whatever the level says. */
    mutedFillIsEmpty: desktop.includes("width:0%"),
    volumeFillApplied: apart.includes("width:40%"),

    /* Nothing configured, nothing in the document. */
    emptyRendersNothing: nothing === "",

    /* Closed: still in the tree (it animates out), but nothing can be clicked. */
    closedIsInert: closed.includes("pointer-events:none"),

    /* The gear's step, as the wheel computes it. */
    stackBothOnLeft: dockStackHeight(
      "bottom-left",
      normalizeStatusDock(BOTH_ON_LEFT.status),
      normalizeShortcutDock(BOTH_ON_LEFT.shortcuts),
    ),
    stackEmptyRegion: dockStackHeight(
      "top-right",
      normalizeStatusDock(BOTH_ON_LEFT.status),
      normalizeShortcutDock(BOTH_ON_LEFT.shortcuts),
    ),
  };
}
