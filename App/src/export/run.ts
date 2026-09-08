/**
 * Orchestrating an export: gather geometry, generate, deliver.
 *
 * This is where the two-stage design Kyle asked for becomes concrete. The package is expensive
 * and rare; the scene is cheap and constant. Keeping the *scope* of the package a parameter —
 * rather than always "everything" — is what makes the expensive half optional, and it is the
 * same generator either way, exactly as research note 04 predicted ("group and single export are
 * the same generator with a filter").
 */

import { ICON_ASSETS, loadIconGeometry, type IconGeometry } from '../assets/catalog'
import type { Scene } from '../scene/types'
import { sceneAssetIds } from '../scene/types'
import { buildPackageScript, buildSceneScript } from './generate'
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
 * A rough estimate of how long After Effects will take to build a package.
 *
 * Grounded in the spike, not invented: run 4 built its project in 9.6 s, and the ~250 shapes in
 * it were a small part of that. The dominant per-shape cost is one `addProperty` plus one
 * `setValue`. The rate below is deliberately pessimistic — the point is to warn before a
 * 200,000-shape build, not to predict to the second — and the generated script logs the real
 * `shapes per second` it achieved so this can be replaced with a measured number.
 */
const SHAPES_PER_SECOND = 400

export function estimateSeconds(shapeCount: number): number {
  return Math.round(shapeCount / SHAPES_PER_SECOND)
}

export type PackagePlan = {
  ids: string[]
  geometry: IconGeometry[]
  shapeCount: number
  /** Distinct comps after collapsing byte-identical artwork. */
  uniqueCount: number
  estimatedSeconds: number
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
    estimatedSeconds: estimateSeconds(shapeCount),
  }
}

export function packageScriptFrom(plan: PackagePlan): GeneratedScript {
  return {
    fileName: 'win95-asset-package.jsx',
    source: buildPackageScript(plan.geometry),
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
