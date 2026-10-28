import { useEffect, useState, type ReactNode } from 'react'
import type { EntityMeta, EntityState, ServiceCall } from '@shared/types'
import { Icon, iconFor } from './Icons'
import { clamp, num, str, strArray, temperatureUnit } from '../lib/util'
import { formatValue } from '../lib/grouping'
import { useDebouncedCall } from '../lib/useDebouncedCall'
import { HVAC_LABELS, HVAC_ORDER } from '../lib/hvac'

export interface TileProps {
  meta: EntityMeta
  state: EntityState
  editMode: boolean
  dragging: boolean
  callService: (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>
  onRemove: (entityId: string) => void
  onDragStart: (entityId: string) => void
  onDropOn: (entityId: string) => void
}

interface FrameProps extends TileProps {
  className?: string
  interactive?: boolean
  onActivate?: () => void
  children: ReactNode
}

function TileFrame({
  meta,
  editMode,
  dragging,
  className,
  interactive = true,
  onActivate,
  onRemove,
  onDragStart,
  onDropOn,
  children
}: FrameProps): ReactNode {
  return (
    <div
      className={[
        'tile',
        className ?? '',
        editMode ? 'is-editing' : '',
        dragging ? 'is-dragging' : '',
        interactive && onActivate && !editMode ? 'is-interactive' : ''
      ]
        .filter(Boolean)
        .join(' ')}
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
        if (!editMode) onActivate?.()
      }}
      role={interactive && onActivate ? 'button' : undefined}
      tabIndex={interactive && onActivate && !editMode ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          if (!editMode) {
            event.preventDefault()
            onActivate?.()
          }
        }
      }}
    >
      {editMode && (
        <button
          className="tile__remove"
          title="从面板移除"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(meta.entity_id)
          }}
        >
          <Icon name="minus" size={12} strokeWidth={2.4} />
        </button>
      )}
      {children}
    </div>
  )
}

