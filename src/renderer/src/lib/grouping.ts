import type { AreaRecord, DashboardConfig, EntityMeta, EntityState } from '@shared/types'

export const UNASSIGNED_KEY = '__unassigned__'

export interface EntityItem {
  meta: EntityMeta
  state: EntityState
}

export interface GroupedArea {
  key: string
  name: string
  items: EntityItem[]
}

export function orderedIdsOf(dashboard: DashboardConfig): Set<string> {
  return new Set(Object.values(dashboard.order).flat())
}

function defaultVisible(
  meta: EntityMeta,
  state: EntityState | undefined,
  ordered: Set<string>,
  overview: Set<string> | null
): boolean {
  if (!meta.supported) return false
  if (ordered.has(meta.entity_id)) return true
  if (!state) return false
  if (state.state === 'unavailable' || state.state === 'unknown') return false
  if (overview) return overview.has(meta.entity_id)
  if (meta.domain === 'sensor') {
    const unit = state.attributes?.unit_of_measurement
    return typeof unit === 'string' && unit.length > 0
  }
  return true
}

export function computeVisible(
  meta: Record<string, EntityMeta>,
  entities: Record<string, EntityState>,
  dashboard: DashboardConfig,
  overviewIds: string[] | null = null
): Set<string> {
  const ordered = orderedIdsOf(dashboard)
  const hidden = new Set(dashboard.hidden)
  const overview = overviewIds && overviewIds.length > 0 ? new Set(overviewIds) : null
  const visible = new Set<string>()
  for (const item of Object.values(meta)) {
    if (hidden.has(item.entity_id)) continue
    const state = entities[item.entity_id]
    if (!state) continue
    if (!defaultVisible(item, state, ordered, overview)) continue
    visible.add(item.entity_id)
  }
  return visible
}

const DOMAIN_ORDER = [
  'light',
  'climate',
  'cover',
  'switch',
  'input_boolean',
  'fan',
  'scene',
  'script',
  'sensor',
  'binary_sensor'
]

function domainRank(domain: string): number {
  const index = DOMAIN_ORDER.indexOf(domain)
  return index === -1 ? DOMAIN_ORDER.length : index
}

function sortItems(items: EntityItem[], order: string[] | undefined): EntityItem[] {
  const index = new Map<string, number>()
  order?.forEach((id, i) => index.set(id, i))
  return [...items].sort((a, b) => {
    const ai = index.get(a.meta.entity_id) ?? Number.POSITIVE_INFINITY
    const bi = index.get(b.meta.entity_id) ?? Number.POSITIVE_INFINITY
    if (ai !== bi) return ai - bi
    const ar = domainRank(a.meta.domain)
    const br = domainRank(b.meta.domain)
    if (ar !== br) return ar - br
    return a.meta.name.localeCompare(b.meta.name, 'zh-CN')
  })
}

export function buildGroups(
  meta: Record<string, EntityMeta>,
  entities: Record<string, EntityState>,
  areas: AreaRecord[],
  dashboard: DashboardConfig,
  overviewIds: string[] | null = null
): GroupedArea[] {
  const visible = computeVisible(meta, entities, dashboard, overviewIds)
  const buckets = new Map<string, EntityItem[]>()

  for (const item of Object.values(meta)) {
    if (!visible.has(item.entity_id)) continue
    const state = entities[item.entity_id]
    if (!state) continue
    const key = item.areaId ?? UNASSIGNED_KEY
    const list = buckets.get(key)
    if (list) list.push({ meta: item, state })
    else buckets.set(key, [{ meta: item, state }])
  }

  const groups: GroupedArea[] = []
  for (const area of areas) {
    const items = buckets.get(area.area_id)
    if (!items?.length) continue
    groups.push({
      key: area.area_id,
      name: area.name,
      items: sortItems(items, dashboard.order[area.area_id])
    })
  }

  const unassigned = buckets.get(UNASSIGNED_KEY)
  if (unassigned?.length) {
    groups.push({
      key: UNASSIGNED_KEY,
      name: '未分配房间',
      items: sortItems(unassigned, dashboard.order[UNASSIGNED_KEY])
    })
  }

  return groups
}

export function areaLabel(areaId: string | null, areas: AreaRecord[]): string {
  if (!areaId) return '未分配房间'
  return areas.find((area) => area.area_id === areaId)?.name ?? '未分配房间'
}

export function formatValue(state: EntityState): string {
  const unit = state.attributes?.unit_of_measurement
  const value = state.state
  if (state.entity_id.startsWith('binary_sensor.')) {
    return value === 'on' ? '检测到' : '未检测'
  }
  return typeof unit === 'string' && unit ? `${value} ${unit}` : value
}
