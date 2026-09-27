# website

The public site for Rovyl. Static - no build step, no dependencies, no framework.
What is in this folder is what ships.

```
website/
├── index.html     the landing page
├── privacy.html   what stays local, and the four times the app touches the network
├── docs.html      the workspace-file reference the app's file view links to (/docs#workspace-file)
├── styles.css     the design system, lifted from the app
├── site.js        the hero wheel, the workspace cards, scroll reveal
├── settings.js    the settings panel, working: six sections, live controls
├── sound.js       the wheel's sound effects, synthesized as in the app
├── workspaces.js  GENERATED - the real workspaces and appearance config
├── vercel.json    clean URLs + cache headers
├── tools/
│   └── sync-workspaces.mjs   regenerates workspaces.js + assets/icons/
└── assets/
    ├── icons/         GENERATED - the app icons Rovyl extracted, one PNG per shortcut
    ├── logo.svg       the mark, white, used as a CSS mask so it takes `currentColor`
    ├── app-icon.svg   the installer/tray icon, copied from `public/icon.svg`
    ├── favicon.svg    the tab icon
    ├── og.svg         source for the share card
    └── og.png         rendered share card, 1200×630
```

## The page shows the real wheel

The hero is not a drawing of a launcher. `workspaces.js` and `assets/icons/` are
generated from an installed Rovyl - the actual workspaces in the actual order,
with the icons the app extracted from the Start Menu - so the wheel on the page
is the wheel on the machine. The same file drives the workspace cards further
down and the settings panel, which is not a screenshot: `settings.js` rebuilds
all six sections with the app's own groups, titles, descriptions and
conditional rows, and controls that actually move - including the panel's own
dropdown rather than a native `<select>`, whose popup Chromium draws
from the OS theme, the revert arrow that appears beside a row once it leaves
its default, the mouse-button recorder (press Record, then any button - the
press is swallowed, so Mouse 4/5 do not take the browser Back), the dock
position picker, and Sound's play buttons and practice wheel. Flipping Rovyl surfaces to White
repaints the window with the app's light token set; the Appearance sliders
drive a live wheel preview for the same reason the app has one, which is that
radius, icon size, spacing and dimming had no visible effect until the panel was
closed and the wheel triggered. Nothing persists, and nothing is wired to
anything that could write. It also carries each workspace's picker glyph, read out of the very
`lucide-react` build the app renders with.

Re-run after changing your wheel:

```bash
node website/tools/sync-workspaces.mjs
```

It reads `%APPDATA%/Rovyl/config-v2.json` and the icon store beside it. The
output is committed, so building the site never requires Rovyl to be installed -
and if `workspaces.js` is missing the hero simply does not run.

It copies every enabled workspace verbatim - names, shortcut labels, icons - so
read the diff before committing it. A shortcut to a personal file publishes that
file's name.

