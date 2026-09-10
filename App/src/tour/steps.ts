/**
 * The tour step model, and the studio's own tutorial written against it.
 *
 * A tour is data. The engine (`ClippyTour`) plays it and knows nothing about the studio: what an
 * `actions` string does and what an `advanceWhen` key watches are resolved by `StudioTour`.
 * That split is what lets the same engine drive this tutorial and, later, a per-feature one
 * ("how the two-stage export works") without touching the engine at all.
 *
 * The step model is the duckdgoose site's, unchanged, so a step written for one plays in the
 * other. See the provenance note on the engine files.
 */

import { ICON_FAMILIES } from '../assets/families'

export type TourTarget = {
  /** A `data-tutorial` value somewhere in the DOM. */
  key: string
  /** Highlight colour. Defaults walk HIGHLIGHT_COLORS, so a second target reads differently. */
  color?: string
}

export type TourStep = {
  id: string
  say: string
  /** Smaller second line: what to do to continue. */
  hint?: string
  /** Things to spotlight and point at. The first is where Clippy stands. */
  targets?: TourTarget[]
  animation?: string
  /** Shell actions to run on entering the step, in order. Resolved by the app. */
  actions?: string[]
  /** 'center': front and centre, very large. 'near': beside the first target, large. */
  clippy: 'center' | 'near'
  /** Advance on its own when the watched value changes after the step settles. Resolved by the app. */
  advanceWhen?: string
  nextLabel?: string
  skipLabel?: string
}

/** Yellow first, cyan second: the two read as different on the teal desktop and on grey chrome. */
export const HIGHLIGHT_COLORS = ['#ffff00', '#00ffff'] as const

/**
 * The studio tutorial: how to get assets and turn them into After Effects comps.
 *
 * The arc is the one the app is actually for, in the order the work happens — find an icon,
 * check what it will become, put it on the desktop, add a window, then the two-stage export and
 * where the finished project lands. Steps that ask for something wait for it (`advanceWhen`);
 * steps that only explain use Next.
 *
 * The vocabulary is deliberate. After Effects calls things comps, footage and layers, and the
 * tutorial uses those words rather than softer ones, because the person finishing this tour is
 * about to be looking at a project window full of them.
 */
export const tutorialSteps: TourStep[] = [
  {
    id: 'welcome',
    say: 'This is the Windows 95 Asset Studio. Compose a desktop here, and it comes out the other end as an After Effects project with every icon on its own layer.',
    hint: 'Two minutes and you will know the whole thing.',
    animation: 'Greeting',
    clippy: 'center',
    actions: ['closeStartMenu', 'closeAll'],
    nextLabel: 'Show me',
    skipLabel: 'No thanks',
  },
  {
    id: 'start-button',
    say: 'Everything in the studio starts from the Start button, exactly like the real thing.',
    hint: 'Click it to continue.',
    targets: [{ key: 'start-button' }],
    animation: 'GestureDown',
    clippy: 'near',
    actions: ['closeStartMenu'],
    advanceWhen: 'startMenuOpen',
  },
  {
    id: 'open-browser',
    // The count comes from the catalogue rather than being typed, so it can never disagree with
    // the number the browser's own status bar shows two clicks later.
    say: `The Asset Browser holds all ${ICON_FAMILIES.length} icons Windows 95 shipped, in every size each one came in.`,
    hint: 'Open the Asset Browser to continue.',
    targets: [{ key: 'start-asset-browser' }],
    animation: 'GestureRight',
    clippy: 'near',
    actions: ['openStartMenu'],
    advanceWhen: 'browserOpen',
  },
  {
    id: 'search',
    say: 'Search by name, or narrow by which part of Windows the icon came out of — the shell, Program Manager, the multimedia control panel. One tile is one icon, and the numbers under it are the sizes it ships in.',
    hint: 'Have a scroll. Nothing is hidden; the count at the bottom is the whole set.',
    targets: [{ key: 'asset-browser-window' }],
    animation: 'Searching',
    clippy: 'near',
    actions: ['openBrowser'],
  },
  {
    id: 'preview',
    say: 'Click a tile and the panel on the right shows exactly what you are about to add: the artwork magnified, the artwork at its true pixel size, and the comp name it becomes in After Effects.',
    hint: 'Pick an icon, then press Add to drop it on the desktop.',
    targets: [{ key: 'asset-add' }],
    animation: 'Explain',
    clippy: 'near',
    actions: ['openBrowser'],
    advanceWhen: 'iconCount',
  },
  {
    id: 'arrange',
    say: 'Drag it anywhere on the desktop. Arrow keys nudge it a pixel at a time, Shift+arrow ten. Where you put it is where it lands in the comp.',
    hint: 'Move it, or press Next.',
    animation: 'GetAttention',
    clippy: 'center',
  },
  {
    id: 'windows',
    say: 'Switch Add as to "Window" and the same icon becomes a real Windows 95 window instead — draggable, resizable, snappable. Its frame, bevels and title text are all rebuilt in After Effects.',
    hint: 'Add a window to continue.',
    targets: [{ key: 'asset-browser-window' }],
    animation: 'GetTechy',
    clippy: 'near',
    actions: ['openBrowser'],
    advanceWhen: 'windowCount',
  },
  {
    id: 'comp-size',
    say: 'The Start menu sets the comp size. "Fit to desktop" exports what you see; pick 1920×1080 and a dashed outline shows you what will actually be in frame.',
    hint: 'Have a look, then press Next.',
    targets: [{ key: 'comp-size' }],
    animation: 'Print',
    clippy: 'near',
    actions: ['openStartMenu'],
  },
  {
    id: 'export-panel',
    say: 'Now the export. Open it and I will explain the two halves.',
    hint: 'Open Export to After Effects to continue.',
    targets: [{ key: 'start-export' }],
    animation: 'GestureRight',
    clippy: 'near',
    actions: ['openStartMenu'],
    advanceWhen: 'exportOpen',
  },
  {
    id: 'package',
    say: 'Stage one builds the asset package: every icon you used becomes its own comp inside a standalone Win95Assets.aep. Slow, and you only do it when the set of icons changes.',
    hint: 'Nothing to press yet.',
    targets: [{ key: 'export-package' }],
    animation: 'Processing',
    clippy: 'near',
    actions: ['openExport'],
  },
  {
    id: 'scene',
    say: 'Stage two exports the scene. Its layers reference the package comps rather than copying them, so one icon is one comp no matter how many times it appears.',
    animation: 'Writing',
    targets: [{ key: 'export-scene' }],
    clippy: 'near',
    actions: ['openExport'],
  },
  {
    id: 'companion',
    say: 'If the local companion is running, skip both downloads: press Set up in After Effects, browse to a folder, and it builds the package, the scene and a finished .aep there for you.',
    hint: 'Not running? The buttons above still hand you the files to run by hand.',
    targets: [{ key: 'export-companion' }],
    animation: 'Save',
    clippy: 'near',
    actions: ['openExport'],
  },
  {
    id: 'done',
    say: 'That is the whole studio: find icons, arrange them, export. I am in the Start menu if you want this again.',
    animation: 'Congratulate',
    clippy: 'center',
    nextLabel: 'Finish',
  },
]
