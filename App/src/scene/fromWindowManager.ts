/**
 * Projecting live window-manager state onto the scene document.
 *
 * Two things make this more than a field copy.
 *
 * **Not every open window is scene content.** The studio's own UI — the asset browser, the export
 * panel — are real windows in the same manager. Exporting "all windows" would put the studio's
 * chrome into the comp. Scene windows are therefore tagged with `data.scene === 'true'` when they
 * are opened, using the `data` field the window manager already provides for exactly this kind of
 * out-of-band marking, and everything untagged is ignored.
 *
 * **`WindowState.rect` is the floating geometry, not the effective one.** The manager deliberately
 * preserves the floating rect through snaps and maximise so that restoring goes back to where the
 * window was. A maximised window therefore still reports its small pre-maximise rect, and
 * exporting that would produce a comp that does not match what is on screen. `rectForLayout` below
 * resolves layout + work area into the rectangle actually occupied.
 */

import type { Rect, WindowLayout, WindowState } from '@duckdgoose/win95-ui'

import type { SceneWindow } from './types'

/**
 * The package defines `Size` internally but does not re-export it from its index, unlike `Rect`.
 * Declared here rather than reaching into the package's source path, which the module alias does
 * not cover and which would break once the package ships built files.
 */
type Size = { width: number; height: number }

/** Key under which a scene window records its title-bar icon. */
export const SCENE_ICON_KEY = 'assetId'
/** Marks a window as scene content rather than studio UI. */
export const SCENE_TAG_KEY = 'scene'

/**
 * The rectangle a window occupies for a given layout.
 *
 * This mirrors `rectForLayout` in @duckdgoose/win95-ui's `window/snap.ts`, which is not part of
 * the package's public exports. Duplicating ten lines is better than a deep import into the
 * package's source layout, which the alias does not cover and which would break the day the
 * package is published and ships built files instead. `fromWindowManager.test.ts` pins all four
 * cases, so drift shows up as a failing test rather than a subtly wrong export.
 *
 * When the package is published it should export this; then delete the copy.
 */
export function rectForLayout(layout: WindowLayout, workArea: Size, floating: Rect): Rect {
  const half = Math.floor(workArea.width / 2)
  switch (layout) {
    case 'maximized':
      return { x: 0, y: 0, width: workArea.width, height: workArea.height }
    case 'left':
      return { x: 0, y: 0, width: half, height: workArea.height }
    case 'right':
      return { x: half, y: 0, width: workArea.width - half, height: workArea.height }
    default:
      return floating
  }
}

/** True when this window is scene content rather than part of the studio's own interface. */
export function isSceneWindow(win: WindowState): boolean {
  return win.data?.[SCENE_TAG_KEY] === 'true'
}

/**
 * Convert the manager's live windows into the scene's exportable projection.
 *
 * Minimised windows are dropped: they are not visible on the desktop, so putting them in the comp
 * would export something the user cannot see. That mirrors how a placed icon behaves — what is on
 * the desktop is what is exported.
 *
 * Ordering is by `z` ascending (back to front), which is the order the generator emits and the
 * order After Effects needs to build the stack by simple appends.
 */
export function sceneWindowsFrom(
  windows: readonly WindowState[],
  activeId: string | null,
  workArea: Size,
): SceneWindow[] {
  return windows
    .filter((win) => isSceneWindow(win) && !win.minimized)
    .map((win) => {
      const rect = rectForLayout(win.layout, workArea, win.rect)
      return {
        id: win.id,
        title: win.title,
        iconAssetId: win.data?.[SCENE_ICON_KEY] ?? null,
        // Whole pixels: the scene exports to pixel-art comps, and a fractional origin would put
        // a crisp 1px bevel across two pixels in After Effects.
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        z: win.z,
        active: win.id === activeId,
      }
    })
    .sort((a, b) => a.z - b.z)
}
