import { useEffect, useState, type ReactNode } from 'react'
import type { ServiceCall } from '@shared/types'
import type { EntityItem } from '../lib/grouping'
import { formatValue } from '../lib/grouping'
import { Icon, iconFor } from './Icons'
import { clamp, num, str, strArray, temperatureUnit } from '../lib/util'
import { HVAC_LABELS, HVAC_ORDER } from '../lib/hvac'
import { useDebouncedCall } from '../lib/useDebouncedCall'
import { macTileState } from './MacTile'

type CallService = (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>

interface DetailProps {
  item: EntityItem
  callService: CallService
  onClose: () => void
}

function MacSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}): ReactNode {
  return (
    <div className="mac-detail__group">
      <div className="mac-detail__rowhead">
        <span>{label}</span>
        <span className="mac-detail__value">
          {Math.round(value * 10) / 10}
          {unit}
        </span>
      </div>
      <input
        className="mac-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

function useServerSyncedValue(server: number | undefined): [number | null, (value: number | null) => void] {
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    setPending(null)
  }, [server])
  return [pending, setPending]
}

function LightControls({ item, callService }: { item: EntityItem; callService: CallService }): ReactNode {
  const { meta, state } = item
  const attributes = state.attributes
  const on = state.state === 'on'
  const modes = strArray(attributes.supported_color_modes)
  const supportsBrightness =
    attributes.brightness !== undefined || modes.length === 0 || modes.some((mode) => mode !== 'onoff')
  const supportsTemp =
    attributes.color_temp_kelvin !== undefined ||
    attributes.color_temp !== undefined ||
    attributes.min_color_temp_kelvin !== undefined ||
    modes.includes('color_temp')

  const serverPercent = (() => {
    const value = num(attributes.brightness)
    return value === undefined ? undefined : Math.round((value / 255) * 100)
  })()
  const serverKelvin =
    num(attributes.color_temp_kelvin) ??
    (num(attributes.color_temp) ? Math.round(1e6 / (num(attributes.color_temp) as number)) : undefined)

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

  const [pendingPercent, setPendingPercent] = useServerSyncedValue(serverPercent)
  const [pendingKelvin, setPendingKelvin] = useServerSyncedValue(serverKelvin)
  const debounced = useDebouncedCall(callService)

  const percent = pendingPercent ?? serverPercent ?? 100
  const kelvin = pendingKelvin ?? serverKelvin ?? Math.round((minKelvin + maxKelvin) / 2)

  return (
    <>
      <button
        className={`mac-detail__power ${on ? 'is-on' : ''}`}
        onClick={() =>
          void callService({
            domain: 'light',
            service: on ? 'turn_off' : 'turn_on',
            entityId: meta.entity_id
          })
        }
      >
        {on ? '关闭' : '开启'}
      </button>
      {on && supportsBrightness && (
        <MacSlider
          label="亮度"
          value={percent}
          min={1}
          max={100}
          step={1}
          unit="%"
          onChange={(value) => {
            setPendingPercent(value)
            debounced(120, {
              domain: 'light',
              service: 'turn_on',
              entityId: meta.entity_id,
              data: { brightness_pct: value }
            })
          }}
        />
      )}
      {on && supportsTemp && (
        <MacSlider
          label="色温"
          value={kelvin}
          min={minKelvin}
          max={maxKelvin}
          step={50}
          unit="K"
          onChange={(value) => {
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
    </>
  )
}

function ClimateControls({ item, callService }: { item: EntityItem; callService: CallService }): ReactNode {
  const { meta, state } = item
  const attributes = state.attributes
  const unit = temperatureUnit(attributes)
  const mode = state.state

  const current = num(attributes.current_temperature)
  const serverTarget = num(attributes.temperature)
  const minTemp = num(attributes.min_temp) ?? 7
  const maxTemp = num(attributes.max_temp) ?? 35
  const step = num(attributes.target_temp_step) ?? 0.5
  const modes = strArray(attributes.hvac_modes)
  const visibleModes = HVAC_ORDER.filter((entry) => modes.includes(entry)).slice(0, 5)

  const [pendingTarget, setPendingTarget] = useServerSyncedValue(serverTarget)
  const debounced = useDebouncedCall(callService)
  const target = pendingTarget ?? serverTarget ?? minTemp

  return (
    <>
      <div className="mac-detail__reading">
        <span className="mac-detail__reading-value">
          {current !== undefined ? Math.round(current * 10) / 10 : '--'}
          {unit}
        </span>
        <span className="mac-detail__reading-label">当前温度</span>
      </div>
      <MacSlider
        label="目标温度"
        value={clamp(target, minTemp, maxTemp)}
        min={minTemp}
        max={maxTemp}
        step={step}
        unit={unit}
        onChange={(value) => {
          setPendingTarget(value)
          debounced(120, {
            domain: 'climate',
            service: 'set_temperature',
            entityId: meta.entity_id,
            data: { temperature: value }
          })
        }}
      />
      <div className="mac-detail__chips">
        {visibleModes.map((entry) => (
          <button
            key={entry}
            className={`chip ${entry === mode ? 'is-active' : ''}`}
            onClick={() =>
              void callService({
                domain: 'climate',
                service: 'set_hvac_mode',
                entityId: meta.entity_id,
                data: { hvac_mode: entry }
              })
            }
          >
            {HVAC_LABELS[entry] ?? entry}
          </button>
        ))}
      </div>
    </>
  )
}

function CoverControls({ item, callService }: { item: EntityItem; callService: CallService }): ReactNode {
  const { meta, state } = item
  const position = num(state.attributes.current_position)
  const [pendingPosition, setPendingPosition] = useServerSyncedValue(position)
  const debounced = useDebouncedCall(callService)

  if (position === undefined) {
    const open = state.state === 'open'
    return (
      <button
        className={`mac-detail__power ${open ? 'is-on' : ''}`}
        onClick={() =>
          void callService({
            domain: 'cover',
            service: open ? 'close_cover' : 'open_cover',
            entityId: meta.entity_id
          })
        }
      >
        {open ? '关闭' : '打开'}
      </button>
    )
  }

  return (
    <MacSlider
      label="开合度"
      value={pendingPosition ?? position}
      min={0}
      max={100}
      step={1}
      unit="%"
      onChange={(value) => {
        setPendingPosition(value)
        debounced(120, {
          domain: 'cover',
          service: 'set_cover_position',
          entityId: meta.entity_id,
          data: { position: value }
        })
      }}
    />
  )
}

function FanControls({ item, callService }: { item: EntityItem; callService: CallService }): ReactNode {
  const { meta, state } = item
  const on = state.state === 'on'
  const percentage = num(state.attributes.percentage)
  const [pendingPercentage, setPendingPercentage] = useServerSyncedValue(percentage)
  const debounced = useDebouncedCall(callService)

  return (
    <>
      <button
        className={`mac-detail__power ${on ? 'is-on' : ''}`}
        onClick={() =>
          void callService({ domain: 'fan', service: 'toggle', entityId: meta.entity_id })
        }
      >
        {on ? '关闭' : '开启'}
      </button>
      {on && percentage !== undefined && (
        <MacSlider
          label="风速"
          value={pendingPercentage ?? percentage}
          min={0}
          max={100}
          step={1}
          unit="%"
          onChange={(value) => {
            setPendingPercentage(value)
            debounced(120, {
              domain: 'fan',
              service: 'set_percentage',
              entityId: meta.entity_id,
              data: { percentage: value }
            })
          }}
        />
      )}
    </>
  )
}

function ToggleControls({ item, callService }: { item: EntityItem; callService: CallService }): ReactNode {
  const { meta, state } = item
  const on = state.state === 'on'

  if (meta.domain === 'scene' || meta.domain === 'script') {
    return (
      <button
        className="mac-detail__power"
        onClick={() =>
          void callService({ domain: meta.domain, service: 'turn_on', entityId: meta.entity_id })
        }
      >
        执行
      </button>
    )
  }

  return (
    <button
      className={`mac-detail__power ${on ? 'is-on' : ''}`}
      onClick={() =>
        void callService({ domain: meta.domain, service: 'toggle', entityId: meta.entity_id })
      }
    >
      {on ? '关闭' : '开启'}
    </button>
  )
}

export function MacDetail({ item, callService, onClose }: DetailProps): ReactNode {
  const { meta, state } = item
  const domain = meta.domain

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const controls = (() => {
    if (domain === 'light') return <LightControls item={item} callService={callService} />
    if (domain === 'climate') return <ClimateControls item={item} callService={callService} />
    if (domain === 'cover') return <CoverControls item={item} callService={callService} />
    if (domain === 'fan') return <FanControls item={item} callService={callService} />
    if (domain === 'sensor' || domain === 'binary_sensor') {
      return (
        <div className="mac-detail__reading">
          <span className="mac-detail__reading-value">{formatValue(state)}</span>
          <span className="mac-detail__reading-label">传感器读数</span>
        </div>
      )
    }
    return <ToggleControls item={item} callService={callService} />
  })()

  return (
    <div className="mac-detail" onClick={onClose}>
      <div className="mac-detail__card" onClick={(event) => event.stopPropagation()}>
        <div className="mac-detail__head">
          <span className="mac-detail__icon">
            <Icon name={iconFor(domain, str(state.attributes.device_class))} size={24} />
          </span>
          <div className="mac-detail__titles">
            <div className="mac-detail__name">{meta.name}</div>
            <div className="mac-detail__state">{macTileState(item)}</div>
          </div>
          <button className="mac-detail__close" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="mac-detail__body">{controls}</div>
      </div>
    </div>
  )
}
