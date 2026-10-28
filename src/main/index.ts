import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray
} from 'electron'
import { join } from 'node:path'
import { HAClient } from './ha/client'
import {
  getServerUrl,
  getToken,
  hasToken,
  loadDashboard,
  loadUiSettings,
  saveDashboard,
  saveServerConfig,
  saveUiSettings
} from './config-store'
import {
  createPanelWindow,
  positionPanelAtCursor,
  positionPanelForTray,
  repositionPanel,
  resizePanelWindow
} from './window'
import { startCursorTracking, stopCursorTracking } from './cursor-tracker'
import type {
  ConnectionStatus,
  DashboardConfig,
  SaveConfigInput,
  ServiceCall,
  UiSettings
} from '../shared/types'

let tray: Tray | null = null
let panel: BrowserWindow | null = null
let lastHiddenAt = 0
let quitting = false
let pinned = false
let status: ConnectionStatus = 'disconnected'
let lastError: string | null = null

const ha = new HAClient()

function resourcePath(name: string): string {
  // Works both in dev (out/main → project/resources) and packaged (app.asar/out/main → app.asar/resources).
  return join(__dirname, '../../resources', name)
}

function broadcast(channel: string, payload: unknown): void {
  if (panel && !panel.isDestroyed()) panel.webContents.send(channel, payload)
}

function setStatus(next: ConnectionStatus, error: string | null): void {
  status = next
  lastError = error
  broadcast('ha:status', { status, error })
}

type Anchor = 'tray' | 'cursor'

function showPanel(anchor: Anchor = 'tray'): void {
  if (!panel) return
  if (anchor === 'cursor' || !tray) positionPanelAtCursor(panel)
  else positionPanelForTray(panel, tray)

  const reveal = (): void => {
    if (!panel) return
    panel.show()
    panel.focus()
    panel.webContents.send('panel:shown')
  }

  // Grab what is behind the panel while it is still hidden, so the page can
  // blur it itself — Windows cannot blur a transparent window natively.
  if (loadUiSettings().theme === 'macos') void captureBackdrop().then(reveal, reveal)
  else reveal()
}

/** Screenshot of the desktop behind the panel, used as the frosted-glass source. */
async function captureBackdrop(): Promise<void> {
  if (!panel || panel.isDestroyed()) return
  try {
    const bounds = panel.getBounds()
    const display = screen.getDisplayMatching(bounds)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor)
      }
    })
    const source =
      sources.find((entry) => String(entry.display_id) === String(display.id)) ?? sources[0]
    if (!source) return

    const image = source.thumbnail
    const size = image.getSize()
    const scale = size.width / display.size.width
    const pad = 48
    const x = Math.max(0, Math.round((bounds.x - display.bounds.x - pad) * scale))
    const y = Math.max(0, Math.round((bounds.y - display.bounds.y - pad) * scale))
    const width = Math.min(size.width - x, Math.round((bounds.width + pad * 2) * scale))
    const height = Math.min(size.height - y, Math.round((bounds.height + pad * 2) * scale))
    if (width <= 0 || height <= 0) return

    const crop = image.crop({ x, y, width, height })
    panel.webContents.send(
      'panel:backdrop',
      `data:image/jpeg;base64,${crop.toJPEG(80).toString('base64')}`
    )
  } catch {
    /* the panel simply renders without a backdrop */
  }
}

function hidePanel(): void {
  if (!panel) return
  lastHiddenAt = Date.now()
  pinned = false
  panel.hide()
}

function togglePanel(anchor: Anchor = 'tray'): void {
  if (!panel) return
  if (panel.isVisible()) {
    hidePanel()
  } else if (Date.now() - lastHiddenAt > 220) {
    showPanel(anchor)
  }
}

