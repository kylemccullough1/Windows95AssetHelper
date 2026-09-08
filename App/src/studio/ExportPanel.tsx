import { useState } from 'react'
import { Button, ProgressBar } from '@duckdgoose/win95-ui'

import { downloadBlob, downloadTarget } from '../export/deliver'
import {
  packageBundleFrom,
  planPackage,
  sceneScriptFrom,
  type PackageScope,
  type Progress,
} from '../export/run'
import { ICON_ASSETS } from '../assets/catalog'
import { sceneAssetIds, type Scene } from '../scene/types'

/**
 * The export panel: build the asset package once, then export scenes that reference it.
 *
 * The package downloads as a **zip**, not a bare script, because the script's job is to copy each
 * asset's PNG next to the `.aep` and there is no filesystem path a browser could copy from. The
 * artwork travels with the script and the script finds it via its own location.
 *
 * The two stages are deliberately not symmetric, because the operations are not. A scene export
 * is instant. The full catalogue is 1517 comps and about three minutes in After Effects, so that
 * path reports assets, zip size and a measured time estimate before handing anything over.
 */

type Props = {
  /** Read on demand: this window stays open while the scene changes underneath it. */
  getScene: () => Scene
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: Progress }
  | { kind: 'ready'; message: string }
  | { kind: 'error'; message: string }

export function ExportPanel({ getScene }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const scene = getScene()
  const used = sceneAssetIds(scene)

  async function buildPackage(scope: PackageScope, label: string) {
    try {
      setStatus({ kind: 'loading', progress: { done: 0, total: 1, label: 'starting' } })
      const plan = await planPackage(scope, (progress) => setStatus({ kind: 'loading', progress }))

      if (plan.ids.length === 0) {
        setStatus({ kind: 'error', message: 'Nothing to export — place some icons first.' })
        return
      }

      const bundle = await packageBundleFrom(plan, (progress) =>
        setStatus({ kind: 'loading', progress: { ...progress, label: `packing ${progress.label}` } }),
      )
      await downloadBlob(bundle.blob, bundle.fileName)
      setStatus({
        kind: 'ready',
        message:
          `${label}: ${plan.ids.length} assets, ${formatBytes(bundle.blob.size)} zip, ` +
          `~${formatDuration(plan.estimatedSeconds)} to build in After Effects.\n\n` +
          bundle.instructions,
      })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function exportScene() {
    try {
      const script = sceneScriptFrom(getScene())
      await downloadTarget.deliver(script)
      setStatus({ kind: 'ready', message: script.instructions })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-[12px] leading-relaxed">
      <section>
        <h2 className="mb-1 font-bold">1 · Build the asset package</h2>
        <p className="mb-2 text-[#404040]">
          Every asset becomes its own comp inside a standalone <code>Win95Assets.aep</code>. Do
          this once; every scene you export afterwards just references it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={status.kind === 'loading' || used.length === 0}
            onClick={() => buildPackage({ kind: 'scene', scene: getScene() }, 'Scene assets')}
          >
            Assets in this scene ({used.length})
          </Button>
          <Button
            disabled={status.kind === 'loading'}
            onClick={() => buildPackage({ kind: 'catalogue' }, 'Full catalogue')}
          >
            Entire catalogue ({ICON_ASSETS.length})
          </Button>
        </div>
      </section>

      <hr className="border-t border-[#808080]" />

      <section>
        <h2 className="mb-1 font-bold">2 · Export this scene</h2>
        <p className="mb-2 text-[#404040]">
          {scene.icons.length} icon{scene.icons.length === 1 ? '' : 's'} and {scene.windows.length}{' '}
          window{scene.windows.length === 1 ? '' : 's'} at {scene.width}×{scene.height}. Layers
          reference the package comps, so nothing is duplicated or flattened.
        </p>
        <Button disabled={status.kind === 'loading'} onClick={exportScene}>
          Export scene .jsx
        </Button>
      </section>

      {status.kind === 'loading' && (
        <section>
          {/* React95's ProgressBar prop is `percent`, not `value`. It is polymorphic, so its
              props spread accepts anything and a wrong name typechecks cleanly while rendering
              a bar that never fills. */}
          <ProgressBar percent={Math.round((status.progress.done / status.progress.total) * 100)} />
          <p className="mt-1 text-[11px] text-[#404040]">
            Reading {status.progress.done} of {status.progress.total} — {status.progress.label}
          </p>
        </section>
      )}

      {status.kind === 'ready' && (
        <section className="whitespace-pre-wrap border border-[#808080] bg-white p-2">
          {status.message}
        </section>
      )}

      {status.kind === 'error' && (
        <section className="border border-[#808080] bg-white p-2 text-[#800000]">
          {status.message}
        </section>
      )}

      <p className="mt-auto text-[11px] text-[#404040]">
        Delivery is a file download for now. The local companion that runs{' '}
        <code>AfterFX.com -r</code> for you drops in behind the same interface.
      </p>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} hours`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
