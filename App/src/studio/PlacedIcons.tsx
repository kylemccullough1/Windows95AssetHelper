import { useRef, useState } from 'react'

import { findIcon } from '../assets/catalog'
import { WIN95_FONT } from '../assets/chrome'
import type { PlacedIcon } from '../scene/types'

/**
 * Freely placed desktop icons — the layer the asset browser drops into.
 *
 * These are deliberately *not* windows. The window manager owns windows and gives them dragging,
 * snapping, resizing and stacking; icons need none of that, just a position. Reusing the window
 * manager for them would mean fighting its layout rules to get a bare 32px sprite.
 *
 * Dragging uses Pointer Events with `setPointerCapture`. That is what makes a drag survive the
 * pointer leaving the element — without capture, moving faster than React re-renders drops the
 * drag the moment the cursor outruns the 32px icon. It also gives mouse, touch and pen for free,
 * and `capture` means no window-level listeners to add and remove.
 */

type Props = {
  icons: PlacedIcon[]
  selectedId: string | null
  onSelect: (instanceId: string | null) => void
  onMove: (instanceId: string, x: number, y: number) => void
}

export function PlacedIcons({ icons, selectedId, onSelect, onMove }: Props) {
  return (
    <>
      {icons.map((icon) => (
        <PlacedIconSprite
          key={icon.instanceId}
          icon={icon}
          selected={icon.instanceId === selectedId}
          onSelect={onSelect}
          onMove={onMove}
        />
      ))}
    </>
  )
}

function PlacedIconSprite({
  icon,
  selected,
  onSelect,
  onMove,
}: {
  icon: PlacedIcon
  selected: boolean
  onSelect: (id: string | null) => void
  onMove: (id: string, x: number, y: number) => void
}) {
  const asset = findIcon(icon.assetId)
  // Offset from the icon's top-left to the pointer, so the sprite does not jump to centre itself
  // under the cursor on the first move.
  const grab = useRef<{ dx: number; dy: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  if (!asset) return null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={icon.label || asset.name}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        onSelect(icon.instanceId)
        grab.current = { dx: e.clientX - icon.x, dy: e.clientY - icon.y }
        setDragging(true)
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!grab.current) return
        // Round to whole pixels: the scene exports to pixel-art comps, and a fractional position
        // would put a crisp 16px icon on a half-pixel in After Effects.
        onMove(icon.instanceId, Math.round(e.clientX - grab.current.dx), Math.round(e.clientY - grab.current.dy))
      }}
      onPointerUp={(e) => {
        grab.current = null
        setDragging(false)
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') onMove(icon.instanceId, icon.x - step, icon.y)
        else if (e.key === 'ArrowRight') onMove(icon.instanceId, icon.x + step, icon.y)
        else if (e.key === 'ArrowUp') onMove(icon.instanceId, icon.x, icon.y - step)
        else if (e.key === 'ArrowDown') onMove(icon.instanceId, icon.x, icon.y + step)
        else return
        e.preventDefault()
      }}
      style={{
        position: 'absolute',
        left: icon.x,
        top: icon.y,
        width: 76,
        cursor: dragging ? 'grabbing' : 'grab',
        // touch-action none stops the browser claiming the gesture as a scroll before
        // pointermove ever fires.
        touchAction: 'none',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        outline: selected ? '1px dotted #ffffff' : 'none',
      }}
    >
      <img
        src={asset.url}
        alt=""
        draggable={false}
        style={{
          width: asset.width,
          height: asset.height,
          imageRendering: 'pixelated',
        }}
      />
      {icon.label !== '' && (
        <span
          style={{
            fontFamily: `"${WIN95_FONT.family}", "MS Sans Serif", sans-serif`,
            fontSize: WIN95_FONT.iconLabelSize,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
            // Selected desktop icons in Win95 got a navy label background.
            background: selected ? '#000080' : 'transparent',
            padding: '0 2px',
          }}
        >
          {icon.label}
        </span>
      )}
    </div>
  )
}