function createTray(): void {
  const image = nativeImage.createFromPath(resourcePath('tray.png'))
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip('HA Ctrl')

  // A shell-managed context menu survives focus changes that killed menu.popup().
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开面板', click: () => showPanel() },
      { label: '重新连接', click: () => ha.restart() },
      { type: 'separator' },
      {
        label: '开机自动启动',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )

  let menuOpenedAt = 0

  tray.on('right-click', () => {
    menuOpenedAt = Date.now()
  })

  tray.on('click', () => {
    // Some tray bars (MyDockFinder among them) report a right click as a left
    // click too; opening the panel there would steal focus and dismiss the menu.
    if (Date.now() - menuOpenedAt < 800) return
    togglePanel()
  })
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async () => ({
    config: { url: getServerUrl(), hasToken: await hasToken() },
    status,
    error: lastError,
    areas: ha.getAreas(),
    entities: ha.getEntities(),
    meta: ha.getMeta(),
    dashboard: loadDashboard(),
    ui: loadUiSettings(),
    overview: ha.getOverview()
  }))

  ipcMain.handle('config:save', async (_event, input: SaveConfigInput) => {
    try {
      const url = (input?.url ?? '').trim()
      if (!url) return { ok: false, error: '请填写 Home Assistant 地址' }
      const provided = typeof input.token === 'string' ? input.token.trim() : ''
      const token = provided || (await getToken())
      if (!token) return { ok: false, error: '请填写长期访问令牌' }
      await saveServerConfig(url, provided || undefined)
      ha.configure(url, token)
      ha.restart()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('ha:refresh', () => {
    ha.restart()
  })

  ipcMain.handle('ha:call-service', async (_event, call: ServiceCall) => {
    try {
      await ha.callService(call)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('dashboard:save', (_event, config: DashboardConfig) => {
    saveDashboard(config)
  })

  ipcMain.handle('ui:save', (_event, settings: UiSettings) => {
    const previous = loadUiSettings().theme
    saveUiSettings(settings)
    if (settings.theme !== previous) rebuildPanel()
  })

  ipcMain.on('window:hide', hidePanel)

  ipcMain.on('window:pin', (_event, value: boolean) => {
    pinned = Boolean(value)
  })

  ipcMain.on('window:height', (_event, height: number) => {
    if (!panel) return
    resizePanelWindow(panel, height)
    revealWhenMeasured()
  })
}

function buildPanel(initialHeight?: number): void {
  // A rebuilt window starts unpinned; the old renderer's cleanup never runs.
  pinned = false
  panel = createPanelWindow(loadUiSettings().theme, initialHeight)
  panel.on('blur', () => {
    if (pinned) return
    if (panel?.webContents.isDevToolsOpened()) return
    hidePanel()
  })
  panel.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      hidePanel()
    }
  })
}

let pendingReveal = false

/** Shows a rebuilt panel as soon as the renderer reports its real content height. */
function revealWhenMeasured(): void {
  if (!pendingReveal || !panel) return
  pendingReveal = false
  const target = panel
  const reveal = (): void => {
    if (target.isDestroyed()) return
    repositionPanel(target)
    target.show()
    target.focus()
  }
  if (loadUiSettings().theme === 'macos') void captureBackdrop().then(reveal, reveal)
  else reveal()
}

/** Window chrome (acrylic vs. transparent) is set at creation, so a theme switch rebuilds it. */
function rebuildPanel(): void {
  if (!panel) return
  const wasVisible = panel.isVisible()
  const [, previousHeight] = panel.getSize()
  panel.removeAllListeners()
  panel.destroy()

  // Reuse the old height and only show once the renderer has measured its
  // content, so the panel does not flash short and then stretch.
  buildPanel(previousHeight)
  if (!panel) return

  const next = panel
  repositionPanel(next)

  if (wasVisible) {
    pendingReveal = true
    setTimeout(() => {
      if (pendingReveal) {
        pendingReveal = false
        if (!next.isDestroyed()) {
          repositionPanel(next)
          next.show()
          next.focus()
        }
      }
    }, 1500)
  }
}

async function bootstrap(): Promise<void> {
  buildPanel()
  createTray()
  registerIpc()
  startCursorTracking()

  ha.on('ready', (payload) => broadcast('ha:ready', payload))
  ha.on('states', (payload) => broadcast('ha:states', payload))
  ha.on('status', (payload: { status: ConnectionStatus; error: string | null }) =>
    setStatus(payload.status, payload.error)
  )

  const url = getServerUrl()
  const token = await getToken()
  ha.configure(url, token)
  if (url && token) {
    ha.start()
  } else {
    setStatus('disconnected', '请在设置中填写服务器地址与访问令牌')
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showPanel())

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.hactrl.app')
    await bootstrap()
    globalShortcut.register('Control+Alt+H', () => togglePanel('cursor'))
    app.on('activate', () => showPanel())
  })
}

app.on('window-all-closed', () => {
  // The app lives in the tray; closing the panel must not quit it.
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  stopCursorTracking()
  ha.stop()
})
