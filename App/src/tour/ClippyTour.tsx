/*
 * PORTED from the duckdgoose portfolio site (personal-new, Api/App/src), where this tour
 * engine was written and debugged against a real @duckdgoose/win95-ui desktop. The studio needs
 * the same thing, so it is copied rather than reinvented; only the import paths changed.
 *
 * The tour engine: plays a list of steps, spotlights their targets, stands Clippy next to them.
 *
 * Both copies will drift. When the engine is worth sharing, it belongs in the win95-ui package
 * beside the window manager it already depends on, and both apps delete their copy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClippy } from '@react95/clippy'
import { Button, useWindowManager } from '@duckdgoose/win95-ui'
import { HIGHLIGHT_COLORS, type TourStep } from './steps'
import {
  CLIPPY_FRAME,
  adoptClippy,
  clippyElement,
  hideClippy,
  placeClippy,
  playClippy,
  restClippy,
  setClippyInteractive,
  setClippyLayer,
  showClippy,
  wakeClippy,
  type ClippyPlacement,
} from './agent'
import { ClippyBalloon, type BalloonSide } from './ClippyBalloon'
import { TourVignette, type Hole } from './TourVignette'

type Box = { left: number; top: number; width: number; height: number }
type Size = { width: number; height: number }
/** A target plus the stacking level of the window it lives in. */
type Measured = { box: Box; z: number }

/** Keep everything this far from the edge of the work area. */
const MARGIN = 12
/** Space between Clippy and the thing he is pointing at. */
const GAP = 24
/** Length of the balloon's tip; the balloon sits this far off Clippy. */
const TIP = 14
const BALLOON_WIDTH = 360
/** Transitions stay on this long after a step changes, then go off so a dragged target is followed exactly. */
const GLIDE_MS = 450
/** No pointer or key activity for this long and Clippy sits down. */
const REST_AFTER_MS = 60_000
/** The top of a window: title bar and its three buttons. Nothing of ours may sit on it. */
const TITLE_STRIP = 26
/** How much clear space the spotlight leaves around a target. */
const HOLE_PAD = 10

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * Where a data-tutorial target sits, relative to the desktop, and how high it stacks.
 *
 * The z matters because a highlight drawn on top of everything is a lie the moment two windows
 * are involved: the outline of the window underneath would float over the window in front of
 * it. So the ring is drawn at the same level as the window that owns the target, and the tour
 * elements come after the window layer in the DOM, which is what puts the ring above its own
 * window and below anything stacked higher.
 */
function measure(key: string, desktop: HTMLElement | null): Measured | null {
  const el = document.querySelector<HTMLElement>(`[data-tutorial="${key}"]`)
  if (!el || !desktop) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  const d = desktop.getBoundingClientRect()
  let z = 0
  for (let node: HTMLElement | null = el; node && node !== desktop; node = node.parentElement) {
    const value = Number.parseInt(getComputedStyle(node).zIndex, 10)
    if (Number.isFinite(value)) {
      z = value
      break
    }
  }
  return { box: { left: r.left - d.left, top: r.top - d.top, width: r.width, height: r.height }, z }
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height)

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top))

const intersects = (a: Box, b: Box, pad = 8) =>
  a.left < b.left + b.width + pad &&
  a.left + a.width + pad > b.left &&
  a.top < b.top + b.height + pad &&
  a.top + a.height + pad > b.top

function union(a: Box, b: Box): Box {
  const left = Math.min(a.left, b.left)
  const top = Math.min(a.top, b.top)
  return {
    left,
    top,
    width: Math.max(a.left + a.width, b.left + b.width) - left,
    height: Math.max(a.top + a.height, b.top + b.height) - top,
  }
}

const pad = (b: Box, by: number): Hole => ({
  left: b.left - by,
  top: b.top - by,
  width: b.width + by * 2,
  height: b.height + by * 2,
})

const clippyBox = (p: ClippyPlacement): Box => ({
  left: p.x,
  top: p.y,
  width: CLIPPY_FRAME.width * p.scale,
  height: CLIPPY_FRAME.height * p.scale,
})

/** How badly a rectangle sits on something: overlap counts, overlap with a title bar counts twenty times. */
function coverPenalty(rect: Box, target: Box): number {
  const strip = { left: target.left, top: target.top, width: target.width, height: TITLE_STRIP }
  return overlapArea(rect, target) + overlapArea(rect, strip) * 20
}

