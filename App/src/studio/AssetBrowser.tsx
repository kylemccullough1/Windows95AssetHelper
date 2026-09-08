import { useDeferredValue, useMemo, useState } from 'react'
import { Button, Input } from '@duckdgoose/win95-ui'

import { ICON_ASSETS, ICON_SIZES, type IconAsset } from '../assets/catalog'

/**
 * The asset browser: all 1517 drawable icons @react95/icons ships, searchable and filterable.
 *
 * Two decisions worth knowing about.
 *
 * **Thumbnails are plain <img> pointing at the icon's own URL.** No SVG is parsed or inlined to
 * show the grid, so opening the panel costs one cached HTTP request per visible tile and nothing
 * in the JS bundle. Geometry is only ever parsed for icons that are actually exported.
 *
 * **The list is windowed by a simple cap rather than a virtual scroller.** 1517 <img> tags is
 * enough to make layout janky, and a full virtualiser is a dependency and a pile of measurement
 * code for a panel whose whole job is "find the icon". Search narrows far faster than scrolling
 * does, so the cap plus a "showing N of M" line is the honest, much smaller answer. If browsing
 * ever becomes the primary interaction, revisit.
 */

const PAGE = 300

/** What clicking a tile does. Both end up in the scene; they become different AE layers. */
export type DropMode = 'icon' | 'window'

type Props = {
  /** Called when an asset is chosen — the studio drops it on the desktop. */
  onPlace: (asset: IconAsset, as: DropMode) => void
}

export function AssetBrowser({ onPlace }: Props) {
  const [query, setQuery] = useState('')
  const [size, setSize] = useState<number | 'all'>(32)
  const [limit, setLimit] = useState(PAGE)
  const [mode, setMode] = useState<DropMode>('icon')

  // The catalogue is large enough that filtering on every keystroke stutters. useDeferredValue
  // lets React keep the input responsive and re-filter at a lower priority.
  const deferredQuery = useDeferredValue(query)

  const matches = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return ICON_ASSETS.filter((asset) => {
      if (size !== 'all' && asset.width !== size) return false
      return needle === '' || asset.name.toLowerCase().includes(needle)
    })
  }, [deferredQuery, size])

  const visible = matches.slice(0, limit)

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-[12px]">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          placeholder="Search 1517 icons…"
          className="min-w-0 flex-1"
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
          }}
        />
        <select
          value={String(size)}
          className="border border-[#808080] bg-white px-1 py-[2px] text-[12px]"
          onChange={(e) => {
            setSize(e.target.value === 'all' ? 'all' : Number(e.target.value))
            setLimit(PAGE)
          }}
        >
          <option value="all">All sizes</option>
          {ICON_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </div>

      {/* What a click does. A 16px icon in a title bar and a 32px icon on the desktop are the
          same catalogue asset and the same package comp — only the layer around them differs. */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-[#404040]">Click to add as:</span>
        {(['icon', 'window'] as const).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-1 text-[11px]">
            <input
              type="radio"
              name="drop-mode"
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {value === 'icon' ? 'Desktop icon' : 'Window'}
          </label>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border border-[#808080] bg-white p-1">
        {visible.length === 0 ? (
          <p className="p-3 text-center text-[#808080]">No icon matches “{query}”.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1">
            {visible.map((asset) => (
              <button
                key={asset.id}
                type="button"
                title={`${asset.id} — click to add as ${mode === 'icon' ? 'a desktop icon' : 'a window'}`}
                onClick={() => onPlace(asset, mode)}
                className="flex cursor-pointer flex-col items-center gap-1 border border-transparent p-1 hover:border-[#000080] hover:bg-[#000080]/10 focus:outline focus:outline-1 focus:outline-black"
              >
                <img
                  src={asset.url}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  /* Pixel art must never be smoothed when the browser scales a 16px icon up. */
                  style={{ imageRendering: 'pixelated', width: 32, height: 32, objectFit: 'contain' }}
                />
                <span className="w-full truncate text-center text-[10px] leading-tight">
                  {asset.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#404040]">
          Showing {visible.length} of {matches.length}
          {matches.length !== ICON_ASSETS.length && ` (${ICON_ASSETS.length} total)`}
        </span>
        {visible.length < matches.length && (
          <Button onClick={() => setLimit((n) => n + PAGE)}>Show more</Button>
        )}
      </div>
    </div>
  )
}
