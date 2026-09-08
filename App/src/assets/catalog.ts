/**
 * The icon catalogue: every asset @react95/icons ships, enumerated for browsing and export.
 *
 * `win95-ui` exports a hand-picked `Icons` map of 14 icons — the ones the duckdgoose site uses.
 * That is deliberately small so tree-shaking has a tiny surface. The studio wants the opposite:
 * the *whole* catalogue, because the point of the asset browser is to find the icon you did not
 * know existed. So this module goes to the package's `svg/` directory directly rather than
 * through its React components.
 *
 * There is exactly one glob — an eager `?url`, which resolves to 1536 short strings at build
 * time and puts none of the 6.6 MB of artwork into the JS bundle. Thumbnails point <img> at
 * those URLs, so the browser decodes and caches the artwork natively; the exporter `fetch`es the
 * same URL when it needs geometry.
 *
 * Two globs were tried first — a second lazy `?raw` one for the source text. It worked but was
 * strictly worse: it doubled the build's asset work (3072 `vite:asset load` calls) and emitted
 * 1517 extra JS chunks whose entire content was an SVG string already available at a URL.
 * Fetching the URL gets the same bytes with no bundler involvement.
 *
 * This only stays cheap because `vite.config.ts` exempts this directory from asset inlining.
 * Vite inlines assets under 4 kB as base64 data URIs by default, and most of these icons are
 * well under it, which put the whole catalogue in the main chunk and took it from 379 kB to
 * 3.7 MB. See the `assetsInlineLimit` comment there.
 */

import { mergeRuns, parseRuns, type PixelRect } from './svgPath'
import { normalizeColor } from './colors'

const URLS = import.meta.glob('../../node_modules/@react95/icons/svg/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Icons that ship with no `<path>` at all and render as an empty <svg>.
 *
 * These are real files in @react95/icons 2.5.3, not a loading bug — duckdgoose hit this with
 * Joy108 rendering blank on the desktop, and note 04 says the browser should hide such variants
 * rather than show empty tiles. Derived by `grep -L '<path>'` over the package's svg/ directory;
 * `catalog.test.ts` re-derives the list and fails if a package upgrade changes it, so this
 * constant cannot silently drift.
 */
export const PATHLESS_ICONS: readonly string[] = [
  'Confcp107_32x32_4', 'Confcp108_32x32_4', 'Confcp109_32x32_4', 'Confcp120_32x32_4',
  'Dial_16x16_4', 'FileFind3_16x16_4', 'FilePick_16x16_4', 'Joy108_32x32_4',
  'KeyboardMouse_16x16_4', 'Mailnews17_32x32_4', 'Mailnews18_32x32_4', 'Mmsys122_16x16_4',
  'Mmsys122_32x32_4', 'Mmsys124_32x32_4', 'Mshtml32538_16x16_4', 'Mshtml32543_32x32_4',
  'Shdocvw273_32x32_4', 'WindowAbc_16x16_4', 'WindowGraph_16x16_4',
]

const PATHLESS = new Set(PATHLESS_ICONS)

/** A browsable entry. Cheap: no geometry, so the whole catalogue can be held in memory. */
export type IconAsset = {
  /** Stable identifier and the package's own filename stem, e.g. `Computer3_16x16_4`. */
  id: string
  /** The icon family, shared across sizes, e.g. `Computer3`. */
  name: string
  width: number
  height: number
  /** Colour depth from the filename: 1, 4, 8 or 32. */
  depth: number
  /** Build-resolved URL, for <img src>. */
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

/** `.../svg/Computer3_16x16_4.svg` -> `Computer3_16x16_4` */
function stemOf(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.endsWith('.svg') ? file.slice(0, -4) : file
}

const NAME_SIZE_DEPTH = /^(.+)_(\d+)x(\d+)_(\d+)$/

function parseStem(stem: string, url: string): IconAsset | null {
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

/**
 * Every icon worth showing, sorted by name then by size.
 * Built once at module load from the eager URL glob — 1536 string entries, no artwork.
 */
export const ICON_ASSETS: readonly IconAsset[] = Object.entries(URLS)
  .map(([path, url]) => parseStem(stemOf(path), url))
  .filter((asset): asset is IconAsset => asset !== null && !PATHLESS.has(asset.id))
  .sort((a, b) => a.name.localeCompare(b.name) || a.width - b.width || a.depth - b.depth)

const BY_ID = new Map(ICON_ASSETS.map((asset) => [asset.id, asset]))

export function findIcon(id: string): IconAsset | undefined {
  return BY_ID.get(id)
}

/** Distinct pixel sizes present in the catalogue, ascending — drives the browser's size filter. */
export const ICON_SIZES: readonly number[] = [...new Set(ICON_ASSETS.map((a) => a.width))].sort(
  (a, b) => a - b,
)

/** Matches `<path stroke="..." d="..."/>`, the only element these files contain. */
const PATH_ELEMENT = /<path\s+stroke="([^"]*)"\s+d="([^"]*)"\s*\/?>/g

/** Parse SVG source into per-colour merged rectangles. Pure; exported for testing. */
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

const geometryCache = new Map<string, Promise<IconGeometry>>()

/**
 * Fetch and parse one icon's geometry, memoised.
 *
 * The memo is on the *promise*, not the result, so concurrent callers during a bulk export share
 * one fetch instead of racing — with a few thousand icons in flight that is the difference
 * between one network/disk read per icon and several.
 */
export function loadIconGeometry(id: string): Promise<IconGeometry> {
  const cached = geometryCache.get(id)
  if (cached) return cached

  const asset = BY_ID.get(id)
  if (!asset) return Promise.reject(new Error(`Unknown icon ${JSON.stringify(id)}`))

  const pending = fetch(asset.url)
    .then((response) => {
      if (!response.ok) throw new Error(`Fetching ${asset.id} failed: HTTP ${response.status}`)
      return response.text()
    })
    .then((svg) => parseIconSvg(asset, svg))
    .catch((error: unknown) => {
      // Do not cache a rejection: a transient failure would otherwise poison this id for the
      // lifetime of the page, and a bulk export would keep re-reading the same dead entry.
      geometryCache.delete(id)
      throw error
    })

  geometryCache.set(id, pending)
  return pending
}
