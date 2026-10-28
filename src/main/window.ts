import { BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { BrowserWindowConstructorOptions, Point, Tray } from 'electron'
import type { UiTheme } from '../shared/types'
import { lastClickPoint } from './cursor-tracker'

export const PANEL_WIDTH = 380
export const PANEL_MIN_HEIGHT = 180
export const PANEL_MAX_HEIGHT = 640

const ANCHOR_GAP = 6

interface Anchor {
  point: Point
  /** Height of the clicked item (tray icon), 0 when only the cursor is known. */
  itemHeight: number
  showBelow: boolean
}

let anchor: Anchor | null = null

export function createPanelWindow(theme: UiTheme): BrowserWindow {
  // The macOS look uses the system acrylic material: the window stays opaque so
  // DWM can blur the desktop behind it and round its corners. The Windows look
  // paints its own opaque panel, which needs a transparent window instead.
  const glass = theme === 'macos'

  const options: BrowserWindowConstructorOptions = {
    width: PANEL_WIDTH,
    height: 460,
    show: false,
    frame: false,
    transparent: !glass,
    backgroundColor: '#00000000',
    // Kept resizable so setSize works without restyling the window (that flash
    // was visible). Manual resizes are blocked in the will-resize handler.
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: glass,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  }

  if (glass) options.backgroundMaterial = 'acrylic'

  const win = new BrowserWindow(options)

  win.setAlwaysOnTop(true, 'floating')
  win.setMenuBarVisibility(false)
  win.on('will-resize', (event) => event.preventDefault())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** How far the reported tray bounds may sit from the click before we distrust them. */
const BOUNDS_TRUST_DISTANCE = 140

/**
 * Anchors the panel to the tray icon so it hangs off the bar the icon lives in
 * (a top menu bar drops it down, a bottom taskbar opens it upwards).
 *
 * Bars like MyDockFinder render their own copy of a tray icon, so the real icon
 * can live somewhere else entirely (e.g. the hidden Windows notification area).
 * We only trust `tray.getBounds()` when it agrees with where the click happened.
 */
export function positionPanelForTray(win: BrowserWindow, tray: Tray): void {
  const cursor = lastClickPoint()
  const bounds = tray.getBounds()
  const usable = bounds.width > 0 && bounds.height > 0 && isOnScreen(bounds)
  const boundsCenterX = Math.round(bounds.x + bounds.width / 2)

  const trustBounds =
    usable &&
    Math.abs(boundsCenterX - cursor.x) <= BOUNDS_TRUST_DISTANCE &&
    Math.abs(bounds.y - cursor.y) <= BOUNDS_TRUST_DISTANCE

  const point = trustBounds ? { x: boundsCenterX, y: bounds.y } : cursor

  anchor = {
    point,
    itemHeight: trustBounds ? bounds.height : 0,
    showBelow: isUpperHalf(point)
  }
  applyPosition(win)
}

/** Anchors at the mouse, used for the global shortcut. */
export function positionPanelAtCursor(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  anchor = { point: cursor, itemHeight: 0, showBelow: isUpperHalf(cursor) }
  applyPosition(win)
}

export function repositionPanel(win: BrowserWindow): void {
  if (!anchor) {
    positionPanelAtCursor(win)
    return
  }
  applyPosition(win)
}

function applyPosition(win: BrowserWindow): void {
  if (!anchor) return
  const { point, itemHeight, showBelow } = anchor
  const { workArea } = screen.getDisplayNearestPoint(point)
  const [width, height] = win.getSize()

  let x = Math.round(point.x - width / 2)
  let y = showBelow
    ? Math.round(point.y + itemHeight + ANCHOR_GAP)
    : Math.round(point.y - height - ANCHOR_GAP)

  if (y + height > workArea.y + workArea.height - 8 && showBelow) {
    y = Math.round(workArea.y + workArea.height - height - 8)
  }

  x = Math.min(Math.max(x, workArea.x + 8), workArea.x + workArea.width - width - 8)
  y = Math.min(Math.max(y, workArea.y + 8), workArea.y + workArea.height - height - 8)

  win.setPosition(x, y, false)
}

function isUpperHalf(point: Point): boolean {
  const { workArea } = screen.getDisplayNearestPoint(point)
  return point.y < workArea.y + workArea.height / 2
}

function isOnScreen(rect: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.bounds
    return (
      rect.x >= x - 4 &&
      rect.y >= y - 4 &&
      rect.x + rect.width <= x + width + 4 &&
      rect.y + rect.height <= y + height + 4
    )
  })
}

export function resizePanelWindow(win: BrowserWindow, contentHeight: number): void {
  const height = Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, Math.ceil(contentHeight)))
  const [, current] = win.getSize()
  if (Math.abs(current - height) < 4) return
  win.setSize(PANEL_WIDTH, height, false)
  if (win.isVisible()) repositionPanel(win)
}
