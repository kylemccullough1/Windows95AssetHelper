/**
 * The scene document — what the studio composes and what the exporter turns into comps.
 *
 * This is deliberately plain, serialisable data with no React in it. The window manager's own
 * `WindowState` cannot be used directly because it carries `icon: ReactElement` and
 * `content: ReactNode`, neither of which can be serialised or handed to After Effects. So the
 * scene keeps the *exportable projection* of a window: geometry, title, and which catalogue icon
 * sits in its title bar.
 *
 * Keeping the export input as data (rather than reading the live DOM) is note 04's verdict, and
 * it is what lets the generator be unit-tested with no browser and no mounted desktop.
 */

import { WIN95_COLORS } from '../assets/chrome'

/** An icon placed freely on the desktop. */
export type PlacedIcon = {
  /** Unique per placement — the same catalogue icon can be dropped many times. */
  instanceId: string
  /** Catalogue id, e.g. `Computer3_32x32_4`. */
  assetId: string
  /** Top-left position in scene pixels. */
  x: number
  y: number
  /** Caption drawn under the icon. Empty string means no label. */
  label: string
}

/** A window as the scene exports it. */
export type SceneWindow = {
  id: string
  title: string
  /** Catalogue id for the title-bar icon, or null for a window with no icon. */
  iconAssetId: string | null
  x: number
  y: number
  width: number
  height: number
  /** Stacking order; higher is nearer the front. */
  z: number
  /** Windows 95 drew inactive title bars grey. Only one window is active. */
  active: boolean
}

/** A complete composition. */
export type Scene = {
  name: string
  width: number
  height: number
  /** Comps need a frame rate and a duration even when nothing moves. */
  fps: number
  durationSeconds: number
  /** Desktop background colour, as `#rrggbb`. */
  background: string
  showTaskbar: boolean
  icons: PlacedIcon[]
  windows: SceneWindow[]
}

/** A 640x480 teal desktop — the default new scene. */
export function emptyScene(name = 'Untitled'): Scene {
  return {
    name,
    width: 640,
    height: 480,
    fps: 30,
    durationSeconds: 10,
    background: WIN95_COLORS.desktop,
    showTaskbar: true,
    icons: [],
    windows: [],
  }
}

/** Every catalogue asset the scene references, deduplicated. Drives the "used assets" export. */
export function sceneAssetIds(scene: Scene): string[] {
  const ids = new Set<string>()
  for (const icon of scene.icons) ids.add(icon.assetId)
  for (const win of scene.windows) if (win.iconAssetId) ids.add(win.iconAssetId)
  return [...ids].sort()
}
