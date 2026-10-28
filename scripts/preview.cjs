// Dev-only: renders the panel over a generated backdrop and saves a screenshot.
// Usage: SHOT_NAME=settings CLICK='.header__actions .icon-btn' npx electron scripts/preview.cjs
const { app, BrowserWindow, ipcMain, nativeTheme, desktopCapturer, screen } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const out = path.join(__dirname, '..', '.shots', (process.env.SHOT_NAME || 'ui') + '.png')
fs.mkdirSync(path.dirname(out), { recursive: true })

const rows = [
  ['light.a', 'on', { friendly_name: '客厅吸顶灯', brightness: 180 }, 'living'],
  ['light.b', 'off', { friendly_name: '落地灯', brightness: 0 }, 'living'],
  ['climate.a', 'cool', { friendly_name: '客厅空调', current_temperature: 26.4, temperature: 24, min_temp: 16, max_temp: 30, hvac_modes: ['off', 'cool', 'heat'], unit_of_measurement: '°C' }, 'living'],
  ['switch.a', 'on', { friendly_name: '电视插座' }, 'living'],
  ['sensor.a', '24.6', { friendly_name: '室内温度', unit_of_measurement: '°C', device_class: 'temperature' }, 'living'],
  ['light.c', 'on', { friendly_name: '床头灯', brightness: 90 }, 'bed'],
  ['cover.a', 'closed', { friendly_name: '卧室窗帘' }, 'bed'],
  ['sensor.b', '48', { friendly_name: '湿度', unit_of_measurement: '%' }, 'bed']
]

const meta = {}
const entities = rows.map(([id, state, attributes, areaId]) => {
  meta[id] = { entity_id: id, name: attributes.friendly_name, areaId, domain: id.split('.')[0], supported: true }
  return { entity_id: id, state, attributes, last_changed: '', last_updated: '' }
})

const bootstrap = {
  config: { url: 'http://homeassistant.local:8123', hasToken: true },
  status: 'connected',
  error: null,
  areas: [{ area_id: 'living', name: '客厅' }, { area_id: 'bed', name: '卧室' }],
  entities,
  meta,
  dashboard: { hidden: [], order: {} },
  ui: { theme: 'macos' },
  overview: null
}

ipcMain.handle('app:bootstrap', () => bootstrap)
ipcMain.handle('config:save', () => ({ ok: true }))
ipcMain.handle('ha:refresh', () => undefined)
ipcMain.handle('ha:call-service', () => ({ ok: true }))
ipcMain.handle('dashboard:save', () => undefined)
ipcMain.handle('ui:save', () => undefined)
ipcMain.on('window:hide', () => undefined)

let win
ipcMain.on('window:height', (_e, h) => {
  if (win) win.setSize(380, Math.min(470, Math.max(180, Math.ceil(h))), false)
})

app.whenReady().then(async () => {
  const theme = process.env.SHOT_THEME === 'dark' ? 'dark' : 'light'
  nativeTheme.themeSource = theme
  const display = screen.getPrimaryDisplay()
  const width = 380
  const height = 470
  const x = Math.round(display.size.width / 2 - width / 2)
  const y = Math.round(display.size.height / 2 - height / 2)

  const backdrop = new BrowserWindow({
    x: 0, y: 0, width: display.bounds.width, height: display.bounds.height,
    frame: false, skipTaskbar: true, focusable: false, webPreferences: { sandbox: false }
  })
  await backdrop.loadURL('data:text/html,' + encodeURIComponent(`<!doctype html><body style="margin:0;height:100vh;background:radial-gradient(at 18% 18%, #ff8a00 0, transparent 55%),radial-gradient(at 82% 12%, #7b61ff 0, transparent 52%),radial-gradient(at 72% 82%, #00c2ff 0, transparent 56%),radial-gradient(at 18% 86%, #ff2d55 0, transparent 52%),#1b1b1f"></body>`))
  backdrop.showInactive()
  await new Promise((r) => setTimeout(r, 600))

  win = new BrowserWindow({
    width, height, x, y, show: false, frame: false, transparent: false,
    backgroundColor: '#00000000', backgroundMaterial: 'acrylic',
    resizable: true, movable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      sandbox: false, contextIsolation: true
    }
  })
  await win.loadURL('http://localhost:5173/')
  win.show()
  await new Promise((r) => setTimeout(r, 1600))

  if (process.env.CLICK) {
    await win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(process.env.CLICK)}); if (el) el.click(); return Boolean(el) })()`
    )
    await new Promise((r) => setTimeout(r, 700))
  }
  if (process.env.SCROLL) {
    await win.webContents.executeJavaScript(`(() => { const el = document.querySelector('.content'); if (el) el.scrollTop = ${Number(process.env.SCROLL)}; return true })()`)
    await new Promise((r) => setTimeout(r, 600))
  }

  // Without SHOT_NAME the window is left on screen for side-by-side comparison.
  if (!process.env.SHOT_NAME) {
    console.log('preview window left open — press Ctrl+C here to close it')
    return
  }

  const bounds = win.getBounds()
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor)
    }
  })
  const thumb = sources[0].thumbnail
  const scale = thumb.getSize().width / display.size.width
  const margin = 16
  const crop = thumb.crop({
    x: Math.round((bounds.x - margin) * scale),
    y: Math.round((bounds.y - margin) * scale),
    width: Math.round((bounds.width + margin * 2) * scale),
    height: Math.round((bounds.height + margin * 2) * scale)
  })
  fs.writeFileSync(out, crop.toPNG())
  console.log('saved', out)
  app.quit()
})
