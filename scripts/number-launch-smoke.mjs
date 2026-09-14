import assert from "node:assert/strict";

/**
 * Who owns a digit pressed on an open wheel.
 *
 * Three features want 1-9 and only one of them can have each keystroke: quick launch
 * (`radialNumberLaunch`), workspace switching (`workspaceSwitchMode: 'hotkeys'`) and the
 * type-ahead filter. The real routing lives in `RadialMenu`'s keydown handler and is not
 * reachable from node, so it is mirrored here — the pairing that matters is that this file and
 * that handler agree, and the cases below are the ones that were wrong before they were written.
 */
function routeDigit({ key, numberLaunch, workspaceSwitchMode, itemCount, typeAhead }) {
  if (typeAhead) return "filter";
  if (numberLaunch && key >= "1" && key <= "9") {
    if (parseInt(key, 10) - 1 < itemCount) return "launch";
    /* No slice under it — falls through rather than being swallowed. */
  }
  if (!numberLaunch && workspaceSwitchMode !== "picker" && key >= "1" && key <= "9") {
    return "workspace";
  }
  if (workspaceSwitchMode === "picker" && key >= "1" && key <= "8" && parseInt(key, 10) - 1 < itemCount) {
    return "aim";
  }
  return "filter";
}

/** Mirrors `set-workspace-shortcuts` in electron-main: when main registers 1-9 globally. */
function registersGlobalDigits(mode, numberKeysClaimed) {
  return mode !== "picker" && numberKeysClaimed !== true;
}

const HOTKEYS = { workspaceSwitchMode: "hotkeys", itemCount: 6, typeAhead: "" };
const PICKER = { workspaceSwitchMode: "picker", itemCount: 6, typeAhead: "" };

// Quick launch off: the digits stay exactly where they were.
assert.equal(routeDigit({ ...HOTKEYS, key: "2", numberLaunch: false }), "workspace",
  "hotkeys mode without quick launch: 2 switches workspace");
assert.equal(routeDigit({ ...PICKER, key: "2", numberLaunch: false }), "aim",
  "picker mode without quick launch: 2 only aims, Enter still required");

// Quick launch on: it takes them, in both workspace modes.
assert.equal(routeDigit({ ...HOTKEYS, key: "2", numberLaunch: true }), "launch",
  "quick launch beats workspace switching for the same key");
assert.equal(routeDigit({ ...PICKER, key: "2", numberLaunch: true }), "launch",
  "quick launch runs the slice in picker mode too");
assert.equal(routeDigit({ ...HOTKEYS, key: "9", numberLaunch: true, itemCount: 9 }), "launch",
  "the ninth slice is reachable");

// A digit with no slice under it is a character, not a silent no-op and not a workspace switch.
assert.equal(routeDigit({ ...HOTKEYS, key: "7", numberLaunch: true, itemCount: 4 }), "filter",
  "past the last slice: falls through to the filter, never to workspace switching");
assert.equal(routeDigit({ ...PICKER, key: "7", numberLaunch: true, itemCount: 4 }), "filter",
  "past the last slice in picker mode reaches the filter too");

// Once something is typed, every digit is a character — "Photoshop 2024" has to be reachable.
assert.equal(routeDigit({ ...HOTKEYS, key: "2", numberLaunch: true, typeAhead: "photo" }), "filter",
  "a running filter owns the digits");
assert.equal(routeDigit({ ...HOTKEYS, key: "2", numberLaunch: false, typeAhead: "photo" }), "filter",
  "and did so before quick launch existed");

// Main must release the keys the renderer was told to handle, or they never arrive.
assert.equal(registersGlobalDigits("hotkeys", false), true,
  "hotkeys mode alone still registers the global digits");
assert.equal(registersGlobalDigits("hotkeys", true), false,
  "quick launch claims them: main must not consume 1-9 globally");
assert.equal(registersGlobalDigits("picker", false), false,
  "picker mode never registered them");
assert.equal(registersGlobalDigits("picker", true), false,
  "and does not start because of the claim");
assert.equal(registersGlobalDigits("hotkeys", undefined), true,
  "an older renderer sending no claim keeps the shipped behaviour");

console.log("number-launch-smoke: OK (14 assertions passed)");
