import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useClippy } from '@react95/clippy'
import { useWindowManager } from '@duckdgoose/win95-ui'

import { adoptClippy, hideClippy } from './agent'
import { ClippyTour } from './ClippyTour'
import { tutorialSteps } from './steps'

/**
 * The studio tutorial: `steps.ts` played by `ClippyTour`, with the strings in it resolved here.
 *
 * The engine deliberately does not know what "openBrowser" or "iconCount" mean — it runs the
 * action and compares the fingerprint before and after. Everything studio-specific is in the two
 * switch statements below, which is also the whole list of things a new step is allowed to
 * depend on.
 *
 * Clearing up is this component's job too. Anything already open when the tour began is the
 * user's work and is left exactly as it was; the windows the tour opened are its own mess. The
 * scene is never touched — an icon the user added during the tutorial is a real icon they placed
 * and deleting it would be the studio throwing away their work to tidy itself up.
 */

export type StudioTourProps = {
  /** Live scene counts, for the steps that wait until something has been added. */
  iconCount: number
  windowCount: number
  openBrowser: () => void
  openExport: () => void
  onFinish: () => void
}

export function StudioTour({
  iconCount,
  windowCount,
  openBrowser,
  openExport,
  onFinish,
}: StudioTourProps) {
  const wm = useWindowManager()
  const wmRef = useRef(wm)
  wmRef.current = wm
  const openBrowserRef = useRef(openBrowser)
  openBrowserRef.current = openBrowser
  const openExportRef = useRef(openExport)
  openExportRef.current = openExport

  /** What was already on screen when the tour began. Captured once, before any step runs. */
  const preexisting = useRef<Set<string> | null>(null)
  if (preexisting.current === null) preexisting.current = new Set(wm.windows.map((w) => w.id))

  const closeTourWindows = useCallback(() => {
    const shell = wmRef.current
    const before = preexisting.current ?? new Set<string>()
    for (const win of shell.windows) if (!before.has(win.id)) shell.close(win.id)
  }, [])

  const runAction = useCallback((action: string) => {
    const shell = wmRef.current
    switch (action) {
      case 'openStartMenu':
        shell.setStartMenuOpen(true)
        break
      case 'closeStartMenu':
        shell.setStartMenuOpen(false)
        break
      case 'openBrowser':
        // Idempotent by id: the window manager focuses an existing window rather than opening a
        // second one, so a step can insist on its window without checking first.
        openBrowserRef.current()
        break
      case 'openExport':
        openExportRef.current()
        break
      case 'closeAll':
        // Only the studio's own panels. Scene windows are content, not chrome.
        shell.close('asset-browser')
        shell.close('export')
        break
    }
  }, [])

  /** A string that changes when the watched thing changes; the engine compares, it does not interpret. */
  const fingerprint = useCallback(
    (watch: string): string => {
      switch (watch) {
        case 'startMenuOpen':
          return String(wm.startMenuOpen)
        case 'browserOpen':
          return String(wm.isOpen('asset-browser'))
        case 'exportOpen':
          return String(wm.isOpen('export'))
        case 'iconCount':
          return String(iconCount)
        case 'windowCount':
          return String(windowCount)
        default:
          return ''
      }
    },
    [wm, iconCount, windowCount],
  )

  const finish = useCallback(() => {
    closeTourWindows()
    onFinish()
  }, [closeTourWindows, onFinish])

  // Escape is the same as Skip, clear-up included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  return (
    <ClippyTour
      steps={tutorialSteps}
      runAction={runAction}
      fingerprint={fingerprint}
      onFinish={finish}
    />
  )
}

/**
 * Owns Clippy while no tutorial is running: the moment the agent finishes loading it is moved
 * into the desktop and hidden.
 *
 * `ClippyProvider` shows him on load — bottom-right of the browser *window*, idling forever,
 * outside the desktop element and therefore over the taskbar. He belongs to the tour and nothing
 * else, so he is adopted and put away immediately.
 *
 * A layout effect rather than a plain effect so the hide happens before the browser paints the
 * frame he would otherwise flash into view in. Mount this before `StudioTour` so that, when both
 * react to the agent arriving in the same commit, the tour's show wins.
 */
export function ClippyHost() {
  const { clippy } = useClippy()
  const { desktopRef } = useWindowManager()

  useLayoutEffect(() => {
    if (!clippy) return
    const desktop = desktopRef.current
    if (desktop) adoptClippy(clippy, desktop)
    hideClippy(clippy)
  }, [clippy, desktopRef])

  return null
}
