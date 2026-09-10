/**
 * Tests for the pure asset layer.
 *
 * These deliberately run against the **real** @react95/icons package on disk rather than
 * fixtures. The parser's correctness claim is "every one of the 1536 shipped SVGs parses", and a
 * hand-written fixture cannot check that. It also means a package upgrade that changes the icon
 * encoding fails here rather than silently exporting broken comps.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { NAMED_COLORS, normalizeColor, toRgb } from './colors'
import { mergeRuns, parseRuns, rectArea, runArea } from './svgPath'
import { PATHLESS_ICONS, parseIconSvg, type IconAsset } from './catalog'

const SVG_DIR = fileURLToPath(new URL('../../node_modules/@react95/icons/svg', import.meta.url))
const FILES = readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg'))
const read = (file: string) => readFileSync(`${SVG_DIR}/${file}`, 'utf8')
const PATH_ELEMENT = /<path\s+stroke="([^"]*)"\s+d="([^"]*)"\s*\/?>/g

const stubAsset = (id: string): IconAsset => ({
  id,
  name: id,
  width: 16,
  height: 16,
  depth: 4,
  url: '',
})

describe('colors', () => {
  it('expands 3-digit hex by duplicating digits, not zero-padding', () => {
    expect(normalizeColor('#fff')).toBe('#ffffff')
    expect(normalizeColor('#0ff')).toBe('#00ffff')
    expect(normalizeColor('#888')).toBe('#888888')
  })

  it('converts to the 0..1 triples After Effects colour properties take', () => {
    expect(toRgb('#000')).toEqual([0, 0, 0])
    expect(toRgb('#fff')).toEqual([1, 1, 1])
    expect(toRgb('navy')).toEqual([0, 0, 128 / 255])
  })

  it('rejects unknown colours instead of silently producing black', () => {
    // The bug this guards: the AE spike used parseInt(<keyword>, 16), which is NaN, and NaN
    // reaches an AE colour property as 0 -- a red icon would have exported black.
    expect(() => toRgb('rebeccapurple')).toThrow(/Unrecognised SVG colour/)
    expect(() => toRgb('#12345')).toThrow(/Unrecognised SVG colour/)
  })

  it('covers every colour keyword the real icon set uses', () => {
    const used = new Set<string>()
    for (const file of FILES) {
      for (const [, stroke] of read(file).matchAll(PATH_ELEMENT)) {
        if (!stroke.startsWith('#')) used.add(stroke)
      }
    }
    expect(used.size).toBeGreaterThan(0)
    expect([...used].sort()).toEqual(Object.keys(NAMED_COLORS).sort())
  })
})

describe('svg path parsing', () => {
  it('reads absolute and relative movetos and horizontal runs', () => {
    expect(parseRuns('M3 0h3')).toEqual([{ x: 3, y: 0, w: 3 }])
    // The pen ends at the far end of a run, so the following relative m is measured from there.
    expect(parseRuns('M0 0h2m1 1h3')).toEqual([
      { x: 0, y: 0, w: 2 },
      { x: 3, y: 1, w: 3 },
    ])
  })

  it('rejects path commands outside the audited M/m/h set', () => {
    // A future @react95/icons release introducing v or l must fail loudly, not export a
    // silently incomplete icon. The message differs by position -- an unknown command between
    // two understood ones reports the gap, one at the end reports trailing data -- and both are
    // useful when debugging a real file, so the assertion accepts either.
    expect(() => parseRuns('M0 0v5')).toThrow(/unsupported SVG path/i)
    expect(() => parseRuns('M0 0v5h2')).toThrow(/unsupported SVG path/i)
    expect(() => parseRuns('M0 0h2L5 5')).toThrow(/unsupported SVG path/i)
  })

  it('merges consecutive rows into taller rectangles', () => {
    const runs = [
      { x: 0, y: 0, w: 4 },
      { x: 0, y: 1, w: 4 },
      { x: 0, y: 2, w: 4 },
    ]
    expect(mergeRuns(runs)).toEqual([{ x: 0, y: 0, w: 4, h: 3 }])
  })

  it('does not merge rows that are not adjacent or not aligned', () => {
    expect(mergeRuns([{ x: 0, y: 0, w: 4 }, { x: 0, y: 2, w: 4 }])).toHaveLength(2)
    expect(mergeRuns([{ x: 0, y: 0, w: 4 }, { x: 0, y: 1, w: 3 }])).toHaveLength(2)
  })

  it('parses every SVG in the package and merges losslessly', () => {
    let parsed = 0
    let runs = 0
    let rects = 0

    for (const file of FILES) {
      for (const [, , d] of read(file).matchAll(PATH_ELEMENT)) {
        const r = parseRuns(d)
        const m = mergeRuns(r)
        // The merge must cover exactly the same pixels -- this is the whole safety argument for
        // doing it at all.
        expect(rectArea(m), `${file} area changed`).toBe(runArea(r))
        runs += r.length
        rects += m.length
      }
      parsed++
    }

    expect(parsed).toBe(FILES.length)
    expect(runs).toBeGreaterThan(300_000)
    // Merging is the one real lever on export time; if a package upgrade destroys it, notice.
    expect(rects).toBeLessThan(runs * 0.75)
  })
})

describe('catalog', () => {
  it('lists exactly the icons that ship with no geometry', () => {
    // Regenerating this by hand is easy to forget, so the constant is checked against the
    // package on every test run. If @react95/icons fixes or adds a blank icon, this fails and
    // PATHLESS_ICONS must be updated -- rather than blank tiles appearing in the browser.
    const actual = FILES.filter((f) => !read(f).includes('<path')).map((f) => f.replace(/\.svg$/, ''))
    expect([...PATHLESS_ICONS].sort()).toEqual(actual.sort())
  })

  it('builds per-colour geometry for a known icon', () => {
    const geometry = parseIconSvg(stubAsset('Computer3_16x16_4'), read('Computer3_16x16_4.svg'))
    expect(geometry.layers.length).toBe(7)
    expect(geometry.shapeCount).toBeGreaterThan(0)
    // Colours arrive normalised, so the exporter never sees a keyword or a 3-digit hex.
    for (const layer of geometry.layers) {
      expect(layer.color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('drops colour layers that contribute no rectangles', () => {
    const geometry = parseIconSvg(stubAsset('empty'), '<svg><path stroke="red" d=""/></svg>')
    expect(geometry.layers).toHaveLength(0)
    expect(geometry.shapeCount).toBe(0)
  })
})
