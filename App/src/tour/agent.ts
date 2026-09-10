/*
 * PORTED from the duckdgoose portfolio site (personal-new, Api/App/src), where this tour
 * engine was written and debugged against a real @duckdgoose/win95-ui desktop. The studio needs
 * the same thing, so it is copied rather than reinvented; only the import paths changed.
 *
 * Driving the clippyjs agent inside a desktop rather than a page.
 *
 * Both copies will drift. When the engine is worth sharing, it belongs in the win95-ui package
 * beside the window manager it already depends on, and both apps delete their copy.
 */

import type { useClippy } from '@react95/clippy'

/** The agent object @react95/clippy hands out (a clippyjs Agent), once it has loaded. */
export type ClippyAgent = NonNullable<ReturnType<typeof useClippy>['clippy']>

/** The Clippy sprite sheet draws him at this size; every other size is a CSS scale of it. */
export const CLIPPY_FRAME = { width: 124, height: 93 } as const

/** Above the tour vignette and its balloon, so Clippy is never dimmed or covered. */
export const CLIPPY_Z = 3_000_003

export type ClippyPlacement = { x: number; y: number; scale: number }

/*
 * clippyjs was written for a page, not a desktop inside a page. It appends its element to
 * <body> with position: fixed, clamps every move and drag to window.innerWidth/innerHeight,
 * and re-clamps on window resize. That is exactly why Clippy could be dragged over the bezel
 * and under the taskbar: as far as the library knew, the whole browser window was his desk.
 *
 * The fix is to make the desktop element his parent. Inside a position: relative,
 * overflow: hidden container he physically cannot leave the screen, and his left/top become
 * desktop coordinates, which is what the tours think in anyway. The library's own drag and
 * resize handlers are removed because both still measure against the viewport; placement is
 * ours from here on. He is pointer-transparent during a tour so he never blocks a window, and
 * clickable on the desk (see setClippyInteractive).
 */
type AgentInternals = {
  _el: HTMLElement
  _mouseDownHandle?: (e: MouseEvent) => void
  _resizeHandle?: () => void
}

export const clippyElement = (agent: ClippyAgent): HTMLElement =>
  (agent as unknown as AgentInternals)._el

/** Idempotent: safe to call from more than one component. */
export function adoptClippy(agent: ClippyAgent, desktop: HTMLElement) {
  const internals = agent as unknown as AgentInternals
  const el = internals._el
  if (el.parentElement === desktop) return
  if (internals._mouseDownHandle) el.removeEventListener('mousedown', internals._mouseDownHandle)
  if (internals._resizeHandle) window.removeEventListener('resize', internals._resizeHandle)
  Object.assign(el.style, {
    position: 'absolute',
    zIndex: String(CLIPPY_Z),
    cursor: 'default',
    pointerEvents: 'none',
    // The sprites are pixel art; scaling them up must not blur them.
    imageRendering: 'pixelated',
    transformOrigin: 'top left',
  })
  el.setAttribute('data-dg', 'clippy')
  desktop.appendChild(el)
}

const MOVE_TRANSITION = 'left 400ms ease, top 400ms ease, transform 400ms ease'

/**
 * Put Clippy at desktop coordinates (x, y) at the given scale. `animate` glides him there;
 * pass false for the first placement, and for every frame of following a dragged target,
 * where a transition would only make him trail behind the pointer.
 */
export function placeClippy(agent: ClippyAgent, at: ClippyPlacement, animate: boolean) {
  const el = clippyElement(agent)
  el.style.transition = animate ? MOVE_TRANSITION : 'none'
  el.style.left = `${Math.round(at.x)}px`
  el.style.top = `${Math.round(at.y)}px`
  el.style.transform = `scale(${at.scale})`
}

/** Whether Clippy should catch clicks (the desk shortcut) or let them through (a tour). */
export function setClippyInteractive(agent: ClippyAgent, on: boolean) {
  const el = clippyElement(agent)
  el.style.pointerEvents = on ? 'auto' : 'none'
  el.style.cursor = on ? 'var(--dg-cursor-hand)' : 'var(--dg-cursor-arrow)'
}

/**
 * How high Clippy stacks.
 *
 * On the desk he is a shortcut like any other, so windows pass over him exactly as they pass
 * over the Projects icon: DESK_Z sits with the icons, well below the lowest window. During a
 * tour he is the thing being read, so he goes above everything including the vignette.
 */
export const CLIPPY_DESK_Z = 2

export function setClippyLayer(agent: ClippyAgent, layer: 'desk' | 'tour') {
  clippyElement(agent).style.zIndex = String(layer === 'tour' ? CLIPPY_Z : CLIPPY_DESK_Z)
}

/*
 * Resting. clippyjs has pause() and resume(), but resume() is not idempotent: it starts a new
 * frame loop each time it is called, and two loops mean a double-speed Clippy for ever. So the
 * paused state is tracked here and resume is only ever called once per pause.
 */
const resting = new WeakSet<object>()

/** Visible and animating. The library starts an idle animation as soon as he is shown. */
export function showClippy(agent: ClippyAgent) {
  resting.delete(agent)
  agent.show(true)
}

/** Fully hidden and paused, with no queued animation left to bring him back. */
export function hideClippy(agent: ClippyAgent) {
  resting.delete(agent)
  agent.stop()
  agent.closeBalloon()
  agent.hide(true, () => undefined)
}

/** Interrupt whatever he is doing and play one named animation, then fall back to idling. */
export function playClippy(agent: ClippyAgent, animation: string) {
  wakeClippy(agent)
  agent.stop()
  agent.play(animation)
}

/**
 * Sit still. Plays the single-frame RestPose and freezes the frame loop on it, so no idle
 * animation follows. wakeClippy or playClippy starts him up again.
 */
export function restClippy(agent: ClippyAgent) {
  if (resting.has(agent)) return
  agent.stop()
  agent.play('RestPose', undefined, () => {
    if (resting.has(agent)) return
    resting.add(agent)
    agent.pause()
  })
}

/** Undo restClippy. Safe to call when he is not resting. */
export function wakeClippy(agent: ClippyAgent) {
  if (!resting.has(agent)) return
  resting.delete(agent)
  agent.resume()
}
