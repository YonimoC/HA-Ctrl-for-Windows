import { useMemo, useState, type ReactNode } from 'react'
import { useHome } from '../home'
import { buildGroups } from '../lib/grouping'
import { AreaSection } from './AreaSection'
import { MacDetail } from './MacDetail'
import { TileEditor } from './TileEditor'
import { Icon } from './Icons'

interface Props {
  editMode: boolean
  onOpenSettings: () => void
  onAdd: (areaKey: string) => void
}

export function Dashboard({ editMode, onOpenSettings, onAdd }: Props): ReactNode {
  const home = useHome()
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editorId, setEditorId] = useState<string | null>(null)

  const groups = useMemo(
    () => buildGroups(home.meta, home.entities, home.areas, home.dashboard, home.overview),
    [home.meta, home.entities, home.areas, home.dashboard, home.overview]
  )

  const findItem = (id: string | null): (typeof groups)[number]['items'][number] | null => {
    if (!id) return null
    for (const group of groups) {
      const found = group.items.find((item) => item.meta.entity_id === id)
      if (found) return found
    }
    return null
  }

  const detailItem = useMemo(() => findItem(detailId), [detailId, groups])
  const editorItem = useMemo(() => findItem(editorId), [editorId, groups])

  const remove = (entityId: string): void => {
    const order: Record<string, string[]> = {}
    for (const [key, ids] of Object.entries(home.dashboard.order)) {
      order[key] = ids.filter((id) => id !== entityId)
    }
    home.updateDashboard({
      ...home.dashboard,
      hidden: [...new Set([...home.dashboard.hidden, entityId])],
      order
    })
  }

  const reorder = (areaKey: string, ids: string[]): void => {
    home.updateDashboard({
      ...home.dashboard,
      order: { ...home.dashboard.order, [areaKey]: ids }
    })
  }

  if (!home.config.url) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <Icon name="home" size={34} />
        </div>
        <h3>还没连接 Home Assistant</h3>
        <p>填好服务器地址和长期访问令牌，面板里就会出现你家里的设备。</p>
        <button className="primary-btn" onClick={onOpenSettings}>
          去设置
        </button>
      </div>
    )
  }

  if (home.status !== 'connected') {
    return (
      <div className="empty">
        <div className={`empty__icon ${home.status === 'error' ? 'is-error' : 'is-pending'}`}>
          <Icon name="refresh" size={30} />
        </div>
        <h3>{home.status === 'error' ? '连接失败' : '正在连接…'}</h3>
        <p>{home.error ?? '正在读取服务器上的实体。'}</p>
        <button className="primary-btn" onClick={onOpenSettings}>
          检查设置
        </button>
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="empty">
        <div className="empty__icon">
          <Icon name="home" size={34} />
        </div>
        <h3>面板还是空的</h3>
        <p>进入编辑模式，把实体添加到面板里。</p>
      </div>
    )
  }

  return (
    <>
      <div className={`dashboard ${editMode ? 'is-editing' : ''}`}>
        {editMode && <div className="edit-hint">点击磁贴可编辑或移除，拖动可排序</div>}
        {home.error && home.status === 'connected' && <div className="banner">{home.error}</div>}
        {groups.map((group) => (
          <AreaSection
            key={group.key}
            group={group}
            editMode={editMode}
            theme={home.ui.theme}
            callService={home.callService}
            onRemove={remove}
            onReorder={reorder}
            onAdd={onAdd}
            onOpen={setDetailId}
            onEdit={setEditorId}
          />
        ))}
      </div>
      {detailItem && home.ui.theme === 'macos' && (
        <MacDetail
          item={detailItem}
          callService={home.callService}
          onClose={() => setDetailId(null)}
        />
      )}
      {editorItem && editMode && (
        <TileEditor
          item={editorItem}
          areas={home.areas}
          dashboard={home.dashboard}
          onSave={home.updateDashboard}
          onClose={() => setEditorId(null)}
        />
      )}
    </>
  )
}
