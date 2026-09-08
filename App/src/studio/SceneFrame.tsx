/**
 * The comp boundary overlay.
 *
 * When the comp size is "fit to desktop" the export is WYSIWYG and there is nothing to show. When
 * a fixed preset is chosen — 1920×1080, say — the desktop is a different shape from the comp, and
 * without a visible boundary there is no way to tell which of your icons will actually be in
 * frame. Everything outside this outline is composed but will not appear in After Effects.
 *
 * `pointer-events: none` throughout: this is an annotation over the desktop, and it must never
 * intercept a click meant for an icon or a window beneath it.
 */

type Props = {
  width: number
  height: number
  /** False when the comp is the desktop, in which case an outline would just be a border. */
  showOutline: boolean
}

export function SceneFrame({ width, height, showOutline }: Props) {
  if (!showOutline || width <= 0 || height <= 0) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: 'none',
        // A dashed white outline reads on the teal desktop without hiding what is under it, and
        // the shadow keeps it legible over a light-coloured window too.
        outline: '1px dashed rgba(255,255,255,0.85)',
        outlineOffset: -1,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
        zIndex: 5,
      }}
    >
      <span
        style={{
          position: 'absolute',
          right: 2,
          bottom: 2,
          padding: '0 4px',
          background: 'rgba(0,0,0,0.55)',
          color: '#ffffff',
          fontSize: 10,
          lineHeight: '14px',
          whiteSpace: 'nowrap',
        }}
      >
        comp {width} × {height}
      </span>
    </div>
  )
}
