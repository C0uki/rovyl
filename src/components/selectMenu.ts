/**
 * The two pieces of `SelectSettingControl` that are arithmetic rather than rendering.
 *
 * They are out here because a custom dropdown takes over jobs the platform used to do for free,
 * and these are the two it is easiest to get subtly wrong in ways nobody notices until the window
 * is short or someone types the same letter twice: where the popup goes, and where a keystroke
 * lands. As pure functions they can be checked directly — `scripts/select-menu-smoke.mjs` — which
 * is the only reason this file exists rather than another hundred lines inside the component.
 */

export interface SelectChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface MenuRect {
  top: number;
  bottom: number;
  right: number;
  width: number;
}

export interface MenuViewport {
  width: number;
  height: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
  width: number;
  drop: 'down' | 'up';
}

/** Matches the CSS: `--zn-1` of padding either side of 38px rows, capped by `max-height`. */
export const MENU_ROW_HEIGHT = 38;
export const MENU_MAX_HEIGHT = 320;
export const MENU_MIN_WIDTH = 208;
/** Breathing room from the trigger, and the smallest gap tolerated at a window edge. */
export const MENU_GAP = 6;
export const MENU_MARGIN = 8;

export function menuHeight(count: number): number {
  return Math.min(count * MENU_ROW_HEIGHT + 10, MENU_MAX_HEIGHT);
}

/**
 * Where the popup sits, in viewport coordinates.
 *
 * Down unless down does not fit and up fits better — "better", not "at all", because a window
 * short enough to squeeze both should still pick the roomier side rather than flipping to a list
 * that is merely less clipped. The left edge is clamped twice over: once to keep the popup's right
 * edge aligned to the trigger's, and once so a popup wider than its trigger cannot leave the
 * window on either side, which is the case that a single `Math.max` silently gets wrong in RTL.
 */
export function selectMenuPlacement(
  rect: MenuRect,
  viewport: MenuViewport,
  count: number,
): MenuPlacement {
  const height = menuHeight(count);
  const width = Math.max(rect.width, MENU_MIN_WIDTH);
  const roomBelow = viewport.height - rect.bottom - (MENU_GAP + MENU_MARGIN);
  const roomAbove = rect.top - (MENU_GAP + MENU_MARGIN);
  const drop: 'down' | 'up' = roomBelow >= height || roomBelow >= roomAbove ? 'down' : 'up';
  const left = Math.min(
    Math.max(MENU_MARGIN, rect.right - width),
    Math.max(MENU_MARGIN, viewport.width - width - MENU_MARGIN),
  );
  return {
    left,
    width,
    drop,
    top:
      drop === 'down'
        ? rect.bottom + MENU_GAP
        : Math.max(MENU_MARGIN, rect.top - MENU_GAP - height),
  };
}

/**
 * Type-ahead: which option a typed buffer should land on, or `null` for no match.
 *
 * Two behaviours matter and they pull in opposite directions. A single character CYCLES — press
 * `e` repeatedly and you should walk English, Español, Deutsch in turn — so the scan starts one
 * past the current row. A longer buffer REFINES: `d`,`e` is still aiming at the Deutsch that `d`
 * already found, so the scan must include the current row or every second keystroke would skip
 * past the answer. Both wrap, so the search never dead-ends at the bottom of the list.
 *
 * Matching runs over the endonym and the English name alike, because someone hunting for German
 * may reasonably type either `De…` or `Ge…`.
 */
export function typeAheadIndex(
  choices: readonly SelectChoice[],
  activeIndex: number,
  buffer: string,
): number | null {
  const needle = buffer.trim().toLowerCase();
  if (!needle || !choices.length) return null;
  const from = needle.length === 1 ? activeIndex + 1 : activeIndex;
  for (let offset = 0; offset < choices.length; offset += 1) {
    /** `+ choices.length` keeps the modulo positive when `activeIndex` is still -1. */
    const index = (((from + offset) % choices.length) + choices.length) % choices.length;
    const choice = choices[index];
    if (
      choice.label.toLowerCase().startsWith(needle)
      || (choice.hint ?? '').toLowerCase().startsWith(needle)
    ) {
      return index;
    }
  }
  return null;
}

/** Idle gap after which the next keystroke starts a fresh buffer instead of extending it. */
export const TYPE_AHEAD_RESET_MS = 900;

export function nextTypeAheadBuffer(previous: string, key: string, sinceLastKeyMs: number): string {
  return sinceLastKeyMs > TYPE_AHEAD_RESET_MS ? key : previous + key;
}
