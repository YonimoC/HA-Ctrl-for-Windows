export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface EntityState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

export interface AreaRecord {
  area_id: string
  name: string
}

export interface EntityMeta {
  entity_id: string
  name: string
  areaId: string | null
  domain: string
  supported: boolean
}

export interface DashboardConfig {
  /** entity ids the user removed from the panel */
  hidden: string[]
  /** per-area manual ordering */
  order: Record<string, string[]>
  /** display-name overrides */
  names?: Record<string, string>
  /** area overrides: entity id → area id (or the unassigned key) */
  areas?: Record<string, string>
}

export type UiTheme = 'windows' | 'macos'

export interface UiSettings {
  theme: UiTheme
}

export interface ServerConfig {
  url: string
  hasToken: boolean
}

export interface Bootstrap {
  config: ServerConfig
  status: ConnectionStatus
  error: string | null
  areas: AreaRecord[]
  entities: EntityState[]
  meta: Record<string, EntityMeta>
  dashboard: DashboardConfig
  ui: UiSettings
  /** Entity ids on the HA overview dashboard, null when it could not be read. */
  overview: string[] | null
}

export interface ReadyPayload {
  areas: AreaRecord[]
  entities: EntityState[]
  meta: Record<string, EntityMeta>
  overview: string[] | null
}

export interface StateUpdatePayload {
  updates: EntityState[]
  removed: string[]
}

export interface StatusPayload {
  status: ConnectionStatus
  error: string | null
}

export interface ServiceCall {
  domain: string
  service: string
  data?: Record<string, unknown>
  entityId?: string
}

export interface SaveConfigInput {
  url: string
  token?: string
}

export interface HomeApi {
  getBootstrap(): Promise<Bootstrap>
  saveConfig(input: SaveConfigInput): Promise<{ ok: boolean; error?: string }>
  refresh(): Promise<void>
  callService(call: ServiceCall): Promise<{ ok: boolean; error?: string }>
  saveDashboard(config: DashboardConfig): Promise<void>
  saveUi(settings: UiSettings): Promise<void>
  hideWindow(): void
  setContentHeight(height: number): void
  /** While pinned the panel stays open when it loses focus (used by settings). */
  setPinned(pinned: boolean): void
  onShown(cb: () => void): () => void
  onBackdrop(cb: (dataUrl: string) => void): () => void
  onReady(cb: (payload: ReadyPayload) => void): () => void
  onStates(cb: (payload: StateUpdatePayload) => void): () => void
  onStatus(cb: (payload: StatusPayload) => void): () => void
}
