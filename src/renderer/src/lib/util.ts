export function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function temperatureUnit(attributes: Record<string, unknown>): string {
  return str(attributes.unit_of_measurement) === '°F' ? '°F' : '°'
}