export function LightTile(props: TileProps): ReactNode {
  const { meta, state, callService, editMode } = props
  const attributes = state.attributes
  const on = state.state === 'on'

  const modes = strArray(attributes.supported_color_modes)
  const supportsBrightness =
    attributes.brightness !== undefined ||
    modes.length === 0 ||
    modes.some((mode) => mode !== 'onoff')
  const supportsTemp =
    attributes.color_temp_kelvin !== undefined ||
    attributes.color_temp !== undefined ||
    attributes.min_color_temp_kelvin !== undefined ||
    modes.includes('color_temp')

  const minKelvin = (() => {
    const direct = num(attributes.min_color_temp_kelvin)
    if (direct) return direct
    const mireds = num(attributes.max_mireds)
    return mireds ? Math.round(1e6 / mireds) : 2000
  })()
  const maxKelvin = (() => {
    const direct = num(attributes.max_color_temp_kelvin)
    if (direct) return direct
    const mireds = num(attributes.min_mireds)
    return mireds ? Math.round(1e6 / mireds) : 6500
  })()

  const serverBrightness = num(attributes.brightness)
  const serverPercent = serverBrightness !== undefined ? Math.round((serverBrightness / 255) * 100) : null
  const serverKelvin =
    num(attributes.color_temp_kelvin) ??
    (num(attributes.color_temp) ? Math.round(1e6 / (num(attributes.color_temp) as number)) : null)

  const [mode, setMode] = useState<'brightness' | 'temp'>(supportsBrightness ? 'brightness' : 'temp')
  const [pendingPercent, setPendingPercent] = useState<number | null>(null)
  const [pendingKelvin, setPendingKelvin] = useState<number | null>(null)
  const debounced = useDebouncedCall(callService)

  useEffect(() => {
    if (pendingPercent === null) return
    const timer = window.setTimeout(() => setPendingPercent(null), 900)
    return () => window.clearTimeout(timer)
  }, [pendingPercent])

  useEffect(() => {
    if (pendingKelvin === null) return
    const timer = window.setTimeout(() => setPendingKelvin(null), 900)
    return () => window.clearTimeout(timer)
  }, [pendingKelvin])

  const percent = pendingPercent ?? serverPercent ?? 100
  const kelvin = pendingKelvin ?? serverKelvin ?? Math.round((minKelvin + maxKelvin) / 2)

  const toggle = (): void => {
    if (on) {
      void callService({ domain: 'light', service: 'turn_off', entityId: meta.entity_id })
    } else {
      void callService({ domain: 'light', service: 'turn_on', entityId: meta.entity_id })
    }
  }

  const showControls = on && (supportsBrightness || supportsTemp)
  const readout = !on
    ? '关闭'
    : mode === 'temp' && supportsTemp
      ? `${kelvin}K`
      : serverPercent !== null
        ? `${percent}%`
        : '开启'

  return (
    <TileFrame
      {...props}
      className={`tile--light ${on ? 'is-on' : 'is-off'}`}
      onActivate={toggle}
    >
      <div className="tile__head">
        <span className="tile__icon">
          <Icon name="bulb" size={18} />
        </span>
        {showControls && supportsBrightness && supportsTemp ? (
          <button
            className="tile__mode"
            onClick={(event) => {
              event.stopPropagation()
              setMode(mode === 'brightness' ? 'temp' : 'brightness')
            }}
          >
            {mode === 'brightness' ? '亮度' : '色温'}
          </button>
        ) : (
          <span className="tile__readout">{readout}</span>
        )}
      </div>
      <div className="tile__name">{meta.name}</div>
      {showControls ? (
        <div className="tile__controls" onClick={(event) => event.stopPropagation()}>
          {mode === 'brightness' ? (
            <input
              className="slider"
              type="range"
              min={1}
              max={100}
              step={1}
              value={percent}
              aria-label="亮度"
              onChange={(event) => {
                const value = Number(event.target.value)
                setPendingPercent(value)
                debounced(120, {
                  domain: 'light',
                  service: 'turn_on',
                  entityId: meta.entity_id,
                  data: { brightness_pct: value }
                })
              }}
            />
          ) : (
            <input
              className="slider"
              type="range"
              min={minKelvin}
              max={maxKelvin}
              step={50}
              value={kelvin}
              aria-label="色温"
              onChange={(event) => {
                const value = Number(event.target.value)
                setPendingKelvin(value)
                debounced(120, {
                  domain: 'light',
                  service: 'turn_on',
                  entityId: meta.entity_id,
                  data: { color_temp_kelvin: value }
                })
              }}
            />
          )}
        </div>
      ) : (
        <div className="tile__controls tile__controls--empty" />
      )}
      {editMode && <span className="tile__grip"><Icon name="drag" size={14} /></span>}
    </TileFrame>
  )
}

export function ClimateTile(props: TileProps): ReactNode {
  const { meta, state, callService, editMode } = props
  const attributes = state.attributes
  const mode = state.state
  const unit = temperatureUnit(attributes)

  const current = num(attributes.current_temperature)
  const serverTarget = num(attributes.temperature)
  const minTemp = num(attributes.min_temp) ?? 7
  const maxTemp = num(attributes.max_temp) ?? 35
  const step = num(attributes.target_temp_step) ?? 0.5
  const modes = strArray(attributes.hvac_modes)
  const visibleModes = HVAC_ORDER.filter((item) => modes.includes(item)).slice(0, 5)

  const [pendingTarget, setPendingTarget] = useState<number | null>(null)
  useEffect(() => {
    setPendingTarget(null)
  }, [serverTarget])

  const target = pendingTarget ?? serverTarget

  const changeTarget = (delta: number): void => {
    if (target == null) return
    const next = clamp(Math.round((target + delta) * 10) / 10, minTemp, maxTemp)
    setPendingTarget(next)
    void callService({
      domain: 'climate',
      service: 'set_temperature',
      entityId: meta.entity_id,
      data: { temperature: next }
    })
  }

  const changeMode = (next: string): void => {
    void callService({
      domain: 'climate',
      service: 'set_hvac_mode',
      entityId: meta.entity_id,
      data: { hvac_mode: next }
    })
  }

  const active = mode !== 'off'

  return (
    <TileFrame {...props} className={`tile--climate ${active ? 'is-on' : 'is-off'}`} interactive={false}>
      <div className="climate__head">
        <div className="climate__current">
          <span className="climate__value">
            {current !== undefined ? Math.round(current * 10) / 10 : '--'}
            {unit}
          </span>
          <span className="climate__label">当前温度</span>
        </div>
        <div className="climate__target" onClick={(event) => event.stopPropagation()}>
          <button className="stepper" onClick={() => changeTarget(-step)} aria-label="降低温度">
            <Icon name="minus" size={14} strokeWidth={2.2} />
          </button>
          <span className="climate__target-value">
            {target !== undefined ? Math.round(target * 10) / 10 : '--'}
            {unit}
          </span>
          <button className="stepper" onClick={() => changeTarget(step)} aria-label="升高温度">
            <Icon name="plus" size={14} strokeWidth={2.2} />
          </button>
        </div>
      </div>
      <div className="climate__footer">
        <span className="tile__name">{meta.name}</span>
        <div className="climate__modes" onClick={(event) => event.stopPropagation()}>
          {visibleModes.map((item) => (
            <button
              key={item}
              className={`chip ${item === mode ? 'is-active' : ''}`}
              onClick={() => changeMode(item)}
            >
              {HVAC_LABELS[item] ?? item}
            </button>
          ))}
        </div>
      </div>
      {editMode && <span className="tile__grip"><Icon name="drag" size={14} /></span>}
    </TileFrame>
  )
}