/**
 * Where Clippy stands.
 *
 * Centre steps put him large in the middle. Target steps try beside the target first, then
 * below, then above, and he keeps his own space: any window he would stand on counts against a
 * spot, so as windows are dragged around he is pushed to wherever is still clear. When the
 * screen is genuinely full — one maximized window, or two snapped halves — every spot is bad
 * and the least-bad one wins, which is the only honest answer.
 */
function placeFor(
  mode: 'center' | 'near',
  box: Box | null,
  area: Size,
  obstacles: Box[],
): ClippyPlacement {
  const { width: W, height: H } = area
  if (mode === 'center' || !box) {
    const scale = clamp(H / 300, 1.6, 3)
    const cw = CLIPPY_FRAME.width * scale
    const ch = CLIPPY_FRAME.height * scale
    return { x: (W - cw) / 2, y: clamp(H / 2 - ch / 2 + 40, MARGIN, H - ch - MARGIN), scale }
  }
  const scale = clamp(H / 420, 1.3, 2)
  const cw = CLIPPY_FRAME.width * scale
  const ch = CLIPPY_FRAME.height * scale
  const midX = box.left + box.width / 2 - cw / 2
  const midY = box.top + box.height / 2 - ch / 2
  const candidates = [
    { x: box.left + box.width + GAP, y: midY },
    { x: box.left - GAP - cw, y: midY },
    { x: midX, y: box.top + box.height + GAP },
    { x: midX, y: box.top - GAP - ch },
    // Two fallbacks that are usually clear when the middle of the screen is not.
    { x: W - cw - MARGIN, y: H - ch - MARGIN },
    { x: MARGIN, y: H - ch - MARGIN },
  ]
  const fit = (c: { x: number; y: number }): ClippyPlacement => ({
    x: clamp(c.x, MARGIN, W - cw - MARGIN),
    y: clamp(c.y, MARGIN, H - ch - MARGIN),
    scale,
  })
  let best: ClippyPlacement | null = null
  let bestPenalty = Infinity
  for (const c of candidates) {
    const p = fit(c)
    const rect = clippyBox(p)
    const penalty =
      coverPenalty(rect, box) + obstacles.reduce((sum, o) => sum + overlapArea(rect, o), 0)
    if (penalty === 0) return p
    if (penalty < bestPenalty) {
      best = p
      bestPenalty = penalty
    }
  }
  return best ?? fit(candidates[0])
}

type BalloonPlacement = { left: number; top: number; side: BalloonSide; tip: number }

/** Above Clippy when there is room, else beside, else below, skipping any spot that covers the target. */
function placeBalloon(clippy: Box, size: Size, area: Size, avoid: Box | null): BalloonPlacement {
  const { width: W, height: H } = area
  const { width: bw, height: bh } = size
  const headX = clippy.left + clippy.width * 0.5
  const headY = clippy.top + clippy.height * 0.3
  const candidates: BalloonPlacement[] = []
  if (clippy.top - TIP - bh >= MARGIN) {
    const left = clamp(headX - bw / 2, MARGIN, W - bw - MARGIN)
    candidates.push({ left, top: clippy.top - TIP - bh, side: 'bottom', tip: clamp(headX - left, 24, bw - 24) })
  }
  if (clippy.left + clippy.width + TIP + bw <= W - MARGIN) {
    const top = clamp(headY - 24, MARGIN, H - bh - MARGIN)
    candidates.push({ left: clippy.left + clippy.width + TIP, top, side: 'left', tip: clamp(headY - top, 20, bh - 20) })
  }
  if (clippy.left - TIP - bw >= MARGIN) {
    const top = clamp(headY - 24, MARGIN, H - bh - MARGIN)
    candidates.push({ left: clippy.left - TIP - bw, top, side: 'right', tip: clamp(headY - top, 20, bh - 20) })
  }
  {
    const left = clamp(headX - bw / 2, MARGIN, W - bw - MARGIN)
    const top = Math.min(clippy.top + clippy.height + TIP, H - bh - MARGIN)
    candidates.push({ left, top, side: 'top', tip: clamp(headX - left, 24, bw - 24) })
  }
  if (!avoid) return candidates[0]
  let best = candidates[0]
  let bestPenalty = Infinity
  for (const c of candidates) {
    const rect = { left: c.left, top: c.top, width: bw, height: bh }
    if (!intersects(rect, avoid)) return c
    const penalty = coverPenalty(rect, avoid)
    if (penalty < bestPenalty) {
      best = c
      bestPenalty = penalty
    }
  }
  return best
}

