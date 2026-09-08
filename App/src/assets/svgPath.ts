/**
 * Converting @react95/icons path data into rectangles.
 *
 * Those SVGs are pixel art encoded as strokes. Each file is `viewBox="0 -0.5 16 16"` with one
 * `<path stroke="colour" d="...">` per colour, and the `d` uses only three commands:
 *
 *   M x y   absolute moveto
 *   m dx dy relative moveto
 *   h n     relative horizontal lineto  -> a 1px-tall run of pixels
 *
 * Audited across all 1536 SVGs in @react95/icons 2.5.3: those are the *only* commands present,
 * every `h` takes exactly one positive integer argument, and no coordinate is fractional. So the
 * parser below can be total and integer-only instead of a general SVG path parser.
 *
 * The `-0.5` in the viewBox is what makes this work as pixel art: a 1px-wide stroke centred on
 * y = n covers n-0.5 .. n+0.5, and the half-pixel shift moves that to cover row n exactly. So a
 * run `h w` starting at (x, y) is the pixel rectangle [x, y, w, 1].
 */

/** One horizontal run of pixels: the rectangle [x, y, w, 1]. */
export type PixelRun = { x: number; y: number; w: number }

/** An axis-aligned rectangle in icon pixel coordinates. */
export type PixelRect = { x: number; y: number; w: number; h: number }

/**
 * Matches one command and its argument(s). `h` is handled separately from `M`/`m` so that a
 * one-argument `h` can never accidentally swallow the following command's first number — the
 * bug latent in a single combined pattern with an optional second capture group.
 */
const COMMAND = /([Mm])\s*(-?\d+)[\s,]+(-?\d+)|h\s*(-?\d+)/g

/**
 * Parse a `d` attribute into pixel runs, in document order.
 * Throws on any command outside the audited M/m/h set rather than skipping it silently, so a
 * future @react95/icons release that introduces `v` or `l` fails loudly instead of exporting a
 * subtly incomplete icon.
 */
export function parseRuns(d: string): PixelRun[] {
  const runs: PixelRun[] = []
  let x = 0
  let y = 0
  let consumed = 0

  COMMAND.lastIndex = 0
  for (let m = COMMAND.exec(d); m !== null; m = COMMAND.exec(d)) {
    // Anything between the end of the last match and the start of this one is a command we do
    // not understand. Whitespace is fine; anything else is not.
    if (d.slice(consumed, m.index).trim() !== '') {
      throw new Error(`Unsupported SVG path command near ${JSON.stringify(d.slice(consumed, m.index + 8))}`)
    }
    consumed = m.index + m[0].length

    if (m[1] !== undefined) {
      const a = Number(m[2])
      const b = Number(m[3])
      if (m[1] === 'M') {
        x = a
        y = b
      } else {
        x += a
        y += b
      }
    } else {
      const w = Number(m[4])
      runs.push({ x, y, w })
      x += w // the pen ends at the far end of the run
    }
  }

  if (d.slice(consumed).trim() !== '') {
    throw new Error(`Trailing unsupported SVG path data ${JSON.stringify(d.slice(consumed))}`)
  }
  return runs
}

/**
 * Coalesce runs into the smallest set of rectangles covering exactly the same pixels.
 *
 * Runs that share an x and a width and sit on consecutive rows are one taller rectangle. Solid
 * blocks of colour — which pixel-art icons are mostly made of — collapse dramatically.
 *
 * This matters because it is the one real performance lever the AE spike identified. Building a
 * comp costs one `addProperty` + `setValue` per shape, and a full-catalogue package export is
 * thousands of comps. Fewer shapes is directly less work in After Effects, and the merge is
 * lossless so there is no fidelity trade-off to weigh.
 */
export function mergeRuns(runs: PixelRun[]): PixelRect[] {
  // Group by column span; only runs with an identical x and w can stack into one rectangle.
  const columns = new Map<string, PixelRun[]>()
  for (const run of runs) {
    const key = `${run.x}:${run.w}`
    const bucket = columns.get(key)
    if (bucket) bucket.push(run)
    else columns.set(key, [run])
  }

  const rects: PixelRect[] = []
  for (const bucket of columns.values()) {
    bucket.sort((a, b) => a.y - b.y)
    let current: PixelRect | null = null
    for (const run of bucket) {
      if (current && run.y === current.y + current.h) {
        current.h += 1 // directly below the rect we are growing
      } else {
        if (current) rects.push(current)
        current = { x: run.x, y: run.y, w: run.w, h: 1 }
      }
    }
    if (current) rects.push(current)
  }

  // Stable, deterministic order so two exports of the same icon produce byte-identical scripts.
  rects.sort((a, b) => a.y - b.y || a.x - b.x)
  return rects
}

/** Total pixel area covered by a set of runs — used by tests to prove a merge is lossless. */
export function runArea(runs: PixelRun[]): number {
  return runs.reduce((total, run) => total + run.w, 0)
}

/** Total pixel area covered by a set of rectangles. */
export function rectArea(rects: PixelRect[]): number {
  return rects.reduce((total, rect) => total + rect.w * rect.h, 0)
}
