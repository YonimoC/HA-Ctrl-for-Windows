export const SUPPORTED_DOMAINS = [
  'light',
  'switch',
  'climate',
  'fan',
  'cover',
  'scene',
  'script',
  'automation',
  'input_boolean',
  'sensor',
  'binary_sensor'
] as const

const supported = new Set<string>(SUPPORTED_DOMAINS)

export function isSupportedDomain(domain: string): boolean {
  return supported.has(domain)
}

export function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

/** Domains whose entities are worth showing by default when they have a unit. */
const READ_ONLY_DOMAINS = new Set(['sensor', 'binary_sensor'])

export function isReadOnly(domain: string): boolean {
  return READ_ONLY_DOMAINS.has(domain)
}

export const DOMAIN_LABELS: Record<string, string> = {
  light: '灯光',
  switch: '开关',
  climate: '空调',
  fan: '风扇',
  cover: '窗帘',
  scene: '场景',
  script: '脚本',
  automation: '自动化',
  input_boolean: '开关',
  sensor: '传感器',
  binary_sensor: '传感器'
}
