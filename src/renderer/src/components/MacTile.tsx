import type { CSSProperties, ReactNode } from 'react'
import type { EntityMeta, EntityState, ServiceCall } from '@shared/types'
import { Icon, iconFor } from './Icons'
import { num, str } from '../lib/util'
import { formatValue, type EntityItem } from '../lib/grouping'
import { HVAC_LABELS } from '../lib/hvac'

type CallService = (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>

export interface MacTileProps {
  item: EntityItem
  editMode: boolean
  dragging: boolean
  compact?: boolean
  callService: CallService
  onOpen: (entityId: string) => void
  onEdit: (entityId: string) => void
  onRemove: (entityId: string) => void
  onDragStart: (entityId: string) => void
  onDropOn: (entityId: string) => void
}

function isOn(domain: string, state: EntityState): boolean {
  if (domain === 'climate') return state.state !== 'off' && state.state !== 'unavailable'
  if (domain === 'cover') return state.state === 'open'
  return state.state === 'on'
}

function quickToggle(domain: string, state: EntityState, entityId: string): ServiceCall {
  if (domain === 'cover') {
    return { domain, service: state.state === 'open' ? 'close_cover' : 'open_cover', entityId }
  }
  if (domain === 'scene' || domain === 'script') {
    return { domain, service: 'turn_on', entityId }
  }
  return { domain, service: 'toggle', entityId }
}

function brightnessPercent(state: EntityState): number | null {
  const value = num(state.attributes.brightness)
  return value === undefined ? null : Math.round((value / 255) * 100)
}

export function macTileState(item: EntityItem): string {
  const { meta, state } = item
  const on = isOn(meta.domain, state)

  switch (meta.domain) {
    case 'light': {
      if (!on) return '关闭'
      const percent = brightnessPercent(state)
      return percent === null ? '开启' : `${percent}%`
    }
    case 'climate': {
      if (state.state === 'off') return '关闭'
      const current = num(state.attributes.current_temperature)
      const target = num(state.attributes.temperature)
      const mode = HVAC_LABELS[state.state] ?? state.state
      const value = current ?? target
      return value === undefined ? mode : `${Math.round(value * 10) / 10}° ${mode}`
    }
    case 'cover':
      return on ? '已打开' : '已关闭'
    case 'scene':
      return '场景'
    case 'script':
      return state.state === 'on' ? '运行中' : '脚本'
    case 'sensor':
    case 'binary_sensor':
      return formatValue(state)
    default:
      return on ? '开启' : '关闭'
  }
}

function domainHue(domain: string): string {
  switch (domain) {
    case 'light':
      return '#f5a300'
    case 'climate':
      return '#ff8a3d'
    case 'fan':
      return '#32ade6'
    case 'cover':
      return '#2fb457'
    case 'scene':
      return '#8a5cf6'
    case 'script':
    case 'automation':
      return '#5e5ce6'
    case 'sensor':
    case 'binary_sensor':
      return '#8e8e93'
    default:
      return '#0a84ff'
  }
}

function iconColor(meta: EntityMeta, state: EntityState): string {
  const on = isOn(meta.domain, state)
  if (meta.domain === 'sensor' || meta.domain === 'binary_sensor') {
    return on ? 'var(--mac-icon-sensor-on)' : 'var(--mac-icon-off)'
  }
  if (!on) return 'var(--mac-icon-off)'
  switch (meta.domain) {
    case 'light':
      return '#ffc01e'
    case 'climate':
      return '#ff9f0a'
    case 'fan':
      return '#32ade6'
    case 'cover':
      return '#30d158'
    case 'scene':
      return '#bf5af2'
    case 'script':
    case 'automation':
      return '#5e5ce6'
    default:
      return '#0a84ff'
  }
}

export function MacTile({
  item,
  editMode,
  dragging,
  compact = false,
  callService,
  onOpen,
  onEdit,
  onRemove,
  onDragStart,
  onDropOn
}: MacTileProps): ReactNode {
  const { meta, state } = item
  const on = isOn(meta.domain, state)
  const wide = meta.domain === 'climate'
  const canToggle = meta.domain !== 'sensor' && meta.domain !== 'binary_sensor'

  return (
    <div
      className={[
        'mac-tile',
        on ? 'is-on' : 'is-off',
        wide ? 'is-wide' : '',
        compact ? 'is-compact' : '',
        editMode ? 'is-editing' : '',
        dragging ? 'is-dragging' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--tile-hue': domainHue(meta.domain) } as CSSProperties}
      draggable={editMode}
      onDragStart={(event) => {
        if (!editMode) return
        event.dataTransfer.setData('text/plain', meta.entity_id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(meta.entity_id)
      }}
      onDragOver={(event) => {
        if (editMode) event.preventDefault()
      }}
      onDrop={(event) => {
        if (!editMode) return
        event.preventDefault()
        onDropOn(meta.entity_id)
      }}
      onClick={() => {
        if (editMode) onEdit(meta.entity_id)
        else onOpen(meta.entity_id)
      }}
      role="button"
      tabIndex={editMode ? undefined : 0}
      onKeyDown={(event) => {
        if (editMode) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(meta.entity_id)
        }
      }}
    >
      {canToggle && !editMode ? (
        <button
          className="mac-tile__icon-btn"
          title={on ? '关闭' : '开启'}
          onClick={(event) => {
            event.stopPropagation()
            void callService(quickToggle(meta.domain, state, meta.entity_id))
          }}
        >
          <span className="mac-tile__icon" style={{ color: iconColor(meta, state) }}>
            <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={20} />
          </span>
        </button>
      ) : (
        <span className="mac-tile__icon" style={{ color: iconColor(meta, state) }}>
          <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={20} />
        </span>
      )}
      <span className="mac-tile__text">
        <span className="mac-tile__name">{meta.name}</span>
        <span className="mac-tile__state">{macTileState(item)}</span>
      </span>
      {editMode && (
        <>
          <button
            className="mac-tile__remove"
            title="从面板移除"
            onClick={(event) => {
              event.stopPropagation()
              onRemove(meta.entity_id)
            }}
          >
            <Icon name="minus" size={13} strokeWidth={2.8} />
          </button>
          <span className="tile__grip">
            <Icon name="drag" size={14} />
          </span>
        </>
      )}
    </div>
  )
}
