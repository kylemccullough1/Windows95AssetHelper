/*
 * PORTED from the duckdgoose portfolio site (personal-new, Api/App/src), where this tour
 * engine was written and debugged against a real @duckdgoose/win95-ui desktop. The studio needs
 * the same thing, so it is copied rather than reinvented; only the import paths changed.
 *
 * The Office Assistant speech balloon.
 *
 * Both copies will drift. When the engine is worth sharing, it belongs in the win95-ui package
 * beside the window manager it already depends on, and both apps delete their copy.
 */

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/** Which edge of the balloon carries the tip, i.e. where Clippy is relative to it. */
export type BalloonSide = 'bottom' | 'top' | 'left' | 'right'

const TIP_W = 24
const TIP_H = 14

/**
 * The tip is drawn once pointing down and rotated for the other sides. It overlaps the balloon
 * body by one pixel so its filled base paints over the border there, which is what makes it
 * read as part of the bubble rather than a triangle stuck to it.
 */
function tipStyle(side: BalloonSide, at: number): CSSProperties {
  switch (side) {
    case 'bottom':
      return { left: at - TIP_W / 2, bottom: -(TIP_H - 1) }
    case 'top':
      return { left: at - TIP_W / 2, top: -(TIP_H - 1), transform: 'rotate(180deg)' }
    case 'left':
      // Rotations happen about the centre of the 24x14 box, so offset for the swapped extents.
      return { left: -(TIP_H + 4), top: at - TIP_H / 2, transform: 'rotate(90deg)' }
    case 'right':
      return { right: -(TIP_H + 4), top: at - TIP_H / 2, transform: 'rotate(-90deg)' }
  }
}

/**
 * The Office Assistant's speech balloon, rebuilt. clippyjs does ship one, but it is appended to
 * <body>, positioned against the browser window, unstyled without the library's CSS, and driven
 * by an animation queue that made it unreliable to update between steps. This one is a plain
 * absolutely-positioned element inside the desktop: yellow, black outline, rounded, with a tip
 * on whichever side Clippy is standing.
 *
 * Reports its rendered size through onSize so the caller can position it precisely.
 */
export function ClippyBalloon({
  left,
  top,
  width,
  side,
  tip,
  animate = true,
  zIndex = 3_000_002,
  onSize,
  children,
}: {
  left: number
  top: number
  width: number
  side: BalloonSide
  /** Distance along the tip's edge, from the balloon's top-left, where the tip sits. */
  tip: number
  /** Glide to a new position (between steps) or jump (following a drag). */
  animate?: boolean
  /** Above everything during a tour; down with the icons when it is only Clippy talking to himself. */
  zIndex?: number
  onSize: (size: { width: number; height: number }) => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => onSize({ width: el.offsetWidth, height: el.offsetHeight })
    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onSize])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Clippy"
      aria-live="polite"
      data-dg="tour-balloon"
      className="absolute text-[12px] leading-[1.45]"
      style={{
        left,
        top,
        width,
        zIndex,
        background: '#ffffcc',
        color: '#000',
        border: '1px solid #000',
        borderRadius: 10,
        padding: '10px 12px 8px',
        boxShadow: '2px 2px 0 rgba(0,0,0,0.35)',
        transition: animate ? 'left 300ms ease, top 300ms ease' : 'none',
      }}
    >
      {children}
      <svg
        aria-hidden
        width={TIP_W}
        height={TIP_H}
        viewBox={`0 0 ${TIP_W} ${TIP_H}`}
        className="absolute"
        style={{ overflow: 'visible', ...tipStyle(side, tip) }}
      >
        <polygon points={`0,0 ${TIP_W},0 9,${TIP_H}`} fill="#ffffcc" />
        <path d={`M0 0 L9 ${TIP_H} L${TIP_W} 0`} fill="none" stroke="#000" strokeWidth="1" />
      </svg>
    </div>
  )
}
