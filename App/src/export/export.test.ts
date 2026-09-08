/**
 * Tests for the ExtendScript generators.
 *
 * The central risk these address: a generated script that is *syntactically* broken fails inside
 * After Effects with a line number and nothing else, after the user has already switched apps,
 * picked a folder and waited. Catching a stray trailing comma or an unescaped quote here instead
 * is worth a lot.
 *
 * `checkSyntax` parses the emitted source with the host JavaScript engine. That is a stricter
 * test than it looks: ES3 is a subset of modern JavaScript syntax, so anything modern JS rejects
 * ExtendScript rejects too. It does not run the script (there is no AE here), and it cannot catch
 * ES3-specific rules that modern JS *permits* -- notably trailing commas -- so those are asserted
 * separately by pattern.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { parseIconSvg, type IconAsset, type IconGeometry } from '../assets/catalog'
import { emptyScene, sceneAssetIds, type Scene } from '../scene/types'
import { es3Literal, es3String } from './es3'
import { assetCompName, buildPackageScript, buildSceneScript } from './generate'

const SVG_DIR = fileURLToPath(new URL('../../node_modules/@react95/icons/svg', import.meta.url))

function icon(id: string, width = 16, height = 16): IconGeometry {
  const asset: IconAsset = { id, name: id, width, height, depth: 4, url: '' }
  return parseIconSvg(asset, readFileSync(`${SVG_DIR}/${id}.svg`, 'utf8'))
}

/**
 * Parse without executing. Throws a SyntaxError with a position if the source is malformed.
 *
 * ExtendScript preprocessor directives (`#target`, `#include`, `#script`, `#engine`) are consumed
 * by After Effects' script host before the JavaScript engine ever sees them, and they are not
 * JavaScript — a modern parser reads `#target` as a private class field and rejects it. Strip
 * them first so this checks the actual script body.
 */
function checkSyntax(source: string): void {
  const body = source.replace(/^\s*#(target|include|includepath|script|engine|strict)\b.*$/gm, '')
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(body)
}

function demoScene(): Scene {
  const scene = emptyScene('Demo')
  scene.icons = [
    { instanceId: 'i1', assetId: 'Computer3_32x32_4', x: 16, y: 16, label: 'My Computer' },
    { instanceId: 'i2', assetId: 'Notepad2_32x32_4', x: 16, y: 80, label: '' },
  ]
  scene.windows = [
    {
      id: 'w1', title: 'My Computer', iconAssetId: 'Computer3_16x16_4',
      x: 60, y: 50, width: 320, height: 200, z: 1, active: false,
    },
    {
      id: 'w2', title: 'Notepad', iconAssetId: 'Notepad2_16x16_4',
      x: 140, y: 120, width: 280, height: 180, z: 2, active: true,
    },
  ]
  return scene
}

describe('ES3 literal emission', () => {
  it('escapes quotes, backslashes and newlines', () => {
    expect(es3String('a"b')).toBe('"a\\"b"')
    expect(es3String('a\\b')).toBe('"a\\\\b"')
    expect(es3String('a\nb')).toBe('"a\\nb"')
  })

  it('escapes the line separators that are invisible but break a parser', () => {
    // U+2028 and U+2029 terminate a line as far as a JavaScript parser is concerned, while
    // looking like nothing at all in an editor.
    expect(es3String('a\u2028b')).toBe('"a\\u2028b"')
    expect(es3String('a\u2029b')).toBe('"a\\u2029b"')
  })

  it('escapes non-ASCII so the file survives whatever encoding AE reads it as', () => {
    expect(es3String('café')).toBe('"caf\\u00e9"')
    expect(es3String('🙂')).toBe('"\\ud83d\\ude42"')
  })

  it('quotes reserved words used as keys', () => {
    // ES3's reserved list includes future reserved words like `class` and `int`.
    expect(es3Literal({ class: 1, int: 2, ok: 3 })).toContain('"class"')
    expect(es3Literal({ class: 1, int: 2, ok: 3 })).toContain('"int"')
    expect(es3Literal({ class: 1, int: 2, ok: 3 })).toMatch(/\bok:/)
  })

  it('never emits a trailing comma', () => {
    const source = es3Literal({ a: [1, 2, 3], b: { c: 'd' }, e: [{ f: 1 }, { g: 2 }] })
    expect(source).not.toMatch(/,\s*[}\]]/)
  })

  it('refuses non-finite numbers rather than emitting NaN', () => {
    expect(() => es3Literal(Number.NaN)).toThrow(/non-finite/)
    expect(() => es3Literal(Number.POSITIVE_INFINITY)).toThrow(/non-finite/)
  })
})

