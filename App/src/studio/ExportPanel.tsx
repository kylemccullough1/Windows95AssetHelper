import { useEffect, useState } from 'react'
import { Button, ProgressBar } from '@duckdgoose/win95-ui'

import { downloadBlob, downloadTarget } from '../export/deliver'
import {
  companionBundleFrom,
  packageBundleFrom,
  planPackage,
  sceneScriptFrom,
  type PackageScope,
  type Progress,
} from '../export/run'
import {
  probe,
  startBuild,
  waitForJob,
  type CompanionInfo,
  type JobStatus,
} from '../export/companion'
import { ICON_ASSETS } from '../assets/catalog'
import { sceneAssetIds, type Scene } from '../scene/types'
import { FolderBrowser } from './FolderBrowser'

/**
 * The export panel: build the asset package once, then export scenes that reference it — and,
 * when the local companion is running, do both and hand back a finished `.aep`.
 *
 * There are two delivery routes and they are deliberately both on screen rather than one
 * replacing the other.
 *
 * **Downloads** always work. No install, no permissions, no process to remember to start. The
 * cost is that you finish the job by hand: unzip, File > Scripts > Run Script File, pick a
 * folder, repeat for the scene.
 *
 * **The companion** does the whole thing. You browse to a folder, it builds the package, builds
 * the scene against it, and saves the project there. It is the answer to "just set it up in an
 * After Effects file for me", and it is the only part of the studio that has to run locally.
 *
 * The two stages stay visible in both routes because they are a real distinction the user has to
 * understand — a package is minutes and a scene is instant, and knowing which one you are paying
 * for is what stops the full catalogue being run by accident.
 */

type Props = {
  /** Read on demand: this window stays open while the scene changes underneath it. */
  getScene: () => Scene
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: Progress }
  | { kind: 'building'; job: JobStatus }
  | { kind: 'ready'; message: string }
  | { kind: 'error'; message: string }

