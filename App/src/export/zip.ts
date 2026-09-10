/**
 * A minimal ZIP writer.
 *
 * The browser export has to hand over a script *and* the PNG artwork it copies, as one file. A
 * zip is the only container every OS opens without asking, and this is small enough not to
 * warrant a dependency: every entry is **stored**, not deflated, so there is no compressor here
 * at all. That costs nothing in practice — PNG is already deflate-compressed, so re-compressing
 * it saves single-digit percentages for a large amount of code.
 *
 * Format per PKWARE's APPNOTE: a local header + data per entry, then a central directory
 * repeating the headers, then an end-of-central-directory record pointing at it.
 *
 * Zip64 is not implemented, which caps this at 4 GB and 65,535 entries. The full icon catalogue
 * is ~1,500 entries and about 7 MB, so the limit is two orders of magnitude away; `createZip`
 * throws rather than silently emitting a corrupt archive if that ever changes.
 */

export type ZipEntry = {
  /** Path inside the archive. Forward slashes; no leading slash. */
  name: string
  data: Uint8Array
}

const MAX_ENTRIES = 0xffff

/** CRC-32 (IEEE), which the zip format requires for every entry. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** MS-DOS date/time, which is what the zip header stores. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2)),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

class Writer {
  private parts: Uint8Array[] = []
  length = 0

  push(bytes: Uint8Array) {
    this.parts.push(bytes)
    this.length += bytes.length
  }

  header(fields: [number, number][]) {
    // Each pair is [byteWidth, value]; zip is little-endian throughout.
    const size = fields.reduce((total, [width]) => total + width, 0)
    const out = new Uint8Array(size)
    let offset = 0
    for (const [width, value] of fields) {
      for (let i = 0; i < width; i++) out[offset + i] = (value >>> (8 * i)) & 0xff
      offset += width
    }
    this.push(out)
  }

  toBlob(type: string): Blob {
    return new Blob(this.parts as BlobPart[], { type })
  }
}

/** Build a zip archive from entries, all stored uncompressed. */
export function createZip(entries: ZipEntry[], now = new Date()): Blob {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`Zip64 is not implemented: ${entries.length} entries exceeds ${MAX_ENTRIES}`)
  }

  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(now)
  const writer = new Writer()
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = []

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const offset = writer.length

    writer.header([
      [4, 0x04034b50], // local file header signature
      [2, 20], // version needed (2.0)
      [2, 0], // flags
      [2, 0], // method 0 = stored
      [2, time],
      [2, date],
      [4, crc],
      [4, entry.data.length], // compressed size == uncompressed, stored
      [4, entry.data.length],
      [2, name.length],
      [2, 0], // extra field length
    ])
    writer.push(name)
    writer.push(entry.data)

    central.push({ name, crc, size: entry.data.length, offset })
  }

  const centralStart = writer.length
  for (const item of central) {
    writer.header([
      [4, 0x02014b50], // central directory header signature
      [2, 20], // version made by
      [2, 20], // version needed
      [2, 0],
      [2, 0],
      [2, time],
      [2, date],
      [4, item.crc],
      [4, item.size],
      [4, item.size],
      [2, item.name.length],
      [2, 0], // extra
      [2, 0], // comment
      [2, 0], // disk number
      [2, 0], // internal attrs
      [4, 0], // external attrs
      [4, item.offset],
    ])
    writer.push(item.name)
  }

  const centralSize = writer.length - centralStart
  writer.header([
    [4, 0x06054b50], // end of central directory
    [2, 0], // this disk
    [2, 0], // disk with central directory
    [2, central.length],
    [2, central.length],
    [4, centralSize],
    [4, centralStart],
    [2, 0], // comment length
  ])

  return writer.toBlob('application/zip')
}
