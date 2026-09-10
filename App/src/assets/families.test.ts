/**
 * Tests for the browsable views over the catalogue.
 *
 * The grouping functions are pure and tested against stubs, but the last block runs them over
 * the **real** catalogue, because the claim that matters is an arithmetic one: every variant in
 * `ICON_ASSETS` appears in exactly one family. That is what "we have all the assets" means, and
 * it is the thing a filter bug would quietly break.
 */

import { describe, expect, it } from 'vitest'

import { ICON_ASSETS, type IconAsset } from './catalog'
import {
  ICON_FAMILIES,
  ICON_GROUPS,
  LISTED_GROUPS,
  OTHER_GROUP,
  groupIntoFamilies,
  groupNameOf,
  groupsOf,
  inGroup,
  pickPreview,
} from './families'

const asset = (id: string, width: number, depth: number): IconAsset => ({
  id,
  name: id.replace(/_\d+x\d+_\d+$/, ''),
  width,
  height: width,
  depth,
  url: `/${id}.svg`,
})

describe('groupNameOf', () => {
  it('strips the trailing resource number that follows the component name', () => {
    expect(groupNameOf('Shell32')).toBe('Shell')
    expect(groupNameOf('Awfxex32113')).toBe('Awfxex')
    expect(groupNameOf('Computer3')).toBe('Computer')
  })

  it('leaves a name with no trailing digits alone', () => {
    expect(groupNameOf('Folder')).toBe('Folder')
  })

  it('keeps an all-digit name rather than producing an empty group', () => {
    expect(groupNameOf('404')).toBe('404')
  })
})

describe('pickPreview', () => {
  it('prefers 32px, the desktop icon size', () => {
    const variants = [asset('X_16x16_4', 16, 4), asset('X_32x32_4', 32, 4)]
    expect(pickPreview(variants).width).toBe(32)
  })

  it('prefers the richer colour depth at the same size', () => {
    const variants = [asset('X_32x32_4', 32, 4), asset('X_32x32_8', 32, 8)]
    expect(pickPreview(variants).depth).toBe(8)
  })

  it('falls back to the largest variant at or below 48px', () => {
    const variants = [asset('X_16x16_4', 16, 4), asset('X_48x48_8', 48, 8)]
    expect(pickPreview(variants).width).toBe(48)
  })

  it('never picks a banner over a real icon when both exist', () => {
    // The set contains a 256x96 and a 128x128; a grid tile showing one of those is useless.
    const variants = [asset('X_16x16_4', 16, 4), asset('X_256x96_4', 256, 4)]
    expect(pickPreview(variants).width).toBe(16)
  })

  it('takes the banner when it is the only thing there', () => {
    expect(pickPreview([asset('X_256x96_4', 256, 4)]).width).toBe(256)
  })
})

describe('groupIntoFamilies', () => {
  it('collapses every size of one artwork into a single entry', () => {
    const families = groupIntoFamilies([
      asset('Computer3_16x16_4', 16, 4),
      asset('Computer3_32x32_4', 32, 4),
      asset('Folder_32x32_4', 32, 4),
    ])
    expect(families.map((f) => f.name)).toEqual(['Computer3', 'Folder'])
    expect(families[0].variants).toHaveLength(2)
    expect(families[0].sizes).toEqual([16, 32])
  })

  it('sorts variants ascending by size then depth', () => {
    const [family] = groupIntoFamilies([
      asset('X_32x32_8', 32, 8),
      asset('X_16x16_4', 16, 4),
      asset('X_32x32_4', 32, 4),
    ])
    expect(family.variants.map((v) => v.id)).toEqual(['X_16x16_4', 'X_32x32_4', 'X_32x32_8'])
  })
})

describe('groupsOf', () => {
  const families = groupIntoFamilies([
    asset('Shell1_32x32_4', 32, 4),
    asset('Shell2_32x32_4', 32, 4),
    asset('Shell3_32x32_4', 32, 4),
    asset('Lonely_32x32_4', 32, 4),
  ])

  it('lists groups that meet the threshold, largest first', () => {
    expect(groupsOf(families, 3)[0]).toEqual({ name: 'Shell', count: 3 })
  })

  it('folds everything below the threshold into one Other bucket', () => {
    const other = groupsOf(families, 3).find((g) => g.name === OTHER_GROUP)
    expect(other).toEqual({ name: OTHER_GROUP, count: 1 })
  })

  it('omits Other entirely when nothing falls into it', () => {
    expect(groupsOf(families, 1).some((g) => g.name === OTHER_GROUP)).toBe(false)
  })

  it('reaches a family too small to be listed through the Other bucket', () => {
    // 'Lonely' is not offered as a filter option, so Other is the only way to see it. A listed
    // family must not leak into Other as well, or the counts would double up.
    const listed = new Set(['Shell'])
    const lonely = families.find((f) => f.name === 'Lonely')!
    const shell = families.find((f) => f.name === 'Shell1')!
    expect(inGroup(lonely, OTHER_GROUP, listed)).toBe(true)
    expect(inGroup(shell, OTHER_GROUP, listed)).toBe(false)
    expect(inGroup(shell, 'Shell', listed)).toBe(true)
  })
})

describe('the real catalogue', () => {
  it('places every asset in exactly one family', () => {
    const total = ICON_FAMILIES.reduce((sum, family) => sum + family.variants.length, 0)
    expect(total).toBe(ICON_ASSETS.length)
  })

  it('has no family without artwork to show', () => {
    expect(ICON_FAMILIES.every((family) => family.variants.length > 0)).toBe(true)
    expect(ICON_FAMILIES.every((family) => family.preview.url !== '')).toBe(true)
  })

  it('accounts for every family in the group filter, Other included', () => {
    const covered = ICON_FAMILIES.filter((family) =>
      ICON_GROUPS.some((group) => inGroup(family, group.name, LISTED_GROUPS)),
    )
    expect(covered).toHaveLength(ICON_FAMILIES.length)
  })

  it('collapses 1517 variants into a substantially shorter browse list', () => {
    // Not an exact number: a package upgrade is allowed to add icons. The point of the check is
    // that families are fewer than variants, which is the whole reason the grid groups them.
    expect(ICON_FAMILIES.length).toBeLessThan(ICON_ASSETS.length)
    expect(ICON_FAMILIES.length).toBeGreaterThan(500)
  })
})
