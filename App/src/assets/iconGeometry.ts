/**
 * Icon geometry: turning one SVG's source text into per-colour rectangles.
 *
 * This is deliberately separate from `catalog.ts`. The catalogue *enumerates* what exists, and it
 * does so with `import.meta.glob`, which is a Vite build-time construct — importing that module
 * outside a Vite pipeline throws. Parsing a single icon needs none of that.
 *
 * Splitting them means the parsing half runs anywhere: in the browser, in Vitest, and in a plain
 * Node script that reads the package's `svg/` directory itself and generates an ExtendScript
 * file with no bundler and no browser involved. That last one is how the export gets verified
 * against a real After Effects.
 */

import { mergeRuns, parseRuns, type PixelRect } from './svgPath'
import { normalizeColor } from './colors'

/** A browsable catalogue entry. Cheap: no geometry, so the whole catalogue fits in memory. */
export type IconAsset = {
  /** Stable identifier and the package's own filename stem, e.g. `Computer3_16x16_4`. */
  id: string
  /** The icon family, shared across sizes, e.g. `Computer3`. */
  name: string
  width: number
  height: number
  /** Colour depth from the filename: 1, 4, 8 or 32. */
  depth: number
  /** Build-resolved URL, for <img src>. Empty when constructed outside the bundler. */
  url: string
}

/** One colour's worth of geometry within an icon. */
export type IconLayer = { color: string; rects: PixelRect[] }

/** An icon with its geometry resolved — what the exporter consumes. */
export type IconGeometry = {
  asset: IconAsset
  layers: IconLayer[]
  /** Total rectangles across all colours. Drives the export progress estimate. */
  shapeCount: number
}

/**
 * Icons that ship with no `<path>` at all and render as an empty <svg>.
 *
 * These are real files in @react95/icons 2.5.3, not a loading bug — duckdgoose hit this with
 * Joy108 rendering blank on the desktop, and note 04 says the browser should hide such variants
 * rather than show empty tiles. Derived by `grep -L '<path>'` over the package's svg/ directory;
 * `assets.test.ts` re-derives the list and fails if a package upgrade changes it, so this
 * constant cannot silently drift.
 */
export const PATHLESS_ICONS: readonly string[] = [
  'Confcp107_32x32_4', 'Confcp108_32x32_4', 'Confcp109_32x32_4', 'Confcp120_32x32_4',
  'Dial_16x16_4', 'FileFind3_16x16_4', 'FilePick_16x16_4', 'Joy108_32x32_4',
  'KeyboardMouse_16x16_4', 'Mailnews17_32x32_4', 'Mailnews18_32x32_4', 'Mmsys122_16x16_4',
  'Mmsys122_32x32_4', 'Mmsys124_32x32_4', 'Mshtml32538_16x16_4', 'Mshtml32543_32x32_4',
  'Shdocvw273_32x32_4', 'WindowAbc_16x16_4', 'WindowGraph_16x16_4',
]

const NAME_SIZE_DEPTH = /^(.+)_(\d+)x(\d+)_(\d+)$/

/** `Computer3_16x16_4` -> its parts, or null when the name does not fit the package's scheme. */
export function parseAssetId(stem: string, url = ''): IconAsset | null {
  const m = NAME_SIZE_DEPTH.exec(stem)
  if (!m) return null
  return {
    id: stem,
    name: m[1],
    width: Number(m[2]),
    height: Number(m[3]),
    depth: Number(m[4]),
    url,
  }
}

/** Matches `<path stroke="..." d="..."/>`, the only element these files contain. */
const PATH_ELEMENT = /<path\s+stroke="([^"]*)"\s+d="([^"]*)"\s*\/?>/g

/** Parse SVG source into per-colour merged rectangles. Pure. */
export function parseIconSvg(asset: IconAsset, svg: string): IconGeometry {
  const layers: IconLayer[] = []
  let shapeCount = 0

  PATH_ELEMENT.lastIndex = 0
  for (let m = PATH_ELEMENT.exec(svg); m !== null; m = PATH_ELEMENT.exec(svg)) {
    const rects = mergeRuns(parseRuns(m[2]))
    if (rects.length === 0) continue
    layers.push({ color: normalizeColor(m[1]), rects })
    shapeCount += rects.length
  }

  return { asset, layers, shapeCount }
}
