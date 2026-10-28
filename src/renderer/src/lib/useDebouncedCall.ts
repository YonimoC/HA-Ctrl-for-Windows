import { useEffect, useRef } from 'react'
import type { ServiceCall } from '@shared/types'

export function useDebouncedCall(
  callService: (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>
): (delay: number, call: ServiceCall) => void {
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    []
  )
  return (delay, call) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      void callService(call)
    }, delay)
  }
}
