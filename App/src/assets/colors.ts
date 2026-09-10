/**
 * Colour parsing for @react95/icons SVG data.
 *
 * Every `<path>` in those files carries a `stroke` attribute, and an audit of all 1536 SVGs in
 * @react95/icons 2.5.3 shows the value is only ever one of three forms:
 *
 *   - a 3-digit hex  (`#fff`)   4834 occurrences
 *   - a 6-digit hex  (`#c0c000`) 1470 occurrences
 *   - one of exactly nine CSS colour keywords
 *
 * There is no `rgb()`, no 4/8-digit hex, and no alpha anywhere in the set. That closed world is
 * why this parser can be total rather than best-effort.
 *
 * The nine keywords are the VGA 16-colour names minus white/black (which the files always write
 * as `#fff` / `#000`). The AE round-trip spike (Scripts/spike/window-roundtrip.jsx) only mapped
 * six of them — `red`, `green`, `olive`, `maroon` and `purple` were missing, and because the
 * spike's parser did `parseInt(<not hex>, 16)` those would have silently become NaN and exported
 * as **black**. It never showed up because the two icons the spike hard-coded happen to use only
 * the six it knew. Any red icon would have exported wrong.
 */

/** The complete set of colour keywords used by @react95/icons, audited across all 1536 files. */
const NAMED: Record<string, string> = {
  gray: '#808080',
  green: '#008000',
  maroon: '#800000',
  navy: '#000080',
  olive: '#808000',
  purple: '#800080',
  red: '#ff0000',
  silver: '#c0c0c0',
  teal: '#008080',
}

/** An RGB triple in 0..1, which is the form every After Effects colour property takes. */
export type Rgb = readonly [number, number, number]

/**
 * Normalise any stroke value from the icon set to `#rrggbb`.
 * Throws on anything outside the audited world rather than guessing — a silent wrong colour in
 * an exported comp is far more expensive to notice than a failed export.
 */
export function normalizeColor(value: string): string {
  const raw = value.trim().toLowerCase()
  const named = NAMED[raw]
  if (named) return named

  if (raw.startsWith('#')) {
    const hex = raw.slice(1)
    if (hex.length === 3) {
      // #abc -> #aabbcc: each digit is duplicated, not zero-padded.
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    }
    if (hex.length === 6) return `#${hex}`
  }

  throw new Error(
    `Unrecognised SVG colour ${JSON.stringify(value)}. ` +
      `Expected a 3- or 6-digit hex or one of: ${Object.keys(NAMED).join(', ')}.`,
  )
}

/** `#rrggbb` | 3-digit hex | keyword -> [r, g, b] in 0..1 for After Effects. */
export function toRgb(value: string): Rgb {
  const hex = normalizeColor(value).slice(1)
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ]
}

/** The keyword table, exposed so a test can assert it against the real icon set. */
export const NAMED_COLORS: Readonly<Record<string, string>> = NAMED
