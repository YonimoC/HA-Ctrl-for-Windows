import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
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
  panel.show()
  panel.focus()
  panel.webContents.send('panel:shown')
}

function hidePanel(): void {
  if (!panel) return
  lastHiddenAt = Date.now()
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
  })
}

function buildPanel(): void {
  panel = createPanelWindow(loadUiSettings().theme)
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

/** Window chrome (acrylic vs. transparent) is set at creation, so a theme switch rebuilds it. */
function rebuildPanel(): void {
  if (!panel) return
  const wasVisible = panel.isVisible()
  panel.removeAllListeners()
  panel.destroy()
  buildPanel()
  if (wasVisible && panel) {
    repositionPanel(panel)
    panel.show()
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
