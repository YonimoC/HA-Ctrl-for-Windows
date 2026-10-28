import { useState, type ReactNode } from 'react'
import type { AreaRecord, DashboardConfig } from '@shared/types'
import { UNASSIGNED_KEY, type EntityItem } from '../lib/grouping'
import { str } from '../lib/util'
import { Icon, iconFor } from './Icons'

interface Props {
  item: EntityItem
  areas: AreaRecord[]
  dashboard: DashboardConfig
  onSave: (next: DashboardConfig) => void
  onClose: () => void
}

export function TileEditor({ item, areas, dashboard, onSave, onClose }: Props): ReactNode {
  const { meta, state } = item
  const [name, setName] = useState(dashboard.names?.[meta.entity_id] ?? '')
  const [area, setArea] = useState(meta.areaId ?? UNASSIGNED_KEY)

  const save = (): void => {
    const names = { ...(dashboard.names ?? {}) }
    const trimmed = name.trim()
    if (trimmed) names[meta.entity_id] = trimmed
    else delete names[meta.entity_id]

    const areaMap = { ...(dashboard.areas ?? {}) }
    if (area !== (meta.areaId ?? UNASSIGNED_KEY)) areaMap[meta.entity_id] = area
    else delete areaMap[meta.entity_id]

    onSave({ ...dashboard, names, areas: areaMap })
    onClose()
  }

  const remove = (): void => {
    const order: Record<string, string[]> = {}
    for (const [key, ids] of Object.entries(dashboard.order)) {
      order[key] = ids.filter((id) => id !== meta.entity_id)
    }
    onSave({ ...dashboard, hidden: [...new Set([...dashboard.hidden, meta.entity_id])], order })
    onClose()
  }

  return (
    <div className="mac-detail" onClick={onClose}>
      <div className="mac-detail__card" onClick={(event) => event.stopPropagation()}>
        <div className="mac-detail__head">
          <span className="mac-detail__icon">
            <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={24} />
          </span>
          <div className="mac-detail__titles">
            <div className="mac-detail__name">{meta.name}</div>
            <div className="mac-detail__state">{meta.entity_id}</div>
          </div>
          <button className="mac-detail__close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="mac-detail__body">
          <label className="field">
            <span className="field__label">显示名称</span>
            <input
              className="field__input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={meta.name}
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span className="field__label">所属房间</span>
            <select
              className="field__input"
              value={area}
              onChange={(event) => setArea(event.target.value)}
            >
              {areas.map((entry) => (
                <option key={entry.area_id} value={entry.area_id}>
                  {entry.name}
                </option>
              ))}
              <option value={UNASSIGNED_KEY}>未分配房间</option>
            </select>
          </label>
        </div>

        <div className="mac-detail__actions">
          <button type="button" className="ghost-btn" onClick={remove}>
            从面板移除
          </button>
          <button type="button" className="primary-btn" onClick={save}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}