type Layout = { clippy: ClippyPlacement; balloon: BalloonPlacement; holes: Hole[] }

export type ClippyTourProps = {
  steps: TourStep[]
  /** Controlled step index. Omit and the tour keeps its own. */
  index?: number
  onIndexChange?: (index: number) => void
  /** Runs a step's `actions` entries. */
  runAction?: (action: string) => void
  /** Turns a step's `advanceWhen` key into a string that changes when the watched thing changes. */
  fingerprint?: (watch: string) => string
  onFinish: () => void
}

/**
 * Plays a tour: run the step's shell actions, find its targets, spotlight them, stand Clippy
 * next to the first with a speech balloon, and either wait for the visitor to do the thing the
 * step describes or for Next. Skip is always one click away. The steps are data (content/),
 * and what the strings in them mean is the caller's business (runAction, fingerprint).
 */
export function ClippyTour({
  steps,
  index: controlledIndex,
  onIndexChange,
  runAction,
  fingerprint,
  onFinish,
}: ClippyTourProps) {
  const { clippy } = useClippy()
  const wm = useWindowManager()
  const [ownIndex, setOwnIndex] = useState(0)
  const index = clamp(controlledIndex ?? ownIndex, 0, steps.length - 1)
  const step = steps[index]
  const isFirst = index === 0
  const isLast = index === steps.length - 1

  const [measured, setMeasured] = useState<(Measured | null)[]>([])
  const [balloonSize, setBalloonSize] = useState<Size>({ width: BALLOON_WIDTH, height: 140 })
  const [glide, setGlide] = useState(true)
  /** Where the visitor has dragged Clippy for this step, if they have. Cleared on every step. */
  const [dragged, setDragged] = useState<{ x: number; y: number } | null>(null)

  // Timers and the measuring loop need the latest values without re-subscribing.
  const wmRef = useRef(wm)
  wmRef.current = wm
  const runActionRef = useRef(runAction)
  runActionRef.current = runAction
  const fingerprintRef = useRef(fingerprint)
  fingerprintRef.current = fingerprint
  const onIndexChangeRef = useRef(onIndexChange)
  onIndexChangeRef.current = onIndexChange

  const setIndex = useCallback(
    (next: number) => {
      if (controlledIndex === undefined) setOwnIndex(next)
      onIndexChangeRef.current?.(next)
    },
    [controlledIndex],
  )

  const finish = useCallback(() => onFinish(), [onFinish])

  // Guarded by the step it came from: Next and the watcher can both fire for one step (closing
  // the Start menu by pressing Next does exactly that) and must advance once, not twice.
  const advanceFrom = useCallback(
    (from: number) => {
      if (from !== index) return
      if (from >= steps.length - 1) {
        finish()
        return
      }
      setIndex(from + 1)
    },
    [index, steps.length, finish, setIndex],
  )
  const back = () => setIndex(Math.max(0, index - 1))
  const pressedOn = useRef<number | null>(null)

  // Enter the step: run its actions, then, once React has committed them, record what the
  // watched value looks like. Anything different from that later means the visitor did it.
  const baseline = useRef<{ index: number; value: string } | null>(null)
  useEffect(() => {
    if (!step) return
    step.actions?.forEach((a) => runActionRef.current?.(a))
    const t = window.setTimeout(() => {
      const fp = fingerprintRef.current
      if (step.advanceWhen && fp) baseline.current = { index, value: fp(step.advanceWhen) }
    }, 160)
    return () => window.clearTimeout(t)
  }, [step, index])

  const watched = step?.advanceWhen && fingerprint ? fingerprint(step.advanceWhen) : null
  useEffect(() => {
    const base = baseline.current
    if (watched === null || !base || base.index !== index) return
    if (watched !== base.value) advanceFrom(index)
  }, [watched, index, advanceFrom])

  // Glide between steps, then follow instantly: things get dragged, and a transition on every
  // frame of a drag is what made Clippy lag behind the pointer.
  useEffect(() => {
    setGlide(true)
    setDragged(null)
    const t = window.setTimeout(() => setGlide(false), GLIDE_MS)
    return () => window.clearTimeout(t)
  }, [step])

  // Follow the targets every frame.
  useEffect(() => {
    const targets = step?.targets ?? []
    if (targets.length === 0) {
      setMeasured([])
      return
    }
    let raf = 0
    let last: (Measured | null)[] = []
    const tick = () => {
      const desktop = wmRef.current.desktopRef.current
      const next = targets.map((t) => measure(t.key, desktop))
      const changed =
        next.length !== last.length ||
        next.some((m, i) => !sameBox(m?.box ?? null, last[i]?.box ?? null) || m?.z !== last[i]?.z)
      if (changed) {
        last = next
        setMeasured(next)
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [step])

  // Every open window is something Clippy should not stand on. Windows the step is pointing at
  // are not obstacles: he is supposed to be next to those.
  const targetKeys = (step?.targets ?? []).map((t) => t.key)
  const obstacles = useMemo<Box[]>(() => {
    const desktop = wm.desktopRef.current
    if (!desktop) return []
    const d = desktop.getBoundingClientRect()
    return wm.windows
      .filter((w) => !w.minimized && !(w.data?.tutorial && targetKeys.includes(w.data.tutorial)))
      .map((w) => {
        const el = document.querySelector<HTMLElement>(`[data-dg-window="${w.id}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { left: r.left - d.left, top: r.top - d.top, width: r.width, height: r.height }
      })
      .filter((b): b is Box => b !== null)
    // wm.windows changing covers open/close/minimize; the rect read is fresh on every pass.
  }, [wm.windows, wm.desktopRef, targetKeys.join('|')])

  const area = wm.workArea
  const lastLayout = useRef<Layout | null>(null)
  const boxes = measured.map((m) => m?.box ?? null)
  const primary = boxes[0] ?? null
  const layout = useMemo<Layout>(() => {
    const wantsTarget = (step?.targets?.length ?? 0) > 0
    if (wantsTarget && !primary && lastLayout.current) return lastLayout.current
    const auto = placeFor(step?.clippy ?? 'center', primary, area, obstacles)
    // A dragged Clippy stays where he was put for the rest of the step, and everything that
    // hangs off him — the balloon, his spotlight — comes along.
    const placement = dragged ? { ...auto, x: dragged.x, y: dragged.y } : auto
    const cb = clippyBox(placement)
    const balloon = placeBalloon(cb, balloonSize, area, primary)
    const bb = { left: balloon.left, top: balloon.top, ...balloonSize }
    const visible = boxes.filter((b): b is Box => !!b)
    const holes =
      visible.length > 0
        ? [...visible.map((b) => pad(b, HOLE_PAD)), pad(union(cb, bb), HOLE_PAD)]
        : [pad(union(cb, bb), HOLE_PAD)]
    const next = { clippy: placement, balloon, holes }
    lastLayout.current = next
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, JSON.stringify(boxes), area, balloonSize, obstacles, dragged])

  // Clippy: shown for the life of the tour, and handed back untouched when it ends. He is
  // draggable here as well as on the desk — being told where to look is easier to take when
  // you can move the thing doing the telling.
  const placedOnce = useRef(false)
  const areaRef = useRef(area)
  areaRef.current = area
  const scaleRef = useRef(layout.clippy.scale)
  scaleRef.current = layout.clippy.scale

  useEffect(() => {
    if (!clippy) return
    const desktop = wm.desktopRef.current
    if (desktop) adoptClippy(clippy, desktop)
    setClippyInteractive(clippy, true)
    setClippyLayer(clippy, 'tour')
    showClippy(clippy)

    const el = clippyElement(clippy)
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const d = desktop?.getBoundingClientRect()
      if (!d) return
      const grabX = event.clientX - rect.left
      const grabY = event.clientY - rect.top
      const w = CLIPPY_FRAME.width * scaleRef.current
      const h = CLIPPY_FRAME.height * scaleRef.current
      const onMove = (e: PointerEvent) => {
        const { width: W, height: H } = areaRef.current
        setDragged({
          x: clamp(e.clientX - d.left - grabX, 0, Math.max(0, W - w)),
          y: clamp(e.clientY - d.top - grabY, 0, Math.max(0, H - h)),
        })
      }
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }
    el.addEventListener('pointerdown', onDown)

    return () => {
      el.removeEventListener('pointerdown', onDown)
      setClippyInteractive(clippy, false)
      hideClippy(clippy)
      placedOnce.current = false
    }
  }, [clippy, wm.desktopRef])

  const { x: clippyX, y: clippyY, scale: clippyScale } = layout.clippy
  useEffect(() => {
    if (!clippy) return
    placeClippy(clippy, { x: clippyX, y: clippyY, scale: clippyScale }, placedOnce.current && glide)
    placedOnce.current = true
  }, [clippy, clippyX, clippyY, clippyScale, glide])

  useEffect(() => {
    const animation = step?.animation
    if (!clippy || !animation) return
    // A beat after arriving, so the gesture happens where he has landed rather than en route.
    const t = window.setTimeout(() => playClippy(clippy, animation), 250)
    return () => window.clearTimeout(t)
  }, [clippy, step])

  // A minute with no input and he sits down; any input wakes him. Reset on every step.
  useEffect(() => {
    if (!clippy) return
    let timer = 0
    const arm = () => {
      wakeClippy(clippy)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => restClippy(clippy), REST_AFTER_MS)
    }
    arm()
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
      wakeClippy(clippy)
    }
  }, [clippy, index])

  const onBalloonSize = useCallback((s: Size) => {
    setBalloonSize((prev) => (prev.width === s.width && prev.height === s.height ? prev : s))
  }, [])

  if (!step) return null

  const balloonWidth = Math.min(BALLOON_WIDTH, Math.max(200, area.width - 2 * MARGIN))
  const nextLabel = step.nextLabel ?? (isLast ? 'Finish' : 'Next')
  const skipLabel = step.skipLabel ?? 'Skip tour'
  const targets = step.targets ?? []

  return (
    <>
      <TourVignette holes={layout.holes} />

      {measured.map((m, i) => {
        if (!m) return null
        const { box, z } = m
        const color = targets[i]?.color ?? HIGHLIGHT_COLORS[i % HIGHLIGHT_COLORS.length]
        return (
          <div key={targets[i]?.key ?? i}>
            <div
              aria-hidden
              data-dg="tour-highlight"
              className="pointer-events-none absolute rounded-[2px]"
              style={{
                left: box.left - 4,
                top: box.top - 4,
                width: box.width + 8,
                height: box.height + 8,
                // The window's own level, so a window in front covers this outline.
                zIndex: z,
                boxShadow: `0 0 0 2px ${color}, 0 0 0 4px rgba(0,0,0,0.6)`,
              }}
            />
            {box.top >= 44 && (
              <svg
                aria-hidden
                data-dg="tour-arrow"
                className="pointer-events-none absolute animate-bounce"
                width="28"
                height="36"
                viewBox="0 0 28 36"
                style={{
                  left: box.left + box.width / 2 - 14,
                  top: box.top - 44,
                  zIndex: z,
                  filter: 'drop-shadow(1px 1px 0 #000)',
                }}
              >
                <path d="M14 34 L2 18 H9 V2 H19 V18 H26 Z" fill={color} stroke="#000" strokeWidth="2" />
              </svg>
            )}
          </div>
        )
      })}

      <ClippyBalloon
        left={layout.balloon.left}
        top={layout.balloon.top}
        width={balloonWidth}
        side={layout.balloon.side}
        tip={layout.balloon.tip}
        animate={glide}
        onSize={onBalloonSize}
      >
        <p data-dg="tour-say" className="m-0">
          {step.say}
        </p>
        {step.hint && (
          <p data-dg="tour-hint" className="m-0 mt-1 text-[11px] opacity-70">
            {step.hint}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="mr-auto text-[11px] opacity-60">
            {index + 1} / {steps.length}
          </span>
          {!isFirst && (
            <Button className="h-[22px] px-3" onClick={back}>
              Back
            </Button>
          )}
          <Button
            className="h-[22px] px-3"
            onPointerDown={() => (pressedOn.current = index)}
            onClick={() => advanceFrom(pressedOn.current ?? index)}
          >
            {nextLabel}
          </Button>
          {!isLast && (
            <Button className="h-[22px] px-3" onClick={finish}>
              {skipLabel}
            </Button>
          )}
        </div>
      </ClippyBalloon>
    </>
  )
}
