/**
 * How a generated script reaches After Effects.
 *
 * Kyle's chosen end state is the local .NET companion from research note 01: the studio POSTs a
 * script, the companion writes it to disk and runs
 * `AfterFX.com -r <path>` so comps simply appear in the already-open After Effects. That is a
 * second project and lands on its own branch.
 *
 * This module is the seam that makes it a drop-in rather than a rewrite. `ExportTarget` is the
 * whole contract between the studio and the delivery mechanism, and everything above it — the
 * generators, the scene model, the UI — is written against the interface, not the transport.
 *
 * `downloadTarget` is the implementation that works today with no companion, no permissions and
 * no install: it hands you a `.jsx` you run with File > Scripts > Run Script File. When the
 * companion exists it becomes `companionTarget`, and the only change elsewhere is which one the
 * studio picks (and a fallback to download when the companion is not answering).
 */

/** A generated ExtendScript file, named and ready to deliver. */
export type GeneratedScript = {
  fileName: string
  source: string
  /** Shown to the user after delivery — what to do next. */
  instructions: string
}

export type ExportTarget = {
  readonly id: string
  readonly label: string
  /** Whether this target can be used right now (the companion may not be running). */
  isAvailable(): Promise<boolean>
  deliver(script: GeneratedScript): Promise<void>
}

/**
 * Save the script as a file download.
 *
 * A Blob URL rather than a `data:` URI because these scripts are large — a full-catalogue package
 * script is megabytes of embedded literal — and `data:` URIs hit length limits and force the
 * whole payload through the URL parser. The object URL is revoked on the next tick; revoking it
 * synchronously would race the download the click just started.
 */
export const downloadTarget: ExportTarget = {
  id: 'download',
  label: 'Download .jsx',

  async isAvailable() {
    return true
  },

  async deliver(script: GeneratedScript) {
    await downloadBlob(new Blob([script.source], { type: 'application/javascript' }), script.fileName)
  },
}

/**
 * Save a Blob as a file download.
 *
 * A Blob URL rather than a `data:` URI because these payloads are large — a full-catalogue
 * package zip is several megabytes — and `data:` URIs hit length limits and force the whole
 * payload through the URL parser. The object URL is revoked on the next tick; revoking it
 * synchronously would race the download the click just started.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
