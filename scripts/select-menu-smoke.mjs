/**
 * The arithmetic behind the settings panel's dropdown.
 *
 * A custom dropdown is a promise to reimplement what `<select>` was doing for nothing, and the two
 * halves that are not markup are here: where the popup lands, and where a keystroke goes. Both
 * fail quietly. A placement bug shows up only in a short window or near a screen edge — the popup
 * is simply half off-screen, and only for the people it happens to. A type-ahead bug shows up only
 * when a letter is pressed twice, and reads as the list being stuck rather than as a bug.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = mkdtempSync(join(tmpdir(), "rovyl-select-menu-"));

try {
  await build({
    root,
    logLevel: "warn",
    build: {
      ssr: join(root, "src", "components", "selectMenu.ts"),
      outDir,
      emptyOutDir: true,
      target: "node20",
      minify: false,
      rollupOptions: { output: { format: "es", entryFileNames: "entry.mjs" } },
    },
    ssr: { noExternal: true },
  });

  const {
    selectMenuPlacement,
    typeAheadIndex,
    nextTypeAheadBuffer,
    menuHeight,
    MENU_MIN_WIDTH,
    MENU_MARGIN,
    TYPE_AHEAD_RESET_MS,
  } = await import(pathToFileURL(join(outDir, "entry.mjs")).href);

  let n = 0;
  const check = (fn) => { fn(); n += 1; };

  /** The real row: the seven languages, as the Language setting builds them. */
  const LANGS = [
    { value: "en", label: "English", hint: "English" },
    { value: "es", label: "Español", hint: "Spanish" },
    { value: "zh", label: "简体中文", hint: "Chinese (Simplified)" },
    { value: "pt", label: "Português", hint: "Portuguese" },
    { value: "ru", label: "Русский", hint: "Russian" },
    { value: "de", label: "Deutsch", hint: "German" },
    { value: "ar", label: "العربية", hint: "Arabic" },
  ];
  const at = (code) => LANGS.findIndex((entry) => entry.value === code);

  /* ── placement ─────────────────────────────────────────────────────────── */

  const VIEW = { width: 1280, height: 800 };
  /** A row control near the top of the settings panel: plenty of room underneath. */
  const roomy = { top: 200, bottom: 230, right: 900, width: 150 };

  check(() => {
    const place = selectMenuPlacement(roomy, VIEW, LANGS.length);
    assert.equal(place.drop, "down", "with room below, the list drops down");
    assert.ok(place.top > roomy.bottom, "a downward list starts below the trigger");
  });

  check(() => {
    const place = selectMenuPlacement(roomy, VIEW, LANGS.length);
    assert.equal(place.width, MENU_MIN_WIDTH, "a narrow trigger still gets a readable list");
    assert.equal(
      place.left + place.width,
      roomy.right,
      "the list aligns to the trigger's right edge, which is where the control sits in the row",
    );
  });

  check(() => {
    const wide = { ...roomy, width: 320, right: 900 };
    assert.equal(selectMenuPlacement(wide, VIEW, LANGS.length).width, 320, "a wide trigger keeps its width");
  });

  check(() => {
    /** Bottom of a tall window: not enough underneath, so it flips above the trigger. */
    const low = { top: 720, bottom: 750, right: 900, width: 150 };
    const place = selectMenuPlacement(low, VIEW, LANGS.length);
    assert.equal(place.drop, "up", "with no room below, the list flips up");
    assert.ok(place.top + menuHeight(LANGS.length) <= low.top, "an upward list ends above the trigger");
    assert.ok(place.top >= MENU_MARGIN, "and never starts off the top of the window");
  });

  check(() => {
    /**
     * Squeezed both ways — a 360px-tall window. Neither side fits, so it takes the roomier one
     * rather than flipping to whichever merely overflows less by accident.
     */
    const squeezed = { top: 150, bottom: 180, right: 900, width: 150 };
    const place = selectMenuPlacement(squeezed, { width: 1280, height: 360 }, LANGS.length);
    assert.equal(place.drop, "down", "180px below beats 150px above");
  });

  check(() => {
    const squeezed = { top: 300, bottom: 330, right: 900, width: 150 };
    const place = selectMenuPlacement(squeezed, { width: 1280, height: 380 }, LANGS.length);
    assert.equal(place.drop, "up", "300px above beats 50px below");
  });

  check(() => {
    /** A trigger hard against the right edge: the list must not hang off it. */
    const edge = { top: 200, bottom: 230, right: 1278, width: 150 };
    const place = selectMenuPlacement(edge, VIEW, LANGS.length);
    assert.ok(place.left + place.width <= VIEW.width - MENU_MARGIN + 1, "clamped inside the right edge");
  });

  check(() => {
    /** And against the left, which is where a single Math.max gets it wrong under RTL. */
    const edge = { top: 200, bottom: 230, right: 40, width: 30 };
    const place = selectMenuPlacement(edge, VIEW, LANGS.length);
    assert.ok(place.left >= MENU_MARGIN, "never off the left edge");
  });

  check(() => {
    /** A narrow window where the list cannot fit at all still starts on-screen, not at -120. */
    const place = selectMenuPlacement({ top: 200, bottom: 230, right: 180, width: 150 }, { width: 200, height: 800 }, 7);
    assert.ok(place.left >= MENU_MARGIN, `left should stay on-screen, got ${place.left}`);
  });

  check(() => {
    assert.ok(menuHeight(50) <= 320, "a long list is capped and scrolls, rather than growing past the window");
    assert.ok(menuHeight(2) < menuHeight(7), "a short list is not padded to full height");
  });

  /* ── type-ahead ────────────────────────────────────────────────────────── */

  check(() => {
    assert.equal(typeAheadIndex(LANGS, 0, "d"), at("de"), "`d` finds Deutsch");
    assert.equal(typeAheadIndex(LANGS, 0, "de"), at("de"), "`de` still finds Deutsch");
  });

  check(() => {
    /** The English name is matched too: someone hunting German may not type `Deutsch`. */
    assert.equal(typeAheadIndex(LANGS, 0, "germ"), at("de"), "`germ` finds Deutsch by its English name");
    assert.equal(typeAheadIndex(LANGS, 0, "chin"), at("zh"), "`chin` finds 简体中文");
    assert.equal(typeAheadIndex(LANGS, 0, "port"), at("pt"), "`port` finds Português");
  });

  check(() => {
    /** Non-Latin endonyms have to be reachable in their own script, not only via English. */
    assert.equal(typeAheadIndex(LANGS, 0, "Рус"), at("ru"), "Cyrillic type-ahead finds Русский");
    assert.equal(typeAheadIndex(LANGS, 0, "简"), at("zh"), "a Han character finds 简体中文");
    assert.equal(typeAheadIndex(LANGS, 0, "الع"), at("ar"), "Arabic type-ahead finds العربية");
  });

  check(() => {
    /**
     * A single letter CYCLES. `e` from English moves on to Español rather than re-finding the row
     * the highlight is already on — the bug that reads as the list being stuck.
     */
    const first = typeAheadIndex(LANGS, -1, "e");
    assert.equal(first, at("en"), "`e` starts at English");
    const second = typeAheadIndex(LANGS, first, "e");
    assert.equal(second, at("es"), "`e` again moves to Español");
    const third = typeAheadIndex(LANGS, second, "e");
    assert.equal(third, at("en"), "`e` a third time wraps back to English");
  });

  check(() => {
    /** A longer buffer REFINES: it must include the row `d` just landed on, not skip past it. */
    const afterD = typeAheadIndex(LANGS, 0, "d");
    assert.equal(typeAheadIndex(LANGS, afterD, "de"), afterD, "`de` stays on the Deutsch `d` found");
  });

  check(() => {
    assert.equal(typeAheadIndex(LANGS, 5, "eng"), at("en"), "the search wraps past the end of the list");
  });

  check(() => {
    assert.equal(typeAheadIndex(LANGS, 0, "xyz"), null, "no match returns null rather than moving");
    assert.equal(typeAheadIndex(LANGS, 0, ""), null, "an empty buffer matches nothing");
    assert.equal(typeAheadIndex([], 0, "a"), null, "an empty list does not throw");
  });

  check(() => {
    assert.equal(typeAheadIndex(LANGS, 0, "ESPA"), at("es"), "matching is case-insensitive");
  });

  check(() => {
    /** -1 is the real starting `activeIndex` before anything is highlighted. */
    const hit = typeAheadIndex(LANGS, -1, "a");
    assert.ok(hit !== null && hit >= 0 && hit < LANGS.length, `index out of range: ${hit}`);
  });

  check(() => {
    assert.equal(nextTypeAheadBuffer("d", "e", 120), "de", "brisk typing extends the buffer");
    assert.equal(nextTypeAheadBuffer("d", "e", TYPE_AHEAD_RESET_MS + 1), "e", "a pause starts a new buffer");
    assert.equal(nextTypeAheadBuffer("", "d", 9e9), "d", "the very first keystroke is its own buffer");
  });

  console.log(`select-menu-smoke: OK (${n} assertions)`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
