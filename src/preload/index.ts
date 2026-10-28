import { contextBridge, ipcRenderer } from 'electron'
import type {
  Bootstrap,
  DashboardConfig,
  HomeApi,
  SaveConfigInput,
  ServiceCall,
  StateUpdatePayload,
  StatusPayload,
  ReadyPayload,
  UiSettings
} from '../shared/types'

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: HomeApi = {
  getBootstrap: () => ipcRenderer.invoke('app:bootstrap') as Promise<Bootstrap>,
  saveConfig: (input: SaveConfigInput) => ipcRenderer.invoke('config:save', input),
  refresh: () => ipcRenderer.invoke('ha:refresh') as Promise<void>,
  callService: (call: ServiceCall) => ipcRenderer.invoke('ha:call-service', call),
  saveDashboard: (config: DashboardConfig) => ipcRenderer.invoke('dashboard:save', config),
  saveUi: (settings: UiSettings) => ipcRenderer.invoke('ui:save', settings),
  hideWindow: () => ipcRenderer.send('window:hide'),
  setContentHeight: (height: number) => ipcRenderer.send('window:height', height),
  setPinned: (pinned: boolean) => ipcRenderer.send('window:pin', pinned),
  onShown: (cb) => subscribe<void>('panel:shown', cb),
  onBackdrop: (cb) => subscribe<string>('panel:backdrop', cb),
  onReady: (cb) => subscribe<ReadyPayload>('ha:ready', cb),
  onStates: (cb) => subscribe<StateUpdatePayload>('ha:states', cb),
  onStatus: (cb) => subscribe<StatusPayload>('ha:status', cb)
}

contextBridge.exposeInMainWorld('api', api)
