import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import type {
  AreaRecord,
  ConnectionStatus,
  EntityMeta,
  EntityState,
  ServiceCall,
  StateUpdatePayload
} from '../../shared/types'
import { domainOf, isSupportedDomain } from '../../shared/domains'

interface RawArea {
  area_id: string
  name: string
}

interface RawDevice {
  id: string
  area_id: string | null
}

interface RawEntityRegistryEntry {
  entity_id: string
  area_id: string | null
  device_id: string | null
  name: string | null
  original_name: string | null
  disabled_by: string | null
  hidden_by: string | null
  entity_category: string | null
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export interface HAReady {
  areas: AreaRecord[]
  entities: EntityState[]
  meta: Record<string, EntityMeta>
  overview: string[] | null
}

function toWsUrl(rawUrl: string): string {
  let input = rawUrl.trim()
  if (!/^https?:\/\//i.test(input)) input = `http://${input}`
  const parsed = new URL(input)
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
  parsed.pathname = '/api/websocket'
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export class HAClient extends EventEmitter {
  private ws: WebSocket | null = null
  private url = ''
  private token = ''
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private states = new Map<string, EntityState>()
  private meta: Record<string, EntityMeta> = {}
  private areas: AreaRecord[] = []
  private overview: string[] | null = null
  private stopped = true
  private attempt = 0
  private reconnectTimer: NodeJS.Timeout | null = null

  configure(url: string, token: string): void {
    this.url = url.trim()
    this.token = token
  }

  start(): void {
    this.stopped = false
    this.attempt = 0
    this.open()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.teardown()
    this.emitStatus('disconnected', null)
  }

  restart(): void {
    this.stop()
    this.states.clear()
    this.meta = {}
    this.areas = []
    this.overview = null
    this.start()
  }

  getAreas(): AreaRecord[] {
    return this.areas
  }

  getEntities(): EntityState[] {
    return [...this.states.values()]
  }

  getMeta(): Record<string, EntityMeta> {
    return this.meta
  }

  /** Entity ids shown on the Home Assistant overview dashboard, null when unknown. */
  getOverview(): string[] | null {
    return this.overview
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  async callService(call: ServiceCall): Promise<void> {
    const payload: Record<string, unknown> = {
      type: 'call_service',
      domain: call.domain,
      service: call.service
    }
    if (call.data && Object.keys(call.data).length > 0) payload.service_data = call.data
    if (call.entityId) payload.target = { entity_id: call.entityId }
    await this.call(payload)
  }

  private open(): void {
    this.teardown()
    if (!this.url || !this.token) {
      this.emitStatus('disconnected', '尚未配置 Home Assistant 服务器')
      return
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(toWsUrl(this.url), { handshakeTimeout: 10_000 })
    } catch (error) {
      this.emitStatus('error', `无法解析服务器地址：${(error as Error).message}`)
      return
    }

    this.ws = ws
    this.emitStatus('connecting', null)

    ws.on('message', (raw) => this.handleMessage(raw.toString()))

    ws.on('error', (error) => {
      this.emitStatus('error', `连接失败：${error.message}`)
    })

    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      this.rejectAllPending(new Error('连接已断开'))
      if (!this.stopped) {
        this.emitStatus('disconnected', '与服务器的连接已断开，正在重试…')
        this.scheduleReconnect()
      }
    })
  }

  private teardown(): void {
    const ws = this.ws
    this.ws = null
    this.rejectAllPending(new Error('连接已重置'))
    if (ws) {
      ws.removeAllListeners()
      try {
        ws.close()
      } catch {
        /* already closed */
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return
    const delay = Math.min(30_000, 1_000 * 2 ** this.attempt) + Math.floor(Math.random() * 500)
    this.attempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    switch (msg.type) {
      case 'auth_required':
        this.sendRaw({ type: 'auth', access_token: this.token })
        break

      case 'auth_invalid':
        this.stopped = true
        this.emitStatus('error', '认证失败：访问令牌无效或已过期')
        this.teardown()
        break

      case 'auth_ok':
        this.attempt = 0
        void this.onAuthenticated()
        break

      case 'result':
        this.resolvePending(msg)
        break

      case 'event':
        this.handleEvent(msg.event as Record<string, unknown>)
        break

      case 'ping':
        this.sendRaw({ id: msg.id, type: 'pong' })
        break
    }
  }

  private async onAuthenticated(): Promise<void> {
    try {
      const [states, areas, devices, registry] = await Promise.all([
        this.call({ type: 'get_states' }) as Promise<EntityState[]>,
        this.call({ type: 'config/area_registry/list' }) as Promise<RawArea[]>,
        this.call({ type: 'config/device_registry/list' }) as Promise<RawDevice[]>,
        this.call({ type: 'config/entity_registry/list' }) as Promise<RawEntityRegistryEntry[]>
      ])

      this.states = new Map(states.map((state) => [state.entity_id, state]))
      this.areas = areas
        .map((area) => ({ area_id: area.area_id, name: area.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      this.meta = buildMeta(states, registry, devices)
      this.overview = await this.loadOverview()

      await this.call({ type: 'subscribe_events', event_type: 'state_changed' })

      this.emit('ready', {
        areas: this.areas,
        entities: this.getEntities(),
        meta: this.meta,
        overview: this.overview
      } satisfies HAReady)
      this.emitStatus('connected', null)
    } catch (error) {
      this.emitStatus('error', `读取实体失败：${(error as Error).message}`)
    }
  }

  private async loadOverview(): Promise<string[] | null> {
    try {
      const config = await this.call({ type: 'lovelace/config' })
      const ids = collectOverviewEntities(config)
      return ids.length > 0 ? ids : null
    } catch {
      // No permission or an auto-generated dashboard: fall back to heuristics.
      return null
    }
  }

  private handleEvent(event: Record<string, unknown> | undefined): void {
    if (!event || event.event_type !== 'state_changed') return
    const data = event.data as { entity_id?: string; new_state?: EntityState | null } | undefined
    if (!data?.entity_id) return

    const entityId = data.entity_id
    if (data.new_state) {
      this.states.set(entityId, data.new_state)
      const meta = this.meta[entityId]
      const friendly = data.new_state.attributes?.friendly_name
      if (meta && typeof friendly === 'string' && friendly !== meta.name) {
        meta.name = friendly
      }
      const payload: StateUpdatePayload = { updates: [data.new_state], removed: [] }
      this.emit('states', payload)
    } else {
      this.states.delete(entityId)
      const payload: StateUpdatePayload = { updates: [], removed: [entityId] }
      this.emit('states', payload)
    }
  }

  private sendRaw(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private call(payload: Record<string, unknown>): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('尚未连接到服务器'))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.sendRaw({ ...payload, id })
    })
  }

  private resolvePending(msg: Record<string, unknown>): void {
    const id = msg.id as number | undefined
    if (id === undefined) return
    const entry = this.pending.get(id)
    if (!entry) return
    this.pending.delete(id)
    if (msg.success) {
      entry.resolve(msg.result)
    } else {
      const error = msg.error as { message?: string; code?: string } | undefined
      entry.reject(new Error(error?.message ?? error?.code ?? '调用失败'))
    }
  }

  private rejectAllPending(error: Error): void {
    for (const entry of this.pending.values()) entry.reject(error)
    this.pending.clear()
  }

  private emitStatus(status: ConnectionStatus, error: string | null): void {
    this.emit('status', { status, error })
  }
}

function collectOverviewEntities(node: unknown, out = new Set<string>()): string[] {
  if (!node) return [...out]
  if (Array.isArray(node)) {
    for (const item of node) collectOverviewEntities(item, out)
    return [...out]
  }
  if (typeof node !== 'object') return [...out]

  const record = node as Record<string, unknown>
  if (typeof record.entity === 'string') out.add(record.entity)
  for (const key of ['entities', 'cards', 'sections', 'views', 'badges', 'card', 'content', 'rows']) {
    if (record[key]) collectOverviewEntities(record[key], out)
  }
  return [...out]
}

function buildMeta(
  states: EntityState[],
  registry: RawEntityRegistryEntry[],
  devices: RawDevice[]
): Record<string, EntityMeta> {
  const deviceArea = new Map<string, string | null>()
  for (const device of devices) deviceArea.set(device.id, device.area_id ?? null)

  const stateById = new Map(states.map((state) => [state.entity_id, state]))
  const meta: Record<string, EntityMeta> = {}

  for (const entry of registry) {
    if (entry.disabled_by) continue
    if (entry.entity_category === 'config') continue

    const domain = domainOf(entry.entity_id)
    if (!isSupportedDomain(domain)) continue

    const state = stateById.get(entry.entity_id)
    if (!state) continue

    const areaId =
      entry.area_id ?? (entry.device_id ? (deviceArea.get(entry.device_id) ?? null) : null)
    const friendly = state.attributes?.friendly_name
    const name =
      (typeof friendly === 'string' && friendly) ||
      entry.name ||
      entry.original_name ||
      entry.entity_id

    meta[entry.entity_id] = {
      entity_id: entry.entity_id,
      name,
      areaId,
      domain,
      supported: true
    }
  }

  // Entities missing from the registry still deserve a tile.
  for (const state of states) {
    if (meta[state.entity_id]) continue
    const domain = domainOf(state.entity_id)
    if (!isSupportedDomain(domain)) continue
    const friendly = state.attributes?.friendly_name
    meta[state.entity_id] = {
      entity_id: state.entity_id,
      name: typeof friendly === 'string' && friendly ? friendly : state.entity_id,
      areaId: null,
      domain,
      supported: true
    }
  }

  return meta
}