export function ExportPanel({ getScene }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [companion, setCompanion] = useState<CompanionInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [browsing, setBrowsing] = useState(false)
  /** Remembered between exports so the second one does not start at My Computer again. */
  const [lastFolder, setLastFolder] = useState<string | null>(null)

  const scene = getScene()
  const used = sceneAssetIds(scene)
  const busy = status.kind === 'loading' || status.kind === 'building'

  // One probe when the panel opens. Not a poll: the companion being started while this window
  // happens to be open is rare enough to spend a button on rather than a timer.
  useEffect(() => {
    let live = true
    void probe().then((info) => {
      if (!live) return
      setCompanion(info)
      setChecking(false)
    })
    return () => {
      live = false
    }
  }, [])

  async function recheck() {
    setChecking(true)
    setCompanion(await probe())
    setChecking(false)
  }

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
      setStatus({ kind: 'error', message: message(error) })
    }
  }

  async function exportScene() {
    try {
      const script = sceneScriptFrom(getScene())
      await downloadTarget.deliver(script)
      setStatus({ kind: 'ready', message: script.instructions })
    } catch (error) {
      setStatus({ kind: 'error', message: message(error) })
    }
  }

  /** The companion route, from the folder the browser just returned. */
  async function setUpInAfterEffects(outputPath: string) {
    setLastFolder(outputPath)
    try {
      const current = getScene()
      setStatus({ kind: 'loading', progress: { done: 0, total: 1, label: 'reading artwork' } })

      const plan = await planPackage({ kind: 'scene', scene: current }, (progress) =>
        setStatus({ kind: 'loading', progress }),
      )
      if (plan.ids.length === 0) {
        setStatus({ kind: 'error', message: 'Nothing to export — place some icons first.' })
        return
      }

      const { spec, bundle } = await companionBundleFrom(plan, current, outputPath, (progress) =>
        setStatus({ kind: 'loading', progress: { ...progress, label: `packing ${progress.label}` } }),
      )

      const id = await startBuild(spec, bundle)
      const finished = await waitForJob(id, (job) => setStatus({ kind: 'building', job }))

      if (finished.state === 'failed') {
        setStatus({
          kind: 'error',
          message: `${finished.error ?? 'The build failed.'}\n\n${finished.log.join('\n')}`,
        })
        return
      }
      setStatus({
        kind: 'ready',
        message:
          `Done. After Effects built:\n\n${finished.projectPath}\n\n` +
          `Its asset package is in the Win95Assets folder beside it — keep the two together.\n\n` +
          finished.log.join('\n'),
      })
    } catch (error) {
      setStatus({ kind: 'error', message: message(error) })
    }
  }

  if (browsing) {
    return (
      <FolderBrowser
        title="Choose a folder for the After Effects project and its asset package."
        initialPath={lastFolder}
        onCancel={() => setBrowsing(false)}
        onChoose={(path) => {
          setBrowsing(false)
          void setUpInAfterEffects(path)
        }}
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-[12px] leading-relaxed">
      <section data-tutorial="export-companion">
        <h2 className="mb-1 font-bold">Set it up for me</h2>
        {checking ? (
          <p className="text-[#404040]">Looking for the local companion…</p>
        ) : companion === null ? (
          <p className="text-[#404040]">
            The local companion is not running, so exports are downloads you run by hand. Start it
            with <code>dotnet run --project Companion/Win95Studio.Companion</code>.{' '}
            <button type="button" className="cursor-pointer underline" onClick={() => void recheck()}>
              Check again
            </button>
          </p>
        ) : !companion.afterEffects.found ? (
          <p className="text-[#800000]">
            The companion is running but could not find After Effects. It looks under{' '}
            <code>C:\Program Files\Adobe</code> for <code>AfterFX.com</code>.
          </p>
        ) : (
          <>
            <p className="mb-2 text-[#404040]">
              Browse to a folder and the companion builds the asset package, the scene, and a
              finished <code>.aep</code> in it — using {companion.afterEffects.version}.
            </p>
            <Button disabled={busy || used.length === 0} onClick={() => setBrowsing(true)}>
              Set up in After Effects…
            </Button>
          </>
        )}
      </section>

      <hr className="border-t border-[#808080]" />

      <section data-tutorial="export-package">
        <h2 className="mb-1 font-bold">1 · Build the asset package</h2>
        <p className="mb-2 text-[#404040]">
          Every asset becomes its own comp inside a standalone <code>Win95Assets.aep</code>. Do
          this once; every scene you export afterwards just references it.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || used.length === 0}
            onClick={() => buildPackage({ kind: 'scene', scene: getScene() }, 'Scene assets')}
          >
            Assets in this scene ({used.length})
          </Button>
          <Button disabled={busy} onClick={() => buildPackage({ kind: 'catalogue' }, 'Full catalogue')}>
            Entire catalogue ({ICON_ASSETS.length})
          </Button>
        </div>
      </section>

      <hr className="border-t border-[#808080]" />

      <section data-tutorial="export-scene">
        <h2 className="mb-1 font-bold">2 · Export this scene</h2>
        <p className="mb-2 text-[#404040]">
          {scene.icons.length} icon{scene.icons.length === 1 ? '' : 's'} and {scene.windows.length}{' '}
          window{scene.windows.length === 1 ? '' : 's'} at {scene.width}×{scene.height}. Layers
          reference the package comps, so nothing is duplicated or flattened.
        </p>
        <Button disabled={busy} onClick={exportScene}>
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

      {status.kind === 'building' && (
        <section>
          <ProgressBar percent={status.job.percent} />
          <p className="mt-1 text-[11px] text-[#404040]">{status.job.step}</p>
        </section>
      )}

      {status.kind === 'ready' && (
        <section className="win95-sunken max-h-[160px] overflow-y-auto bg-white p-2 whitespace-pre-wrap">
          {status.message}
        </section>
      )}

      {status.kind === 'error' && (
        <section className="win95-sunken max-h-[160px] overflow-y-auto bg-white p-2 whitespace-pre-wrap text-[#800000]">
          {status.message}
        </section>
      )}
    </div>
  )
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