const SIMPLE_ACTIONS: Record<string, (state: EntityState) => { service: string; data?: Record<string, unknown> }> = {
  switch: () => ({ service: 'toggle' }),
  input_boolean: () => ({ service: 'toggle' }),
  automation: () => ({ service: 'toggle' }),
  fan: () => ({ service: 'toggle' }),
  cover: (state) => ({ service: state.state === 'open' ? 'close_cover' : 'open_cover' }),
  scene: () => ({ service: 'turn_on' }),
  script: () => ({ service: 'turn_on' })
}

export function SimpleTile(props: TileProps): ReactNode {
  const { meta, state, callService, editMode } = props
  const action = SIMPLE_ACTIONS[meta.domain]

  const on =
    state.state === 'on' ||
    state.state === 'open' ||
    (meta.domain === 'script' && state.state === 'on') ||
    (meta.domain === 'scene' && state.state === 'scening')

  const activate = (): void => {
    if (!action) return
    const { service, data } = action(state)
    void callService({ domain: meta.domain, service, entityId: meta.entity_id, data })
  }

  const label = (() => {
    if (meta.domain === 'cover') return state.state === 'open' ? '已打开' : '已关闭'
    if (meta.domain === 'scene') return '场景'
    if (meta.domain === 'script') return state.state === 'on' ? '运行中' : '脚本'
    return on ? '开启' : '关闭'
  })()

  return (
    <TileFrame
      {...props}
      className={`tile--simple ${on ? 'is-on' : 'is-off'} tile--${meta.domain}`}
      onActivate={activate}
      interactive={Boolean(action)}
    >
      <div className="tile__head">
        <span className="tile__icon">
          <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={18} />
        </span>
        <span className="tile__readout">{label}</span>
      </div>
      <div className="tile__name">{meta.name}</div>
      {editMode && <span className="tile__grip"><Icon name="drag" size={14} /></span>}
    </TileFrame>
  )
}

export function SensorTile(props: TileProps): ReactNode {
  const { meta, state, editMode } = props
  const isBinary = meta.domain === 'binary_sensor'
  const isOn = state.state === 'on'

  return (
    <TileFrame
      {...props}
      className={`tile--sensor ${isBinary && isOn ? 'is-on' : 'is-off'}`}
      interactive={false}
    >
      <div className="tile__head">
        <span className="tile__icon">
          <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={16} />
        </span>
        <span className="sensor__value">{formatValue(state)}</span>
      </div>
      <div className="tile__name">{meta.name}</div>
      {editMode && <span className="tile__grip"><Icon name="drag" size={14} /></span>}
    </TileFrame>
  )
}

export function Tile(props: TileProps): ReactNode {
  switch (props.meta.domain) {
    case 'light':
      return <LightTile {...props} />
    case 'climate':
      return <ClimateTile {...props} />
    case 'sensor':
    case 'binary_sensor':
      return <SensorTile {...props} />
    default:
      return <SimpleTile {...props} />
  }
}
