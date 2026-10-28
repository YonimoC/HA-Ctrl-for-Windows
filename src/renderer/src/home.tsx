import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type {
  AreaRecord,
  ConnectionStatus,
  DashboardConfig,
  EntityMeta,
  EntityState,
  SaveConfigInput,
  ServerConfig,
  ServiceCall,
  UiSettings
} from '../../shared/types'

interface HomeStore {
  loaded: boolean
  status: ConnectionStatus
  error: string | null
  config: ServerConfig
  areas: AreaRecord[]
  entities: Record<string, EntityState>
  meta: Record<string, EntityMeta>
  dashboard: DashboardConfig
  ui: UiSettings
  overview: string[] | null
}

interface HomeContextValue extends HomeStore {
  callService: (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>
  updateDashboard: (next: DashboardConfig) => void
  updateUi: (next: UiSettings) => void
  saveConfig: (input: SaveConfigInput) => Promise<{ ok: boolean; error?: string }>
  refresh: () => void
  hide: () => void
}

const emptyStore: HomeStore = {
  loaded: false,
  status: 'connecting',
  error: null,
  config: { url: '', hasToken: false },
  areas: [],
  entities: {},
  meta: {},
  dashboard: { hidden: [], order: {} },
  ui: { theme: 'macos' },
  overview: null
}

const HomeContext = createContext<HomeContextValue | null>(null)

export function HomeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [store, setStore] = useState<HomeStore>(emptyStore)

  useEffect(() => {
    let alive = true
    const pendingUpdates: EntityState[] = []
    const pendingRemoved: string[] = []
    let flushTimer: number | null = null

    void window.api.getBootstrap().then((bootstrap) => {
      if (!alive) return
      setStore({
        loaded: true,
        status: bootstrap.status,
        error: bootstrap.error,
        config: bootstrap.config,
        areas: bootstrap.areas,
        entities: Object.fromEntries(bootstrap.entities.map((e) => [e.entity_id, e])),
        meta: bootstrap.meta,
        dashboard: bootstrap.dashboard,
        ui: bootstrap.ui,
        overview: bootstrap.overview
      })
    })

    const offReady = window.api.onReady((payload) => {
      setStore((current) => ({
        ...current,
        loaded: true,
        areas: payload.areas,
        meta: payload.meta,
        overview: payload.overview,
        entities: Object.fromEntries(payload.entities.map((e) => [e.entity_id, e]))
      }))
    })

    const offStates = window.api.onStates((payload) => {
      if (payload.updates.length === 0 && payload.removed.length === 0) return
      pendingUpdates.push(...payload.updates)
      pendingRemoved.push(...payload.removed)
      if (flushTimer !== null) return
      // Home Assistant can emit many state changes per second (power meters and
      // the like); batching keeps the panel from repainting on every message.
      flushTimer = window.setTimeout(() => {
        flushTimer = null
        const updates = pendingUpdates.splice(0, pendingUpdates.length)
        const removed = pendingRemoved.splice(0, pendingRemoved.length)
        setStore((current) => {
          const entities = { ...current.entities }
          for (const update of updates) entities[update.entity_id] = update
          for (const id of removed) delete entities[id]
          return { ...current, entities }
        })
      }, 250)
    })

    const offStatus = window.api.onStatus((payload) => {
      setStore((current) => ({ ...current, status: payload.status, error: payload.error }))
    })

    return () => {
      alive = false
      if (flushTimer !== null) window.clearTimeout(flushTimer)
      offReady()
      offStates()
      offStatus()
    }
  }, [])

  const callService = useCallback(
    (call: ServiceCall) => window.api.callService(call),
    []
  )

  const updateDashboard = useCallback((next: DashboardConfig) => {
    setStore((current) => ({ ...current, dashboard: next }))
    void window.api.saveDashboard(next)
  }, [])

  const updateUi = useCallback((next: UiSettings) => {
    setStore((current) => ({ ...current, ui: next }))
    void window.api.saveUi(next)
  }, [])

  const saveConfig = useCallback(async (input: SaveConfigInput) => {
    const result = await window.api.saveConfig(input)
    setStore((current) => ({
      ...current,
      config: {
        url: input.url,
        hasToken: current.config.hasToken || Boolean(input.token)
      },
      status: 'connecting',
      error: result.ok ? null : (result.error ?? null)
    }))
    return result
  }, [])

  const refresh = useCallback(() => {
    void window.api.refresh()
  }, [])

  const hide = useCallback(() => {
    window.api.hideWindow()
  }, [])

  const value = useMemo<HomeContextValue>(
    () => ({ ...store, callService, updateDashboard, updateUi, saveConfig, refresh, hide }),
    [store, callService, updateDashboard, updateUi, saveConfig, refresh, hide]
  )

  return <HomeContext.Provider value={value}>{children}</HomeContext.Provider>
}

export function useHome(): HomeContextValue {
  const context = useContext(HomeContext)
  if (!context) throw new Error('useHome must be used inside HomeProvider')
  return context
}
