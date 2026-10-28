import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ServiceCall, UiTheme } from '@shared/types'
import { Tile } from './Tiles'
import { MacTile } from './MacTile'
import { formatValue, type GroupedArea } from '../lib/grouping'
import { str } from '../lib/util'
import { Icon, iconFor } from './Icons'

interface Props {
  group: GroupedArea
  editMode: boolean
  theme: UiTheme
  callService: (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>
  onRemove: (entityId: string) => void
  onReorder: (areaKey: string, ids: string[]) => void
  onAdd: (areaKey: string) => void
  onOpen: (entityId: string) => void
  onEdit: (entityId: string) => void
}

export function AreaSection({
  group,
  editMode,
  theme,
  callService,
  onRemove,
  onReorder,
  onAdd,
  onOpen,
  onEdit
}: Props): ReactNode {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [stuck, setStuck] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // Only show the header backdrop while content is scrolling underneath it.
  useEffect(() => {
    const sentinel = sentinelRef.current
    const header = headerRef.current
    if (!sentinel || !header) return
    const root = header.closest('.content')
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { root, threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  const handleDrop = (targetId: string): void => {
    const from = dragId
    setDragId(null)
    setOverId(null)
    if (!from || from === targetId) return
    const ids = group.items.map((item) => item.meta.entity_id)
    const fromIndex = ids.indexOf(from)
    const toIndex = ids.indexOf(targetId)
    if (fromIndex < 0 || toIndex < 0) return
    ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, from)
    onReorder(group.key, ids)
  }

  // Read-only readings move into the room header: they are status, not controls.
  // While editing they sit in their own row above the controls.
  const isReading = (domain: string): boolean =>
    domain === 'sensor' || domain === 'binary_sensor'
  const readings = group.items.filter((item) => isReading(item.meta.domain))
  const controls = group.items.filter((item) => !isReading(item.meta.domain))
  const showStrip = !editMode
  const shownReadings = showStrip ? readings.slice(0, 3) : []
  const extraReadings = readings.length - shownReadings.length

  return (
    <section className="area">
      <div className="area__sentinel" ref={sentinelRef} />
      <div className={`area__header ${stuck ? 'is-stuck' : ''}`} ref={headerRef}>
        <h2 className="area__title">{group.name}</h2>
        {shownReadings.length > 0 && (
          <div className="area__sensors">
            {shownReadings.map(({ meta, state }) => (
              <span className="area__sensor" key={meta.entity_id} title={meta.name}>
                <Icon name={iconFor(meta.domain, str(state.attributes.device_class))} size={12} />
                {formatValue(state)}
              </span>
            ))}
            {extraReadings > 0 && (
              <span className="area__sensor area__sensor--more">+{extraReadings}</span>
            )}
          </div>
        )}
        {editMode && (
          <button className="area__add" onClick={() => onAdd(group.key)} title="添加实体">
            <Icon name="plus" size={13} strokeWidth={2.2} />
            添加
          </button>
        )}
      </div>
      {editMode && readings.length > 0 && (
        <div className="tiles tiles--readings">
          {readings.map(({ meta, state }) => (
            <div
              key={meta.entity_id}
              className={[
                'tile-slot',
                overId === meta.entity_id && dragId && dragId !== meta.entity_id ? 'is-over' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={() => setOverId(meta.entity_id)}
              onDragLeave={() => setOverId((current) => (current === meta.entity_id ? null : current))}
            >
              {theme === 'macos' ? (
                <MacTile
                  compact
                  item={{ meta, state }}
                  editMode={editMode}
                  dragging={dragId === meta.entity_id}
                  callService={callService}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onDragStart={(entityId) => setDragId(entityId)}
                  onDropOn={handleDrop}
                />
              ) : (
                <Tile
                  meta={meta}
                  state={state}
                  editMode={editMode}
                  dragging={dragId === meta.entity_id}
                  callService={callService}
                  onEdit={onEdit}
                  onRemove={onRemove}
                  onDragStart={(entityId) => setDragId(entityId)}
                  onDropOn={handleDrop}
                />
              )}
            </div>
          ))}
        </div>
      )}
      {controls.length > 0 && (
        <div className="tiles">
          {controls.map(({ meta, state }) => (
          <div
            key={meta.entity_id}
            className={[
              'tile-slot',
              meta.domain === 'climate' ? 'tile-slot--wide' : '',
              overId === meta.entity_id && dragId && dragId !== meta.entity_id ? 'is-over' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onDragOver={() => setOverId(meta.entity_id)}
            onDragLeave={() => setOverId((current) => (current === meta.entity_id ? null : current))}
          >
            {theme === 'macos' ? (
              <MacTile
                item={{ meta, state }}
                editMode={editMode}
                dragging={dragId === meta.entity_id}
                callService={callService}
                onOpen={onOpen}
                onEdit={onEdit}
                onRemove={onRemove}
                onDragStart={(entityId) => setDragId(entityId)}
                onDropOn={handleDrop}
              />
            ) : (
              <Tile
                meta={meta}
                state={state}
                editMode={editMode}
                dragging={dragId === meta.entity_id}
                callService={callService}
                onEdit={onEdit}
                onRemove={onRemove}
                onDragStart={(entityId) => setDragId(entityId)}
                onDropOn={handleDrop}
              />
            )}
          </div>
          ))}
        </div>
      )}
    </section>
  )
}
