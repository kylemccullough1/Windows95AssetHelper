/**
 * The browser half of the local companion.
 *
 * `deliver.ts` predicted this: `ExportTarget` was written so that "hand the user a .jsx" and
 * "drive After Effects on their machine" are the same interface. This module is the second
 * implementation, plus the two things a download target never needed — a folder browser, because
 * a web page cannot see the user's disk, and a job poller, because building a package takes
 * minutes rather than milliseconds.
 *
 * **Why a backend at all.** Everything up to now stopped one step short of the thing Kyle
 * actually wants, which is an `.aep` in a folder he picked. A browser cannot start After Effects
 * and cannot write outside the download folder, so the last step was always "unzip this, then
 * run that". A small local process can do both, and it is the only piece that has to be local:
 * the studio itself still runs anywhere.
 *
 * **Why not the File System Access API.** `showDirectoryPicker()` would give a real directory
 * handle with no install, and it was the first thing tried on paper. It is Chromium-only, it
 * still cannot launch After Effects, and it would have meant two unrelated code paths for
 * choosing a folder. Since a companion process is needed regardless, it may as well own the
 * filesystem too — one path, one permission model.
 *
 * Everything here degrades: `probe()` returning null is the normal state, not an error, and the
 * export panel simply keeps offering downloads.
 */

/**
 * Where the companion listens.
 *
 * Fixed rather than configurable, and on 127.0.0.1 rather than localhost: a fixed port is what
 * lets the studio find the companion with no setup, and the literal loopback address skips the
 * DNS round trip some Windows configurations add for `localhost` and, more importantly, cannot
 * be pointed anywhere else by a hosts-file entry. Port 5795 is arbitrary — "95" on the end, and
 * far away from Vite's 5173.
 */
export const COMPANION_ORIGIN = 'http://127.0.0.1:5795'

/** How long to wait for the companion to answer a probe before deciding it is not running. */
const PROBE_TIMEOUT_MS = 1200

export type AfterEffectsInfo = {
  found: boolean
  /** Full path to `AfterFX.com`, the console front end that accepts `-r`. */
  path: string | null
  /** The install's display name, e.g. `Adobe After Effects (Beta)`. */
  version: string | null
}

export type CompanionInfo = {
  version: string
  afterEffects: AfterEffectsInfo
}

/** One level of the folder tree, as the browse dialog shows it. */
export type FolderListing = {
  /** Absolute path of the folder being listed, or `null` at the top ("My Computer"). */
  path: string | null
  /** Absolute path one level up, or `null` when already at the top. */
  parent: string | null
  entries: FolderEntry[]
}

export type FolderEntry = {
  name: string
  path: string
  /** True for a drive root, so the dialog can draw a drive icon rather than a folder. */
  drive: boolean
}

/** What the companion is doing, polled while a build runs. */
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed'

export type JobStatus = {
  id: string
  state: JobState
  /** Human-readable current step, e.g. "Building the asset package". */
  step: string
  /** 0..100. The companion reports coarse step progress, not AE's own. */
  percent: number
  /** Set once the job ends. The finished project, or null if it failed. */
  projectPath: string | null
  /** Everything the run logged, newest last. Includes After Effects' own log files. */
  log: string[]
  /** Set when `state` is `failed`. */
  error: string | null
}

/** What the studio asks the companion to build. Paths are absolute and already chosen. */
export type BuildRequest = {
  /** Folder the user browsed to. Everything the job writes goes under here. */
  outputPath: string
  /** File name of the scene project, e.g. `Desktop.aep`. */
  projectFileName: string
  /** Name of the package script inside the bundle. */
  packageScriptName: string
  /** Name of the scene script inside the bundle. */
  sceneScriptName: string
}

class CompanionError extends Error {}

/**
 * Is the companion running, and can it see After Effects?
 *
 * Returns null rather than throwing when it is not there, because "not installed" is the
 * expected answer for most of this app's life and callers should not have to write a try/catch
 * around the normal case. A real failure — the companion answering with garbage — does throw.
 */
export async function probe(): Promise<CompanionInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    const response = await fetch(`${COMPANION_ORIGIN}/api/health`, { signal: controller.signal })
    if (!response.ok) return null
    return (await response.json()) as CompanionInfo
  } catch {
    // A connection refused, a DNS failure and the abort above all mean the same thing here.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** List a folder, or the drive roots when `path` is omitted. */
export async function listFolder(path?: string | null): Promise<FolderListing> {
  const query = path ? `?path=${encodeURIComponent(path)}` : ''
  return request<FolderListing>(`/api/folders${query}`)
}

/** Create a subfolder and return the listing of its parent, so the dialog can show it. */
export async function createFolder(parent: string, name: string): Promise<FolderListing> {
  return request<FolderListing>('/api/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parent, name }),
  })
}

/**
 * Hand the companion a build.
 *
 * The bundle is the same zip the download path produces — scripts plus the PNG artwork — because
 * the alternative was base64 in a JSON body, which would inflate a 7 MB catalogue to 9 MB of
 * string and push the whole thing through a JSON parser twice. Multipart sends the bytes as
 * bytes.
 */
export async function startBuild(spec: BuildRequest, bundle: Blob): Promise<string> {
  const form = new FormData()
  form.append('spec', JSON.stringify(spec))
  form.append('bundle', bundle, 'bundle.zip')
  const started = await request<{ id: string }>('/api/jobs', { method: 'POST', body: form })
  return started.id
}

export async function jobStatus(id: string): Promise<JobStatus> {
  return request<JobStatus>(`/api/jobs/${encodeURIComponent(id)}`)
}

/**
 * Poll a job to completion.
 *
 * Polling rather than server-sent events or a socket: a build reports four or five coarse steps
 * over several minutes, so there is nothing to stream, and a plain GET has no reconnection
 * semantics to get wrong. `onProgress` fires on every poll, including ones where nothing changed,
 * so the UI can show that the companion is still answering.
 */
export async function waitForJob(
  id: string,
  onProgress: (status: JobStatus) => void,
  intervalMs = 1000,
): Promise<JobStatus> {
  for (;;) {
    const status = await jobStatus(id)
    onProgress(status)
    if (status.state === 'succeeded' || status.state === 'failed') return status
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

/**
 * Join path segments the way the companion's OS expects.
 *
 * Forward slashes throughout, including on Windows: ExtendScript's `File` and `Folder` accept
 * them, .NET's `Path` accepts them, and it means no escaping worries when a path is baked into a
 * generated script as a string literal.
 */
export function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter((part) => part !== '')
    .join('/')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${COMPANION_ORIGIN}${path}`, init)
  } catch (cause) {
    throw new CompanionError(
      `The companion at ${COMPANION_ORIGIN} is not answering. Start it with ` +
        '`dotnet run --project Companion/Win95Studio.Companion`.',
      { cause },
    )
  }
  if (!response.ok) {
    // The companion returns ProblemDetails on failure; its `detail` is the useful half.
    const problem = await response.json().catch(() => null)
    const detail =
      problem && typeof problem === 'object' && 'detail' in problem
        ? String((problem as { detail: unknown }).detail)
        : `HTTP ${response.status}`
    throw new CompanionError(detail)
  }
  return (await response.json()) as T
}
