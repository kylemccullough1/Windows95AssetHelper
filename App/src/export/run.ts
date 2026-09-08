/**
 * Orchestrating an export: gather geometry, generate, deliver.
 *
 * This is where the two-stage design Kyle asked for becomes concrete. The package is expensive
 * and rare; the scene is cheap and constant. Keeping the *scope* of the package a parameter —
 * rather than always "everything" — is what makes the expensive half optional, and it is the
 * same generator either way, exactly as research note 04 predicted ("group and single export are
 * the same generator with a filter").
 */

import { ICON_ASSETS, loadIconGeometry, loadIconPng, type IconGeometry } from '../assets/catalog'
import type { Scene } from '../scene/types'
import { sceneAssetIds } from '../scene/types'
import { buildPackageScript, buildSceneScript } from './generate'
import { createZip, type ZipEntry } from './zip'
import type { ExportTarget, GeneratedScript } from './deliver'

/** What goes into the asset package. */
export type PackageScope =
  /** Only the assets this scene actually places. Seconds to build in After Effects. */
  | { kind: 'scene'; scene: Scene }
  /** Every drawable icon in the catalogue. A long build — see the estimate below. */
  | { kind: 'catalogue' }
  /** An explicit list, e.g. a hand-picked set from the browser. */
  | { kind: 'ids'; ids: string[] }

export type Progress = { done: number; total: number; label: string }

function idsFor(scope: PackageScope): string[] {
  if (scope.kind === 'scene') return sceneAssetIds(scope.scene)
  if (scope.kind === 'ids') return scope.ids
  return ICON_ASSETS.map((asset) => asset.id)
}

/**
 * Load geometry for many assets with bounded concurrency.
 *
 * Firing 1517 `fetch`es at once does not go faster — the browser queues them anyway — but it does
 * make progress reporting useless and memory spiky. A small worker pool keeps the connection
 * pool busy while reporting honestly.
 */
async function loadAll(
  ids: string[],
  onProgress?: (p: Progress) => void,
  concurrency = 12,
): Promise<IconGeometry[]> {
  const out: IconGeometry[] = new Array(ids.length)
  let next = 0
  let done = 0

  async function worker() {
    for (;;) {
      const index = next++
      if (index >= ids.length) return
      out[index] = await loadIconGeometry(ids[index])
      done++
      onProgress?.({ done, total: ids.length, label: ids[index] })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker))
  return out
}

/**
 * How fast After Effects builds a package, measured on 27.0x37 via `AfterFX.com -r`.
 *
 * PNG: the whole 1517-asset catalogue built in 174 s — **8.7 comps/second**, copy and import
 * included. Rounded down to 8 for headroom.
 *
 * Shapes, for contrast, are both slower and superlinear: 7,033 shapes took 19.5 s and 21,084
 * took 247 s — 3x the work for 12.7x the time — so no single rate describes it. 300/s is a
 * deliberately optimistic figure used only to show roughly how much worse that route is; a
 * full-catalogue shape build was abandoned unfinished after 27 minutes.
 */
const COMPS_PER_SECOND_PNG = 8
const SHAPES_PER_SECOND = 300

export function estimateSeconds(assetCount: number, shapeCount: number, format: 'png' | 'shapes' = 'png'): number {
  return format === 'png'
    ? Math.round(assetCount / COMPS_PER_SECOND_PNG)
    : Math.round(shapeCount / SHAPES_PER_SECOND)
}

export type PackagePlan = {
  ids: string[]
  geometry: IconGeometry[]
  shapeCount: number
  /** Distinct comps after collapsing byte-identical artwork. Only relevant to the shape route. */
  uniqueCount: number
  /** Seconds After Effects will take, for the default (PNG) format. */
  estimatedSeconds: number
  /** Total bytes of PNG artwork the zip will carry. */
  artworkBytes: number
}

/** Load everything a package needs and report its cost, without generating the script yet. */
export async function planPackage(
  scope: PackageScope,
  onProgress?: (p: Progress) => void,
): Promise<PackagePlan> {
  const ids = idsFor(scope)
  const geometry = await loadAll(ids, onProgress)

  const signatures = new Set<string>()
  let shapeCount = 0
  for (const icon of geometry) {
    // Cheap structural signature; the generator does the authoritative dedup.
    signatures.add(`${icon.asset.width}x${icon.asset.height}:${icon.shapeCount}:${icon.layers.map((l) => l.color).join()}`)
    shapeCount += icon.shapeCount
  }

  return {
    ids,
    geometry,
    shapeCount,
    uniqueCount: signatures.size,
    estimatedSeconds: estimateSeconds(ids.length, shapeCount, 'png'),
    // Approximate: PNG sizes are not known until fetched, and the catalogue averages ~4.5 kB.
    artworkBytes: ids.length * 4500,
  }
}

/**
 * The package as a zip: the generated script plus the PNG artwork it copies.
 *
 * Both halves have to travel together. The script's job is to copy each asset next to the `.aep`
 * and import it, and in the browser there is no filesystem path it could copy *from* — so the
 * artwork ships with it, in an `assets/` folder the script finds via its own `$.fileName`.
 *
 * Unzip anywhere, run the `.jsx`, and the layout works with no paths to configure.
 */
export async function packageBundleFrom(
  plan: PackagePlan,
  onProgress?: (p: Progress) => void,
): Promise<{ fileName: string; blob: Blob; instructions: string }> {
  const entries: ZipEntry[] = [
    {
      name: 'win95-asset-package.jsx',
      // No pngSourceDir: the script resolves `assets/` beside itself at run time.
      data: new TextEncoder().encode(buildPackageScript(plan.geometry)),
    },
  ]

  let done = 0
  for (const icon of plan.geometry) {
    entries.push({
      name: `assets/${icon.asset.id}.png`,
      data: await loadIconPng(icon.asset.id),
    })
    done++
    onProgress?.({ done, total: plan.geometry.length, label: icon.asset.id })
  }

  return {
    fileName: 'win95-asset-package.zip',
    blob: createZip(entries),
    instructions:
      'Unzip this somewhere permanent, keeping win95-asset-package.jsx and the assets folder ' +
      'together. In After Effects: File > Scripts > Run Script File, pick the .jsx, then choose ' +
      'a folder for Win95Assets.aep. Keep that .aep and its assets folder — every scene you ' +
      'export references it.',
  }
}

/** The package script alone, for a caller that already has the artwork on disk. */
export function packageScriptFrom(plan: PackagePlan, pngSourceDir?: string): GeneratedScript {
  return {
    fileName: 'win95-asset-package.jsx',
    source: buildPackageScript(plan.geometry, { pngSourceDir }),
    instructions:
      'In After Effects: File > Scripts > Run Script File, pick this file, then choose a folder ' +
      'to save Win95Assets.aep into. Keep that .aep — every scene you export references it.',
  }
}

export function sceneScriptFrom(scene: Scene): GeneratedScript {
  return {
    fileName: `win95-scene-${slug(scene.name)}.jsx`,
    source: buildSceneScript(scene, { requiredAssetIds: sceneAssetIds(scene) }),
    instructions:
      'In After Effects: File > Scripts > Run Script File. If the asset comps are not in the ' +
      'project yet it will offer to import Win95Assets.aep for you.',
  }
}

export async function deliver(target: ExportTarget, script: GeneratedScript): Promise<void> {
  await target.deliver(script)
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene'
}
