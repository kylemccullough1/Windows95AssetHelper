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
 *
 * `import.meta.glob` is why this module cannot be imported outside a Vite pipeline. Everything
 * that does not need enumeration lives in `iconGeometry.ts` and is re-exported here, so a plain
 * Node script can parse icons without touching the bundler.
 */

import {
  PATHLESS_ICONS,
  parseAssetId,
  parseIconSvg,
  type IconAsset,
  type IconGeometry,
} from './iconGeometry'

export {
  PATHLESS_ICONS,
  parseAssetId,
  parseIconSvg,
  type IconAsset,
  type IconGeometry,
  type IconLayer,
} from './iconGeometry'

const URLS = import.meta.glob('../../node_modules/@react95/icons/svg/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * The same catalogue as PNG. These are the *export* artwork, not the browsing thumbnails.
 *
 * The package format is PNG footage because it is the only route that reaches After Effects
 * pixel-exact — rebuilding the artwork as shape layers renders blended (99 of 256 pixels differ
 * on a measured icon) because AE anti-aliases dense shape geometry. So the studio needs the PNG
 * bytes to ship alongside the generated script.
 */
const PNG_URLS = import.meta.glob('../../node_modules/@react95/icons/png/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const PATHLESS = new Set(PATHLESS_ICONS)

/**
 * `.../svg/Computer3_16x16_4.svg` -> `Computer3_16x16_4`, and the same for `.png`.
 *
 * Strips whatever extension is there rather than `.svg` specifically: the same helper keys both
 * the SVG and the PNG map, and an `.svg`-only version silently left PNG keys as
 * `Computer3_16x16_4.png`, so every lookup missed and the export failed with "No PNG artwork".
 */
function stemOf(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/**
 * Every icon worth showing, sorted by name then by size.
 * Built once at module load from the eager URL glob — 1536 string entries, no artwork.
 */
export const ICON_ASSETS: readonly IconAsset[] = Object.entries(URLS)
  .map(([path, url]) => parseAssetId(stemOf(path), url))
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

const PNG_BY_ID = new Map(
  Object.entries(PNG_URLS).map(([path, url]) => [stemOf(path), url] as const),
)

/** URL of an asset's PNG artwork — what the package export ships to After Effects. */
export function pngUrlFor(id: string): string | undefined {
  return PNG_BY_ID.get(id)
}

/** Fetch an asset's PNG bytes, for bundling beside the generated script. */
export async function loadIconPng(id: string): Promise<Uint8Array> {
  const url = PNG_BY_ID.get(id)
  if (!url) throw new Error(`No PNG artwork for ${JSON.stringify(id)}`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Fetching ${id}.png failed: HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
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
