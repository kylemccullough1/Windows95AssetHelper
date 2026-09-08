/**
 * The Windows 95 chrome registry.
 *
 * Note 04's verdict: a typed registry in code is the source of truth for export, and DOM
 * readback (`getComputedStyle`, box-shadow parsing) is how the registry is *populated and
 * verified*, not how export is driven. The reason is that the exporter runs on a scene document
 * — plain data — not on a mounted React tree, so it must be able to draw a window without one
 * existing on screen.
 *
 * Every number here is a Windows 95 / React95 measurement. The bevel structure is the one the
 * AE spike drew and Kyle eyeballed against the real thing: a 2px outset border made of four
 * one-pixel edges in two tones, outer light/dark then inner lighter/darker.
 */

/** The Windows 95 system palette, as React95 renders it. */
export const WIN95_COLORS = {
  /** Standard control face — the grey everything is made of. */
  face: '#c0c0c0',
  /** Brightest bevel highlight. */
  lightest: '#ffffff',
  /** Secondary highlight, the outer top/left edge. */
  light: '#dfdfdf',
  /** Bevel shadow. */
  shadow: '#808080',
  /** Outermost bevel shadow. */
  darkest: '#000000',
  /** Active title bar. */
  titleActive: '#000080',
  /** Inactive title bar. */
  titleInactive: '#808080',
  /** Title bar text. */
  titleText: '#ffffff',
  /** The default desktop teal. */
  desktop: '#008080',
} as const

/** Window chrome geometry, in CSS/comp pixels (they are the same — the studio renders at 1x). */
export const WINDOW_CHROME = {
  /** Total border thickness on each side, before the title bar. */
  borderWidth: 2,
  /** Title bar height, inside the border. */
  titleBarHeight: 18,
  /** Gap between the border and the title bar. */
  titleBarInset: 2,
  /** Title bar icon size and its offset from the window's top-left. */
  iconSize: 16,
  iconOffset: { x: 6, y: 5 },
  /** Left edge of the title text, and its baseline measured from the window top. */
  titleTextX: 26,
  titleBaselineY: 17,
  /** Close button box. */
  button: { width: 14, height: 12, y: 6, rightMargin: 6 },
} as const

/** Type face and size shared by the browser and After Effects. */
export const WIN95_FONT = {
  /**
   * W95FA by Alina Sava (SIL OFL) — an OpenType re-creation of MS Sans Serif as Windows 95
   * rendered it. Research note 07 proved the browser and After Effects lay this out identically
   * to the hundredth of a pixel at 11px, once every inherited Character-panel attribute is
   * reset. That is why title text exports as native, editable AE text rather than a raster.
   */
  family: 'W95FA',
  /** What TextDocument.font expects; read from the OTF name table, not guessed. */
  postScriptName: 'W95FARegular',
  titleSize: 11,
  iconLabelSize: 11,
} as const

/** The Win95 close-button glyph, in the same `M/m/h` run format as the icon set. */
export const CLOSE_GLYPH = 'M0 0h2m4 0h2M1 1h2m2 0h2M2 2h4M3 3h2M2 4h4M1 5h2m2 0h2M0 6h2m4 0h2'

/** A filled rectangle in a chrome comp: [x, y, w, h] plus a colour. */
export type ChromeRect = { x: number; y: number; w: number; h: number; color: string }

/**
 * The rectangles that make up a window's frame at a given size.
 *
 * Kept as a pure function of width/height so the exporter can draw any window the user has
 * resized to, and so a test can assert the output against the DOM without rendering anything.
 */
export function windowFrameRects(width: number, height: number, active = true): ChromeRect[] {
  const c = WIN95_COLORS
  const w = width
  const h = height

  return [
    // Face.
    { x: 0, y: 0, w, h, color: c.face },

    // Outer bevel: light top/left, black bottom/right.
    { x: 0, y: 0, w, h: 1, color: c.light },
    { x: 0, y: 0, w: 1, h, color: c.light },
    { x: 0, y: h - 1, w, h: 1, color: c.darkest },
    { x: w - 1, y: 0, w: 1, h, color: c.darkest },

    // Inner bevel: white top/left, mid-grey bottom/right.
    { x: 1, y: 1, w: w - 2, h: 1, color: c.lightest },
    { x: 1, y: 1, w: 1, h: h - 2, color: c.lightest },
    { x: 1, y: h - 2, w: w - 2, h: 1, color: c.shadow },
    { x: w - 2, y: 1, w: 1, h: h - 2, color: c.shadow },

    // Title bar.
    {
      x: WINDOW_CHROME.borderWidth + WINDOW_CHROME.titleBarInset,
      y: WINDOW_CHROME.borderWidth + WINDOW_CHROME.titleBarInset,
      w: w - 2 * (WINDOW_CHROME.borderWidth + WINDOW_CHROME.titleBarInset),
      h: WINDOW_CHROME.titleBarHeight,
      color: active ? c.titleActive : c.titleInactive,
    },
  ]
}

/** The close button's own bevelled box, positioned against the window's right edge. */
export function closeButtonRects(width: number): { rects: ChromeRect[]; glyph: { x: number; y: number } } {
  const c = WIN95_COLORS
  const b = WINDOW_CHROME.button
  const x = width - b.rightMargin - b.width
  const y = b.y

  return {
    rects: [
      { x, y, w: b.width, h: b.height, color: c.face },
      { x, y, w: b.width, h: 1, color: c.lightest },
      { x, y, w: 1, h: b.height, color: c.lightest },
      { x, y: y + b.height - 1, w: b.width, h: 1, color: c.darkest },
      { x: x + b.width - 1, y, w: 1, h: b.height, color: c.darkest },
      { x: x + 1, y: y + b.height - 2, w: b.width - 2, h: 1, color: c.shadow },
      { x: x + b.width - 2, y: y + 1, w: 1, h: b.height - 2, color: c.shadow },
    ],
    glyph: { x: x + 3, y: y + 2 },
  }
}
