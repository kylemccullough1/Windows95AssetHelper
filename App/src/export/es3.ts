/**
 * Emitting ExtendScript (ES3) source from TypeScript values.
 *
 * After Effects scripting is ES3-era JavaScript, and — critically — **it has no `JSON` object**.
 * ExtendScript never had one natively; scripts that appear to use it were relying on a panel
 * having polyfilled it, and Adobe's 25.x builds removed that accidental global. The usual
 * workaround is to `#include "json2.js"`.
 *
 * We avoid the problem entirely rather than work around it: the exporter is a *code generator*,
 * so scene and asset data is emitted as a JavaScript **object literal** baked into the script
 * (`var SCENE = {...};`). ES3 reads literals natively, there is no parse step, and there is
 * nothing to include. That is the decision recorded in research note 02.
 *
 * Everything here therefore emits ES3-legal syntax only: no trailing commas (ES3 parsers reject
 * them), no template literals, no `let`/`const`, no shorthand properties.
 */

/** Values that can be emitted as an ES3 literal. */
export type Es3Value =
  | string
  | number
  | boolean
  | null
  | readonly Es3Value[]
  | { readonly [key: string]: Es3Value }

/**
 * Quote a string as an ES3 double-quoted literal.
 *
 * Escapes backslash and quote, the C0 control characters, and — deliberately — `<` and `/` are
 * left alone because this output never lands in HTML. U+2028/U+2029 are escaped because they are
 * line terminators to a JavaScript parser but invisible in an editor, which makes them one of the
 * nastiest ways to break a generated file.
 */
export function es3String(value: string): string {
  let out = '"'
  for (const ch of value) {
    const code = ch.codePointAt(0) as number
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f || code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16).padStart(4, '0')}`
    } else if (code > 0xffff) {
      // ExtendScript strings are UCS-2; emit an explicit surrogate pair rather than relying on
      // the file's encoding surviving the round trip through AE's script host.
      const v = code - 0x10000
      const hi = 0xd800 + (v >> 10)
      const lo = 0xdc00 + (v & 0x3ff)
      out += `\\u${hi.toString(16)}\\u${lo.toString(16)}`
    } else if (code > 0x7e) {
      out += `\\u${code.toString(16).padStart(4, '0')}`
    } else {
      out += ch
    }
  }
  return `${out}"`
}

/** Emit a number, rejecting the values ES3 cannot express as a literal. */
export function es3Number(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot emit non-finite number ${value} into an ExtendScript literal`)
  }
  // Avoid exponent notation for the small integers this generator deals in; it is legal ES3 but
  // makes the emitted script far harder to read when debugging inside AE.
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
}

/**
 * Emit any supported value as an ES3 literal.
 * `indent` is the current depth; objects and arrays are pretty-printed so that a human debugging
 * the generated `.jsx` inside After Effects can actually read the embedded data.
 */
export function es3Literal(value: Es3Value, indent = 0): string {
  const pad = '    '.repeat(indent)
  const inner = '    '.repeat(indent + 1)

  if (value === null) return 'null'
  if (typeof value === 'string') return es3String(value)
  if (typeof value === 'number') return es3Number(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    // Arrays of plain numbers stay on one line; they are coordinates and read better compactly.
    if (value.every((v) => typeof v === 'number')) {
      return `[${value.map((v) => es3Number(v as number)).join(', ')}]`
    }
    const items = value.map((v) => `${inner}${es3Literal(v, indent + 1)}`)
    return `[\n${items.join(',\n')}\n${pad}]`
  }

  const entries = Object.entries(value as Record<string, Es3Value>)
  if (entries.length === 0) return '{}'
  const props = entries.map(([key, v]) => `${inner}${es3Key(key)}: ${es3Literal(v, indent + 1)}`)
  return `{\n${props.join(',\n')}\n${pad}}`
}

/**
 * ES3 reserved words are not valid as bare property names, and ES3 has a longer reserved list
 * than modern JavaScript (it includes the "future reserved words"). Quoting anything that is not
 * a plain identifier is simpler and always safe.
 */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
const RESERVED = new Set([
  'break', 'case', 'catch', 'continue', 'default', 'delete', 'do', 'else', 'finally', 'for',
  'function', 'if', 'in', 'instanceof', 'new', 'return', 'switch', 'this', 'throw', 'try',
  'typeof', 'var', 'void', 'while', 'with', 'abstract', 'boolean', 'byte', 'char', 'class',
  'const', 'debugger', 'double', 'enum', 'export', 'extends', 'final', 'float', 'goto',
  'implements', 'import', 'int', 'interface', 'long', 'native', 'package', 'private',
  'protected', 'public', 'short', 'static', 'super', 'synchronized', 'throws', 'transient',
  'volatile', 'null', 'true', 'false',
])

function es3Key(key: string): string {
  return IDENTIFIER.test(key) && !RESERVED.has(key) ? key : es3String(key)
}

/** `var NAME = <literal>;` — the statement that carries generated data into the script. */
export function es3Declaration(name: string, value: Es3Value): string {
  return `var ${name} = ${es3Literal(value)};`
}
