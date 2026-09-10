import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input } from '@duckdgoose/win95-ui'

import { ICON_ASSETS, PATHLESS_ICONS, type IconAsset } from '../assets/catalog'
import {
  ICON_FAMILIES,
  ICON_GROUPS,
  LISTED_GROUPS,
  OTHER_GROUP,
  inGroup,
  type IconFamily,
} from '../assets/families'

/**
 * The asset browser: every drawable icon @react95/icons ships, organised so you can see it.
 *
 * The first version was a flat grid of all 1517 *variants* capped at 300 tiles, defaulting to
 * the 32px filter. That was wrong in three ways at once, and the complaint it drew — "it looks
 * like we don't have all the assets" — was correct even though nothing was missing:
 *
 *   1. The default size filter hid 588 variants, including every family that only ships at
 *      16px. Now nothing is filtered until you ask for it.
 *   2. The 300-tile cap plus a "Show more" button meant the set looked a fifth of its real
 *      size. Now the grid is virtualised, so all 975 families are one scroll away and the
 *      counts at the bottom are the whole truth.
 *   3. Listing every size of every icon as its own tile read as duplicates. Now one tile is one
 *      *family* and its sizes are a property of it, which is how a person thinks about it.
 *
 * The other half of the complaint — "we should be able to see what we are going to be adding" —
 * is the preview pane. Clicking a tile no longer drops something on the desktop; it loads the
 * asset into the pane, which shows the artwork magnified, the artwork at its true pixel size,
 * the exact catalogue id that will be exported, and which variant is selected. Adding is then a
 * deliberate act: the Add button, or a double-click on the tile.
 */

/** What clicking Add does. Both end up in the scene; they become different AE layers. */
export type DropMode = 'icon' | 'window'

/** Grid cell geometry. Fixed, because virtualisation needs to know a row's height up front. */
const TILE_MIN_WIDTH = 78
const TILE_HEIGHT = 86
/** Rows rendered beyond the viewport, so a fast scroll does not show empty space. */
const OVERSCAN = 2

type Props = {
  /** Called when an asset is committed — the studio drops it on the desktop. */
  onPlace: (asset: IconAsset, as: DropMode) => void
}

