import { screen } from 'electron'
import type { Point } from 'electron'

interface Sample {
  t: number
  point: Point
}

const SAMPLE_INTERVAL = 40
const HISTORY_MS = 1000
const DWELL_WINDOW_MS = 240
const DWELL_RADIUS = 6

let samples: Sample[] = []
let timer: NodeJS.Timeout | null = null

export function startCursorTracking(): void {
  if (timer) return
  samples = []
  timer = setInterval(() => {
    const now = Date.now()
    samples.push({ t: now, point: screen.getCursorScreenPoint() })
    while (samples.length > 0 && now - samples[0].t > HISTORY_MS) samples.shift()
  }, SAMPLE_INTERVAL)
}

export function stopCursorTracking(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  samples = []
}

/**
 * Where the click most likely happened.
 *
 * Icons drawn by bars like MyDockFinder forward their click with a delay, so by
 * the time the handler runs the pointer is usually somewhere else. While the
 * user aims at an icon the pointer stays put, which leaves a stationary cluster
 * in the recent track — the newest such cluster is the click point.
 */
export function lastClickPoint(): Point {
  const now = Date.now()
  const newest = samples[samples.length - 1]
  if (!newest) return screen.getCursorScreenPoint()

  for (let i = samples.length - 1; i >= 0; i--) {
    const sample = samples[i]
    if (now - sample.t > HISTORY_MS) break
    for (let j = i - 1; j >= 0; j--) {
      const previous = samples[j]
      if (sample.t - previous.t > DWELL_WINDOW_MS) break
      if (
        Math.abs(sample.point.x - previous.point.x) <= DWELL_RADIUS &&
        Math.abs(sample.point.y - previous.point.y) <= DWELL_RADIUS
      ) {
        return sample.point
      }
    }
  }

  return newest.point
}
