import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DashboardConfig, UiSettings } from '../shared/types'

interface StoredConfig {
  url: string
  tokenEnc?: string
  tokenPlain?: string
}

const defaultDashboard = (): DashboardConfig => ({ hidden: [], order: {} })

function filePath(name: string): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

function readJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8')
}

let cachedServer: StoredConfig | null = null

export function loadServerConfig(): StoredConfig {
  if (cachedServer) return cachedServer
  cachedServer = readJson<StoredConfig>(filePath('server.json'), { url: '', tokenPlain: '' })
  return cachedServer
}

export function getServerUrl(): string {
  return loadServerConfig().url
}

export async function getToken(): Promise<string> {
  const cfg = loadServerConfig()
  if (cfg.tokenEnc) {
    try {
      if (await safeStorage.isAsyncEncryptionAvailable()) {
        const decrypted = await safeStorage.decryptStringAsync(Buffer.from(cfg.tokenEnc, 'base64'))
        if (decrypted.shouldReEncrypt) {
          const reEncrypted = await safeStorage.encryptStringAsync(decrypted.result)
          cachedServer = { ...cfg, tokenEnc: reEncrypted.toString('base64') }
          writeJson(filePath('server.json'), cachedServer)
        }
        return decrypted.result
      }
    } catch {
      return ''
    }
  }
  return cfg.tokenPlain ?? ''
}

export async function hasToken(): Promise<boolean> {
  return (await getToken()).length > 0
}

export async function saveServerConfig(url: string, token?: string): Promise<void> {
  const current = loadServerConfig()
  const next: StoredConfig = { url: url.trim(), tokenEnc: current.tokenEnc, tokenPlain: current.tokenPlain }

  if (typeof token === 'string' && token.length > 0) {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptStringAsync(token)
      next.tokenEnc = encrypted.toString('base64')
      next.tokenPlain = undefined
    } else {
      next.tokenPlain = token
      next.tokenEnc = undefined
    }
  }

  cachedServer = next
  writeJson(filePath('server.json'), next)
}

export function loadDashboard(): DashboardConfig {
  const cfg = readJson<DashboardConfig>(filePath('dashboard.json'), defaultDashboard())
  return {
    hidden: Array.isArray(cfg.hidden) ? cfg.hidden : [],
    order: cfg.order && typeof cfg.order === 'object' ? cfg.order : {}
  }
}

export function saveDashboard(config: DashboardConfig): void {
  writeJson(filePath('dashboard.json'), {
    hidden: config.hidden ?? [],
    order: config.order ?? {}
  })
}

export function loadUiSettings(): UiSettings {
  const cfg = readJson<UiSettings>(filePath('ui.json'), { theme: 'macos' })
  return { theme: cfg.theme === 'windows' ? 'windows' : 'macos' }
}

export function saveUiSettings(settings: UiSettings): void {
  writeJson(filePath('ui.json'), { theme: settings.theme === 'windows' ? 'windows' : 'macos' })
}
