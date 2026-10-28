import { useState, type ReactNode } from 'react'
import type { ServiceCall, UiTheme } from '@shared/types'
import { Tile } from './Tiles'
import { MacTile } from './MacTile'
import type { GroupedArea } from '../lib/grouping'
import { Icon } from './Icons'

interface Props {
  group: GroupedArea
  editMode: boolean
  theme: UiTheme
  callService: (call: ServiceCall) => Promise<{ ok: boolean; error?: string }>
  onRemove: (entityId: string) => void
  onReorder: (areaKey: string, ids: string[]) => void
  onAdd: (areaKey: string) => void
  onOpen: (entityId: string) => void
}

export function AreaSection({
  group,
  editMode,
  theme,
  callService,
  onRemove,
  onReorder,
  onAdd,
  onOpen
}: Props): ReactNode {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

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

  return (
    <section className="area">
      <div className="area__header">
        <h2 className="area__title">{group.name}</h2>
        {editMode && (
          <button className="area__add" onClick={() => onAdd(group.key)} title="添加实体">
            <Icon name="plus" size={13} strokeWidth={2.2} />
            添加
          </button>
        )}
      </div>
      <div className="tiles">
        {group.items.map(({ meta, state }) => (
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
                onRemove={onRemove}
                onDragStart={(entityId) => setDragId(entityId)}
                onDropOn={handleDrop}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