describe('png package script (the default)', () => {
  const icons = [icon('Computer3_16x16_4'), icon('Notepad2_16x16_4')]
  const script = buildPackageScript(icons, { pngSourceDir: SVG_DIR.replace(/svg$/, 'png') })

  it('is the format used when none is given', () => {
    // png is pixel-exact against the icon set's own artwork where the shape route is not, and
    // is two orders of magnitude faster. Defaulting to it is the whole point.
    expect(script).toContain('png package build')
    // Both formats share one ES3 runtime, so the shape *helpers* are present either way. What
    // distinguishes them is which one the build loop calls.
    expect(script).toContain('buildFootageComp(')
    expect(script).not.toMatch(/buildAssetComp\(icons,/)
  })

  it('is syntactically valid ES3 with no post-ES3 syntax', () => {
    expect(() => checkSyntax(script)).not.toThrow()
    expect(script).not.toMatch(/,\s*[}\]]/)
    expect(script).not.toMatch(/=>/)
    expect(script).not.toMatch(/\bJSON\s*\./)
  })

  it('gives every asset its own comp, with no aliasing', () => {
    for (const one of icons) {
      expect(script).toContain(es3String(assetCompName(one.asset.id)))
      expect(script).toContain(es3String(`${one.asset.id}.png`))
    }
    // Footage import is cheap, so there is no dedup machinery on this path at all.
    expect(script).not.toContain('ALIASES')
  })

  it('copies the artwork beside the .aep rather than referencing node_modules', () => {
    // An .aep pointing into node_modules breaks the moment the repo moves.
    expect(script).toContain('copyAsset')
    expect(script).toContain('"/assets"')
  })

  it('falls back to finding its artwork beside itself when given no source directory', () => {
    // This is the browser path: the studio ships the PNGs in a zip next to the .jsx and has no
    // filesystem path to bake in, so the script resolves its own location instead.
    const selfLocating = buildPackageScript(icons)
    expect(selfLocating).toContain('$.fileName')
    expect(selfLocating).toContain('var PNG_SOURCE = null')
    expect(() => checkSyntax(selfLocating)).not.toThrow()
  })

  it('bakes in an explicit source directory when one is given', () => {
    const pngDir = SVG_DIR.replace(/svg$/, 'png')
    expect(script).toContain(es3String(pngDir))
    expect(script).not.toContain('var PNG_SOURCE = null')
  })
})

