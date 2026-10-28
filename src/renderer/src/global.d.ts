import type { HomeApi } from '../../shared/types'

declare global {
  interface Window {
    api: HomeApi
  }
}

export {}
