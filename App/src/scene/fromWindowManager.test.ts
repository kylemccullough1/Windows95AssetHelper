import { describe, expect, it } from 'vitest'
import type { WindowState } from '@duckdgoose/win95-ui'

import { SCENE_ICON_KEY, SCENE_TAG_KEY, rectForLayout, sceneWindowsFrom } from './fromWindowManager'

const WORK_AREA = { width: 1000, height: 700 }

function win(overrides: Partial<WindowState> & { id: string }): WindowState {
  return {
    title: overrides.id,
    content: null,
    rect: { x: 10, y: 20, width: 300, height: 200 },
    layout: 'floating',
    minimized: false,
    z: 1,
    ...overrides,
  } as WindowState
}

function sceneWin(overrides: Partial<WindowState> & { id: string }): WindowState {
  return win({
    ...overrides,
    data: { [SCENE_TAG_KEY]: 'true', ...(overrides.data ?? {}) },
  })
}

describe('rectForLayout', () => {
  // Pinned because this mirrors a function inside @duckdgoose/win95-ui that is not exported.
  // If the package's snapping rules change, this is where the drift surfaces.
  const floating = { x: 10, y: 20, width: 300, height: 200 }

  it('returns the floating rect when floating', () => {
    expect(rectForLayout('floating', WORK_AREA, floating)).toEqual(floating)
  })

  it('fills the work area when maximized', () => {
    expect(rectForLayout('maximized', WORK_AREA, floating)).toEqual({
      x: 0, y: 0, width: 1000, height: 700,
    })
  })

  it('halves the work area for left and right, covering it exactly', () => {
    const left = rectForLayout('left', WORK_AREA, floating)
    const right = rectForLayout('right', WORK_AREA, floating)
    expect(left).toEqual({ x: 0, y: 0, width: 500, height: 700 })
    expect(right).toEqual({ x: 500, y: 0, width: 500, height: 700 })
    // No gap and no overlap down the middle, including at an odd width.
    expect(left.width + right.width).toBe(WORK_AREA.width)
    expect(right.x).toBe(left.width)
  })

  it('leaves no gap at an odd work-area width', () => {
    const odd = { width: 1001, height: 700 }
    const left = rectForLayout('left', odd, floating)
    const right = rectForLayout('right', odd, floating)
    expect(left.width + right.width).toBe(odd.width)
    expect(right.x).toBe(left.width)
  })
})

describe('sceneWindowsFrom', () => {
  it('ignores the studio\'s own windows', () => {
    // The asset browser and export panel are real windows in the same manager. Exporting them
    // would put the studio's interface into the comp.
    const windows = [
      win({ id: 'asset-browser' }),
      win({ id: 'export' }),
      sceneWin({ id: 'scene-window-0' }),
    ]
    const result = sceneWindowsFrom(windows, null, WORK_AREA)
    expect(result.map((w) => w.id)).toEqual(['scene-window-0'])
  })

  it('uses the effective rect, not the preserved floating one', () => {
    // The manager keeps the pre-maximise rect so restore works. Exporting it would produce a
    // 300x200 comp for a window filling the screen.
    const maximised = sceneWin({ id: 'w', layout: 'maximized' })
    const [result] = sceneWindowsFrom([maximised], null, WORK_AREA)
    expect(result).toMatchObject({ x: 0, y: 0, width: 1000, height: 700 })
    expect(maximised.rect).toEqual({ x: 10, y: 20, width: 300, height: 200 })
  })

  it('drops minimized windows', () => {
    const windows = [sceneWin({ id: 'a' }), sceneWin({ id: 'b', minimized: true })]
    expect(sceneWindowsFrom(windows, null, WORK_AREA).map((w) => w.id)).toEqual(['a'])
  })

  it('orders back to front by z', () => {
    const windows = [
      sceneWin({ id: 'front', z: 30 }),
      sceneWin({ id: 'back', z: 10 }),
      sceneWin({ id: 'middle', z: 20 }),
    ]
    expect(sceneWindowsFrom(windows, null, WORK_AREA).map((w) => w.id)).toEqual([
      'back', 'middle', 'front',
    ])
  })

  it('marks only the focused window active', () => {
    const windows = [sceneWin({ id: 'a' }), sceneWin({ id: 'b', z: 2 })]
    const result = sceneWindowsFrom(windows, 'b', WORK_AREA)
    expect(result.find((w) => w.id === 'a')?.active).toBe(false)
    expect(result.find((w) => w.id === 'b')?.active).toBe(true)
  })

  it('carries the title-bar icon through, or null when there is none', () => {
    const windows = [
      sceneWin({ id: 'a', data: { [SCENE_TAG_KEY]: 'true', [SCENE_ICON_KEY]: 'Computer3_16x16_4' } }),
      sceneWin({ id: 'b' }),
    ]
    const result = sceneWindowsFrom(windows, null, WORK_AREA)
    expect(result.find((w) => w.id === 'a')?.iconAssetId).toBe('Computer3_16x16_4')
    expect(result.find((w) => w.id === 'b')?.iconAssetId).toBeNull()
  })

  it('rounds geometry to whole pixels', () => {
    // Pixel-art comps: a fractional origin puts a 1px bevel across two pixels in AE.
    const windows = [sceneWin({ id: 'a', rect: { x: 10.4, y: 20.6, width: 300.5, height: 200.5 } })]
    const [result] = sceneWindowsFrom(windows, null, WORK_AREA)
    expect(Number.isInteger(result.x)).toBe(true)
    expect(Number.isInteger(result.y)).toBe(true)
    expect(Number.isInteger(result.width)).toBe(true)
    expect(Number.isInteger(result.height)).toBe(true)
  })
})