describe('shape package script', () => {
  const script = buildPackageScript([icon('Computer3_16x16_4'), icon('Notepad2_16x16_4')], {
    format: 'shapes',
  })

  it('is syntactically valid JavaScript', () => {
    expect(() => checkSyntax(script)).not.toThrow()
  })

  it('contains no trailing commas anywhere', () => {
    expect(script).not.toMatch(/,\s*[}\]]/)
  })

  it('uses no syntax ExtendScript lacks', () => {
    // ES3 has no let/const, no arrow functions, no template literals.
    expect(script).not.toMatch(/\b(let|const)\s+\w+\s*=/)
    expect(script).not.toMatch(/=>/)
    expect(script).not.toMatch(/`/)
  })

  it('does not rely on JSON, which ExtendScript does not have', () => {
    expect(script).not.toMatch(/\bJSON\s*\./)
  })

  it('names one comp per asset', () => {
    expect(script).toContain(es3String(assetCompName('Computer3_16x16_4')))
    expect(script).toContain(es3String(assetCompName('Notepad2_16x16_4')))
  })

  it('collapses byte-identical artwork onto a single comp', () => {
    // MediaCd_32x32_4 and Shell3241_32x32_4 are the same image under two names; the package
    // draws the shapes once and records the other as an alias.
    const both = buildPackageScript([icon('MediaCd_32x32_4', 32, 32), icon('Shell3241_32x32_4', 32, 32)], { format: 'shapes' })
    expect(both).toContain(`n: ${es3String(assetCompName('MediaCd_32x32_4'))}`)
    expect(both).not.toContain(`n: ${es3String(assetCompName('Shell3241_32x32_4'))}`)
  })

  it('aliases map comp name to comp name, so the scene script can resolve them', () => {
    // The bug this guards: aliases keyed by bare asset id look right in the emitted literal but
    // point at something the scene script never searches for, because it resolves comps by
    // name. A scene placing the aliased icon would report a missing asset even though the
    // package had been imported.
    const both = buildPackageScript([icon('MediaCd_32x32_4', 32, 32), icon('Shell3241_32x32_4', 32, 32)], { format: 'shapes' })
    const aliasBlock = both.slice(both.indexOf('var ALIASES ='), both.indexOf('function main'))

    expect(aliasBlock).toContain(es3String(assetCompName('Shell3241_32x32_4')))
    expect(aliasBlock).toContain(es3String(assetCompName('MediaCd_32x32_4')))
    // Both sides carry the "Icon - " prefix; a bare id on either side is the bug.
    for (const [, key, value] of aliasBlock.matchAll(/"([^"]+)":\s*"([^"]+)"/g)) {
      expect(key).toMatch(/^Icon - /)
      expect(value).toMatch(/^Icon - /)
    }
  })

  it('gives every catalogue name its own comp, aliased or not', () => {
    const ids = ['MediaCd_32x32_4', 'Shell3241_32x32_4', 'Computer3_16x16_4']
    const source = buildPackageScript(ids.map((id) => icon(id, 32, 32)), { format: 'shapes' })
    const built = new Set([...source.matchAll(/\bn: "(Icon - [^"]+)"/g)].map((m) => m[1]))
    const aliased = new Set(
      [...source.slice(source.indexOf('var ALIASES =')).matchAll(/"(Icon - [^"]+)":/g)].map((m) => m[1]),
    )
    for (const id of ids) {
      const name = assetCompName(id)
      expect(built.has(name) || aliased.has(name), `${name} has no comp`).toBe(true)
    }
  })
})

describe('scene script', () => {
  const scene = demoScene()
  const script = buildSceneScript(scene, { requiredAssetIds: sceneAssetIds(scene) })

  it('is syntactically valid JavaScript', () => {
    expect(() => checkSyntax(script)).not.toThrow()
  })

  it('contains no trailing commas and no post-ES3 syntax', () => {
    expect(script).not.toMatch(/,\s*[}\]]/)
    expect(script).not.toMatch(/=>/)
    expect(script).not.toMatch(/\bJSON\s*\./)
  })

  it('requires every asset the scene references', () => {
    for (const id of sceneAssetIds(scene)) {
      expect(script).toContain(es3String(assetCompName(id)))
    }
  })

  it('emits windows back to front so the layer stack matches the scene', () => {
    // Layers land on top as they are added, so ascending z produces the right stack with no
    // reordering. Assert the lower-z window appears first in the emitted array.
    const first = script.indexOf('"My Computer"')
    const second = script.indexOf('"Notepad"')
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(second)
  })

  it('draws the active window navy and the inactive one grey', () => {
    // #000080 -> [0, 0, 0.50196...]; #808080 -> [0.50196, 0.50196, 0.50196]
    expect(script).toContain('0.501961')
    expect(script).toMatch(/\[0, 0, 0\.501961\]/)
  })

  it('imports the package as a project, which is what lands it as a folder', () => {
    expect(script).toContain('ImportAsType.PROJECT')
  })

  it('resets text state before setting its own', () => {
    // Research note 07: addText() inherits the Character panel, and Kyle's had All Caps on.
    expect(script).toContain('resetTextDocument')
    expect(script).toContain('FONT_NORMAL_CAPS')
    // Scale is a fraction; setting it to 100 made text 100x too big.
    expect(script).toMatch(/horizontalScale = 1;/)
    expect(script).not.toMatch(/horizontalScale = 100/)
  })

  it('handles a scene with nothing in it', () => {
    const empty = emptyScene('Blank')
    const source = buildSceneScript(empty, { requiredAssetIds: [] })
    expect(() => checkSyntax(source)).not.toThrow()
    expect(source).toContain('var ICONS = []')
    expect(source).toContain('var WINDOWS = []')
  })

  it('survives titles containing quotes and backslashes', () => {
    const tricky = emptyScene('Tricky')
    tricky.windows = [{
      id: 'w', title: 'C:\\WINDOWS "system"', iconAssetId: null,
      x: 0, y: 0, width: 200, height: 120, z: 1, active: true,
    }]
    const source = buildSceneScript(tricky, { requiredAssetIds: [] })
    expect(() => checkSyntax(source)).not.toThrow()
  })
})
