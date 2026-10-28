import { useMemo, useState, type ReactNode } from 'react'
import { useHome } from '../home'
import { computeVisible, UNASSIGNED_KEY, areaLabel } from '../lib/grouping'
import { Icon, iconFor } from './Icons'
import { str } from '../lib/util'

export function AddEntitySheet({ areaKey }: { areaKey: string | null }): ReactNode {
  const home = useHome()
  const [query, setQuery] = useState('')
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const candidates = useMemo(() => {
    const visible = computeVisible(home.meta, home.entities, home.dashboard, home.overview)
    const needle = query.trim().toLowerCase()
    const items = Object.values(home.meta).filter((item) => {
      if (!item.supported) return false
      if (visible.has(item.entity_id)) return false
      if (!home.entities[item.entity_id]) return false
      if (!needle) return true
      return (
        item.name.toLowerCase().includes(needle) ||
        item.entity_id.toLowerCase().includes(needle)
      )
    })

    items.sort((a, b) => {
      const aHere = (a.areaId ?? UNASSIGNED_KEY) === (areaKey ?? UNASSIGNED_KEY) ? 0 : 1
      const bHere = (b.areaId ?? UNASSIGNED_KEY) === (areaKey ?? UNASSIGNED_KEY) ? 0 : 1
      if (aHere !== bHere) return aHere - bHere
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    return items
  }, [home.meta, home.entities, home.dashboard, query, areaKey])

  const add = (entityId: string): void => {
    const meta = home.meta[entityId]
    if (!meta) return

    // Adding from a room's "+" puts the entity in that room; otherwise it keeps
    // whatever area Home Assistant reports.
    const ownArea = meta.areaId ?? UNASSIGNED_KEY
    const key = areaKey ?? ownArea
    const current = home.dashboard.order[key] ?? []
    const areaOverrides = { ...(home.dashboard.areas ?? {}) }
    if (areaKey && areaKey !== ownArea) areaOverrides[entityId] = areaKey
    else delete areaOverrides[entityId]

    home.updateDashboard({
      ...home.dashboard,
      hidden: home.dashboard.hidden.filter((id) => id !== entityId),
      order: {
        ...home.dashboard.order,
        [key]: current.includes(entityId) ? current : [...current, entityId]
      },
      areas: areaOverrides
    })
    setLastAdded(entityId)
    window.setTimeout(() => setLastAdded((id) => (id === entityId ? null : id)), 1400)
  }

  return (
    <div className="add-sheet">
      <div className="add-search">
        <Icon name="search" size={14} className="add-search__icon" />
        <input
          className="add-search__input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索实体"
          autoFocus
          spellCheck={false}
        />
      </div>

      {candidates.length === 0 ? (
        <div className="add-empty">
          没有可添加的实体了。实体列表来自 Home Assistant，先在那边添加设备即可。
        </div>
      ) : (
        <div className="add-list">
          {candidates.map((item) => {
            const state = home.entities[item.entity_id]
            const added = lastAdded === item.entity_id
            return (
              <button
                key={item.entity_id}
                className={`add-item ${added ? 'is-added' : ''}`}
                onClick={() => add(item.entity_id)}
              >
                <span className="add-item__icon">
                  <Icon
                    name={
                      added
                        ? 'check'
                        : iconFor(item.domain, str(state?.attributes?.device_class))
                    }
                    size={15}
                  />
                </span>
                <span className="add-item__text">
                  <span className="add-item__name">{item.name}</span>
                  <span className="add-item__id">{item.entity_id}</span>
                </span>
                <span className="add-item__area">{areaLabel(item.areaId, home.areas)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