export function AssetBrowser({ onPlace }: Props) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string>('all')
  const [size, setSize] = useState<number | 'all'>('all')
  const [mode, setMode] = useState<DropMode>('icon')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  /**
   * The size the user last chose, carried from one selection to the next. Picking 16px on one
   * family and having the next one snap back to 32px is the kind of small betrayal that makes
   * a browser tiring to use.
   */
  const [preferredWidth, setPreferredWidth] = useState<number | null>(null)

  // The catalogue is large enough that filtering on every keystroke stutters. useDeferredValue
  // keeps the input responsive and re-filters at a lower priority.
  const deferredQuery = useDeferredValue(query)

  const matches = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    return ICON_FAMILIES.filter((family) => {
      if (group !== 'all' && !inGroup(family, group, LISTED_GROUPS)) return false
      if (size !== 'all' && !family.sizes.includes(size)) return false
      if (needle === '') return true
      // Match the group too, so typing "shell" finds Shell32 as well as anything named Shell*.
      return (
        family.name.toLowerCase().includes(needle) || family.group.toLowerCase().includes(needle)
      )
    })
  }, [deferredQuery, group, size])

  // A selection that the current filters have hidden is confusing rather than helpful: the pane
  // would describe something not on screen. Drop it and let the user pick again.
  const selected = useMemo(
    () => matches.find((family) => family.name === selectedName) ?? null,
    [matches, selectedName],
  )

  const variant = selected ? variantFor(selected, preferredWidth, size) : null

  function commit(asset: IconAsset | null) {
    if (asset) onPlace(asset, mode)
  }

  const visibleVariants = matches.reduce((total, family) => total + family.variants.length, 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-[6px] p-2 text-[12px]">
      <Toolbar
        query={query}
        group={group}
        size={size}
        onQuery={(value) => setQuery(value)}
        onGroup={setGroup}
        onSize={setSize}
      />

      <div className="flex min-h-0 flex-1 gap-2">
        <FamilyGrid
          families={matches}
          selectedName={selected?.name ?? null}
          onSelect={setSelectedName}
          onCommit={(family) => commit(variantFor(family, preferredWidth, size))}
        />

        <Preview
          family={selected}
          variant={variant}
          mode={mode}
          onMode={setMode}
          onVariant={(chosen) => setPreferredWidth(chosen.width)}
          onAdd={() => commit(variant)}
        />
      </div>

      {/*
        The honest total, always on screen. `PATHLESS_ICONS` are real files in the package that
        contain no <path> and render as an empty box; naming them here is what stops the gap
        between 1536 files and 1517 usable ones from looking like something went missing.
      */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-[#404040]">
        <span>
          {matches.length} of {ICON_FAMILIES.length} icons · {visibleVariants} of{' '}
          {ICON_ASSETS.length} size variants
        </span>
        <span title={`These ship with no artwork in @react95/icons: ${PATHLESS_ICONS.join(', ')}`}>
          {PATHLESS_ICONS.length} blank variants hidden
        </span>
      </div>
    </div>
  )
}

/**
 * Which variant of a family gets added.
 *
 * The active size filter wins — if you are looking at 16px icons, "add" means the 16px one.
 * Otherwise the size you last picked by hand, then the family's own preview choice.
 */
function variantFor(
  family: IconFamily,
  preferredWidth: number | null,
  filterSize: number | 'all',
): IconAsset {
  const at = (width: number) => family.variants.filter((v) => v.width === width)
  const richest = (pool: IconAsset[]) => [...pool].sort((a, b) => b.depth - a.depth)[0]

  if (filterSize !== 'all') {
    const exact = at(filterSize)
    if (exact.length > 0) return richest(exact)
  }
  if (preferredWidth !== null) {
    const exact = at(preferredWidth)
    if (exact.length > 0) return richest(exact)
  }
  return family.preview
}

// ---------------------------------------------------------------------------- toolbar

function Toolbar({
  query,
  group,
  size,
  onQuery,
  onGroup,
  onSize,
}: {
  query: string
  group: string
  size: number | 'all'
  onQuery: (value: string) => void
  onGroup: (value: string) => void
  onSize: (value: number | 'all') => void
}) {
  // Sizes offered are the ones families actually ship, so the filter can never produce an
  // empty grid by naming a size nothing has.
  const sizes = useMemo(
    () => [...new Set(ICON_FAMILIES.flatMap((f) => f.sizes))].sort((a, b) => a - b),
    [],
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={query}
        placeholder={`Search ${ICON_FAMILIES.length} icons…`}
        className="min-w-[120px] flex-1"
        onChange={(e) => onQuery(e.target.value)}
      />
      <label className="flex items-center gap-1 text-[11px]">
        From
        <select
          value={group}
          className="max-w-[130px] border border-[#808080] bg-white px-1 py-[2px] text-[11px]"
          onChange={(e) => onGroup(e.target.value)}
          title="The Windows 95 component these icons were pulled out of"
        >
          <option value="all">Everywhere</option>
          {ICON_GROUPS.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name === OTHER_GROUP ? 'Other' : g.name} ({g.count})
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-[11px]">
        Size
        <select
          value={String(size)}
          className="border border-[#808080] bg-white px-1 py-[2px] text-[11px]"
          onChange={(e) => onSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
        >
          <option value="all">Any</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

// ---------------------------------------------------------------------------- grid

/**
 * A virtualised grid of family tiles.
 *
 * Only the rows on screen are in the DOM. 975 tiles is enough <img> to make scrolling stutter
 * and enough layout to make the window feel broken; the previous answer to that was a 300-item
 * cap, which solved the jank by hiding two thirds of the catalogue. Windowing solves it without
 * lying about how much there is.
 *
 * The maths is deliberately the simple kind: every cell is exactly `TILE_HEIGHT` tall, so the
 * row a scroll offset lands on is a division and no measurement is needed. Variable-height
 * virtualisation would need a measured cache; a uniform icon grid never does.
 */
function FamilyGrid({
  families,
  selectedName,
  onSelect,
  onCommit,
}: {
  families: readonly IconFamily[]
  selectedName: string | null
  onSelect: (name: string) => void
  onCommit: (family: IconFamily) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setViewport({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A filter change can leave the scroll position past the end of the new, shorter list.
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [families])

  const columns = Math.max(1, Math.floor(viewport.width / TILE_MIN_WIDTH))
  const rows = Math.ceil(families.length / columns)
  const firstRow = Math.max(0, Math.floor(scrollTop / TILE_HEIGHT) - OVERSCAN)
  const lastRow = Math.min(
    rows,
    Math.ceil((scrollTop + viewport.height) / TILE_HEIGHT) + OVERSCAN,
  )
  const cellWidth = columns > 0 ? viewport.width / columns : TILE_MIN_WIDTH

  return (
    <div
      // The ref goes on the scrolling element itself: clientHeight of anything else is the
      // wrong number to virtualise against.
      ref={ref}
      className="win95-sunken min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-white"
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      {families.length === 0 ? (
        <p className="p-4 text-center text-[#808080]">Nothing matches those filters.</p>
      ) : (
        <div style={{ position: 'relative', height: rows * TILE_HEIGHT }}>
          {families.slice(firstRow * columns, lastRow * columns).map((family, offset) => {
            const index = firstRow * columns + offset
            return (
              <FamilyTile
                key={family.name}
                family={family}
                selected={family.name === selectedName}
                onSelect={onSelect}
                onCommit={onCommit}
                style={{
                  position: 'absolute',
                  left: (index % columns) * cellWidth,
                  top: Math.floor(index / columns) * TILE_HEIGHT,
                  width: cellWidth,
                  height: TILE_HEIGHT,
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function FamilyTile({
  family,
  selected,
  onSelect,
  onCommit,
  style,
}: {
  family: IconFamily
  selected: boolean
  onSelect: (name: string) => void
  onCommit: (family: IconFamily) => void
  style: React.CSSProperties
}) {
  return (
    <button
      type="button"
      style={style}
      title={`${family.name} — ${family.variants.length} variant${
        family.variants.length === 1 ? '' : 's'
      }. Double-click to add.`}
      aria-pressed={selected}
      onClick={() => onSelect(family.name)}
      onDoubleClick={() => onCommit(family)}
      className={`flex cursor-pointer flex-col items-center justify-start gap-[2px] p-1 text-center ${
        selected ? 'bg-[#000080] text-white' : 'text-black hover:bg-[#000080]/10'
      }`}
    >
      <span className="flex h-[40px] w-full items-center justify-center">
        <img
          src={family.preview.url}
          alt=""
          loading="lazy"
          decoding="async"
          /* Pixel art must never be smoothed when the browser scales a 16px icon up. */
          style={{
            imageRendering: 'pixelated',
            maxWidth: 36,
            maxHeight: 36,
            objectFit: 'contain',
          }}
        />
      </span>
      <span className="w-full truncate text-[10px] leading-tight">{family.name}</span>
      <span className={`text-[9px] leading-none ${selected ? 'opacity-80' : 'text-[#808080]'}`}>
        {family.sizes.join(' · ')}
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------- preview

/**
 * What is about to be added, before it is added.
 *
 * Everything here answers one question the old grid could not: which *file* does this tile
 * become in After Effects? The magnified artwork shows what it looks like, the 1:1 copy shows
 * how big it really is (a 16px icon looks identical to a 32px one in a grid that scales both to
 * 36px, and they are very different things in a comp), and the id is the literal comp name the
 * exporter will write — `Icon - Computer3_32x32_4`.
 */
/** The magnified preview's box, in CSS pixels. */
const PREVIEW_BOX = 64

/** Fit artwork into `PREVIEW_BOX` at a whole-number scale, shrinking only when it is too big. */
function magnified(width: number, height: number): React.CSSProperties {
  const scale = Math.floor(PREVIEW_BOX / Math.max(width, height))
  return scale >= 1
    ? { width: width * scale, height: height * scale }
    : { maxWidth: PREVIEW_BOX, maxHeight: PREVIEW_BOX, objectFit: 'contain' }
}

function Preview({
  family,
  variant,
  mode,
  onMode,
  onVariant,
  onAdd,
}: {
  family: IconFamily | null
  variant: IconAsset | null
  mode: DropMode
  onMode: (mode: DropMode) => void
  onVariant: (asset: IconAsset) => void
  onAdd: () => void
}) {
  return (
    <div className="flex w-[186px] shrink-0 flex-col gap-[6px]">
      <div className="win95-sunken flex h-[92px] shrink-0 items-center justify-center gap-3 bg-white p-2">
        {variant === null ? (
          <span className="text-center text-[11px] text-[#808080]">
            Pick an icon to see what gets added
          </span>
        ) : (
          <>
            <img
              src={variant.url}
              alt={variant.id}
              style={{
                imageRendering: 'pixelated',
                // An *integer* scale, never a fractional one. Doubling a 32px icon to 64 keeps
                // every source pixel a clean 2x2 block; scaling it to, say, 1.6x would put pixel
                // boundaries mid-pixel and the artwork would look subtly wrong in a panel whose
                // whole job is showing you exactly what you are getting. Icons already larger
                // than the box shrink to fit instead, since there is no integer scale below 1.
                ...magnified(variant.width, variant.height),
              }}
            />
            <span className="flex flex-col items-center gap-1">
              {/* True pixel size, never scaled: this is the thing that lands in the comp. */}
              <img
                src={variant.url}
                alt=""
                width={variant.width}
                height={variant.height}
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="text-[9px] leading-none text-[#808080]">actual size</span>
            </span>
          </>
        )}
      </div>

      {family && variant && (
        <>
          <div className="text-[11px] leading-tight">
            <div className="font-bold">{family.name}</div>
            <div className="text-[#404040]">from {family.group}</div>
          </div>

          <div className="flex flex-wrap gap-1">
            {family.variants.map((option) => (
              <button
                key={option.id}
                type="button"
                title={`${option.width}×${option.height}, ${option.depth}-bit colour`}
                onClick={() => onVariant(option)}
                className={`cursor-pointer border px-1 text-[10px] leading-[16px] ${
                  option.id === variant.id
                    ? 'border-[#000080] bg-[#000080] text-white'
                    : 'border-[#808080] bg-white text-black'
                }`}
              >
                {option.width}
                {option.depth === 32 ? '⁺' : ''}
              </button>
            ))}
          </div>

          <div
            className="win95-sunken overflow-x-auto bg-white px-1 py-[2px] font-mono text-[10px] whitespace-nowrap"
            title="The comp this becomes in After Effects"
          >
            {variant.id}
          </div>
        </>
      )}

      <div className="mt-auto flex flex-col gap-1">
        <span className="text-[11px] text-[#404040]">Add as:</span>
        {(['icon', 'window'] as const).map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-1 text-[11px]">
            <input
              type="radio"
              name="drop-mode"
              checked={mode === value}
              onChange={() => onMode(value)}
            />
            {value === 'icon' ? 'Desktop icon' : 'Window with this icon'}
          </label>
        ))}
        <Button
          className="mt-1 w-full"
          disabled={variant === null}
          data-tutorial="asset-add"
          onClick={onAdd}
        >
          Add to desktop
        </Button>
      </div>
    </div>
  )
}
