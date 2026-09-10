/**
 * Grouping the flat catalogue into something browsable.
 *
 * `ICON_ASSETS` is 1517 rows because @react95/icons names every *variant* of every icon as its
 * own file: `Computer3_16x16_4`, `Computer3_32x32_4`, `Computer3_32x32_8`. A flat grid of those
 * reads as "the same icon over and over" and hides how much is actually in the set, which is
 * exactly the complaint the first browser drew. Two derived views fix it:
 *
 *   FAMILY  one entry per artwork — `Computer3` — carrying every size/depth it ships in.
 *           975 of them. This is the unit a person is actually shopping for.
 *   GROUP   the Windows 95 component the artwork came from — `Shell`, `Progman`, `Mmsys` —
 *           recovered by stripping the trailing resource number off the family name.
 *
 * The group split is not cosmetic. @react95/icons is a dump of the icon resources out of the
 * Windows 95 DLLs, and the names still carry their origin: `Shell32` icons are the shell's
 * (folders, drives, the recycle bin), `Progman` is Program Manager, `Mmsys` is the multimedia
 * control panel, `Inetcpl` the internet one. Filtering by group is therefore "show me the
 * networking icons" without anyone hand-tagging 975 files.
 *
 * Both functions are pure and take the asset list as an argument so `families.test.ts` can run
 * them over stubs; the module-level constants below are the real catalogue, built once.
 */

import { ICON_ASSETS, type IconAsset } from './catalog'

/** One artwork, with every size and colour depth the package ships it in. */
export type IconFamily = {
  /** The family name and the id stem shared by every variant, e.g. `Computer3`. */
  name: string
  /** Origin component, e.g. `Shell` for `Shell32`. See the module note. */
  group: string
  /** Every variant, ascending by width then depth. Never empty. */
  variants: IconAsset[]
  /** Distinct pixel widths, ascending — what the grid tile's size badge shows. */
  sizes: number[]
  /** The variant to show in the grid. See `pickPreview`. */
  preview: IconAsset
}

/** A group and how many families it holds, for the source filter. */
export type IconGroup = { name: string; count: number }

/**
 * `Shell32` -> `Shell`, `Awfxex32113` -> `Awfxex`, `Computer3` -> `Computer`.
 *
 * Trailing digits are a resource number, not part of the component's name, so they come off.
 * A name that is *all* digits keeps itself rather than becoming an empty group.
 */
export function groupNameOf(family: string): string {
  const stripped = family.replace(/\d+$/, '')
  return stripped === '' ? family : stripped
}

/**
 * The variant a family shows in the grid.
 *
 * 32px is the desktop icon size and the one most families ship, so it wins. Otherwise the
 * largest variant at or below 48px — big enough to read, small enough not to be a banner (the
 * set contains a 256x96 and a 128x128). Failing both, the largest there is. Depth is a
 * tie-break: a higher depth is the richer artwork of the same picture.
 */
export function pickPreview(variants: IconAsset[]): IconAsset {
  const byDepth = (a: IconAsset, b: IconAsset) => b.depth - a.depth
  const at32 = variants.filter((v) => v.width === 32).sort(byDepth)
  if (at32.length > 0) return at32[0]

  const small = variants.filter((v) => v.width <= 48)
  const pool = small.length > 0 ? small : variants
  return [...pool].sort((a, b) => b.width - a.width || byDepth(a, b))[0]
}

/** Collapse a flat variant list into families, sorted by name. Pure. */
export function groupIntoFamilies(assets: readonly IconAsset[]): IconFamily[] {
  const byName = new Map<string, IconAsset[]>()
  for (const asset of assets) {
    const bucket = byName.get(asset.name)
    if (bucket) bucket.push(asset)
    else byName.set(asset.name, [asset])
  }

  const families: IconFamily[] = []
  for (const [name, unsorted] of byName) {
    const variants = [...unsorted].sort((a, b) => a.width - b.width || a.depth - b.depth)
    families.push({
      name,
      group: groupNameOf(name),
      variants,
      sizes: [...new Set(variants.map((v) => v.width))],
      preview: pickPreview(variants),
    })
  }
  return families.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Groups with at least `minMembers` families, largest first, then everything else folded into
 * one `Other` entry.
 *
 * Without the fold the filter has 354 options, 250 of which hold a single family — a list that
 * is worse than no list. The threshold keeps the ones that mean something and stops the rest
 * from burying them.
 */
export function groupsOf(families: readonly IconFamily[], minMembers = 3): IconGroup[] {
  const counts = new Map<string, number>()
  for (const family of families) counts.set(family.group, (counts.get(family.group) ?? 0) + 1)

  const named: IconGroup[] = []
  let other = 0
  for (const [name, count] of counts) {
    if (count >= minMembers) named.push({ name, count })
    else other += count
  }
  named.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return other > 0 ? [...named, { name: OTHER_GROUP, count: other }] : named
}

/** The bucket every group too small to list on its own falls into. */
export const OTHER_GROUP = 'Other'

/** True when `family` belongs to `group`, honouring the `Other` fold. */
export function inGroup(family: IconFamily, group: string, listed: ReadonlySet<string>): boolean {
  return group === OTHER_GROUP ? !listed.has(family.group) : family.group === group
}

/** The whole catalogue as families. 975 entries covering all 1517 variants. */
export const ICON_FAMILIES: readonly IconFamily[] = groupIntoFamilies(ICON_ASSETS)

/** Source groups for the browser's filter, largest first. */
export const ICON_GROUPS: readonly IconGroup[] = groupsOf(ICON_FAMILIES)

/** The group names that appear in `ICON_GROUPS` under their own name, for the `Other` test. */
export const LISTED_GROUPS: ReadonlySet<string> = new Set(
  ICON_GROUPS.filter((g) => g.name !== OTHER_GROUP).map((g) => g.name),
)