One thing to decide before publishing: those icons are third-party marks
(Discord, Steam, Figma…). Showing them is ordinary for a launcher - the product
genuinely launches them, and it is the same nominative use as the screenshots in
the repo README - but they are someone else's trademarks, so swap in a neutral
workspace if you would rather not.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve website
```

## Deploy

Point a static host at this folder. `vercel.json` is already here; Vercel needs
**Root Directory** set to `website` and no build command. The app links to the
site through `src/constants/siteUrls.ts` - keep `ZENITH_LAUNCHER_SITE_URL` and
the deployed domain in step. The docs link (`ZENITH_LAUNCHER_DOCS_URL`, behind the
workspace file editor's help button) points at `rovyl.arshitvaghasiya.com/docs`.

## Why it looks the way it does

Nothing in `styles.css` is invented. The surface tokens, the 4px space scale, the
radius hierarchy, the 32px control height and the eases are the same values the
app declares in `src/index.css`; the wheel's tile recipe - 18px radius, opaque
plate, light inner border over a dark outer ring - comes from
`src/components/RadialMenu.tsx`, and `roundedRectPathFromTop` is ported from it
verbatim so the sustained-aim arc starts at twelve o'clock here too. If the app's
tokens move, move them here.

The one hue on the page is the simulated desktop under the hero wheel. It is
scenery, not brand: the app's accent is the absence of colour, solid white on
near-black, and every control on this page keeps that.

## Regenerating the share card

`assets/og.svg` is the source. `sharp` is already a dev dependency of the app:

```bash
node -e "require('sharp')('website/assets/og.svg',{density:144}).resize(1200,630,{fit:'fill'}).png().toFile('website/assets/og.png')"
```

## Editing the hero wheel

`site.js` rebuilds the radial with the app's own state machine - bloom, presence,
sustained aim, launch echo - and hands over to the pointer as soon as one enters
the stage, because aiming it yourself is the demonstration.

The hub is the app's too: the Rovyl mark at the root, and the explicit Back
control once you are inside a level, at the same proportions `RadialMenu` draws
them.

It also has the app's two levels. With more than one workspace the app always
opens on the home launcher, so the wheel OPENS on the workspaces - synthetic
slices carrying each one's Lucide glyph and key, the way
`buildWorkspacePickerItems` builds them - and the one you aim at replaces the
ring with its shortcuts. The pill under the wheel says "Workspaces" there, and
the workspace's name once inside it, as the app's does. There is no switcher
widget on the page because there is none in the product. With a single
workspace the hero drops the launcher level on its own.

The wedges are drawn only when the config has Area targeting with **Visible
wedges** on (`areaWedges` in `workspaces.js`); off, the aim is the same and only
the icon lights, exactly as in the app.

The stage carries two controls that are the page's own rather than the
product's: **Sound** (see below), and **Launch without clicking**. Flip the
second and the demo behaves the way the app does with
`radialInstantActivate: 'dwell'`: the pointer stops existing, the aim alone
lights a target, and holding that aim opens it. Nothing is clicked, which is the
only way to explain a hands-free gesture. It uses the app's shipped hover time
(`DEFAULTS.radialInstantDwellMs`, 400 ms) and the same settling window the app
wins back on every level swap, so the first move after a ring changes cannot
resolve an aim nobody made. Neither switch aims the wheel: over them nothing is
lit, and a click on one is never a release on a slice.

Its geometry is solved from a budget rather than a fixed ratio: the aimed slice
puts a label under its tile and the workspace pill sits under the whole wheel, so
`measure()` reserves those bands, keeps a gutter no element may cross, and lifts
the hub by half of what hangs below it - which centres the composition instead of
the wheel. Two further rules hold it together:

- **Only `transform` and `opacity` animate.** Everything else is a class swap.
- **Nothing runs off screen.** An `IntersectionObserver` and `visibilitychange`
  stop the loop, and a coarse pointer never takes the gesture at all - swallowing
  a touch scroll to demo a mouse gesture is a bad trade.

## Sound

`sound.js` is `src/utils/radialSound.ts` ported line for line: the same ten
notes synthesized with Web Audio, the same master gain and limiter, and the same
`noteForHighlight` rule for when one plays - a note as the wheel opens, one each
time the highlight moves to a different item, and the opening note again when
the aim comes back to the centre. The page holds one copy of the sound settings
(seeded from `look.sounds`), so the Sound switch on the stage, the hero wheel and
the Sound section of the settings panel all read and write the same thing: pick
Knock in the panel and the wheel at the top plays Knock.

Notes play only while a visitor is driving a wheel; the unattended loop is
silent. Browsers will not start audio before the page has been clicked or typed
into, so until then every note is skipped rather than queued - and the stage's
Sound switch reads off until then. It shows whether a note would be heard, not
just the setting: a switch reading "on" over a silent wheel got pressed, turned
sound OFF, and had to be pressed a second time. Now the first press turns it on
and plays a note, and any other first click on the page flips it on by itself.
