import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useHome } from './home'
import { Dashboard } from './components/Dashboard'
import { SettingsView } from './components/SettingsView'
import { AddEntitySheet } from './components/AddEntitySheet'
import { Icon } from './components/Icons'

type View = 'home' | 'settings' | 'add'

export default function App(): ReactNode {
  const home = useHome()
  const [view, setView] = useState<View>('home')
  const [editMode, setEditMode] = useState(false)
  const [addArea, setAddArea] = useState<string | null>(null)
  const [panelKey, setPanelKey] = useState(0)

  // Reopening the panel always lands on the dashboard, like a fresh popover.
  useEffect(
    () =>
      window.api.onShown(() => {
        setView('home')
        setEditMode(false)
        setPanelKey((key) => key + 1)
      }),
    []
  )

  const headerRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const lastHeight = useRef(0)

  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return

    let timer: number | null = null

    const send = (): void => {
      const header = headerRef.current
      const node = innerRef.current
      if (!header || !node) return
      const height = Math.round(header.offsetHeight + node.getBoundingClientRect().height + 2)
      // Ignore sub-pixel churn so live entity updates cannot make the window twitch.
      if (Math.abs(height - lastHeight.current) < 4) return
      lastHeight.current = height
      window.api.setContentHeight(height)
    }

    const schedule = (): void => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(send, 140)
    }

    send()
    const observer = new ResizeObserver(schedule)
    observer.observe(inner)
    return () => {
      observer.disconnect()
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (view !== 'home') {
        setView('home')
        setEditMode(false)
      } else if (editMode) {
        setEditMode(false)
      } else {
        home.hide()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, editMode, home])

  const openAdd = (areaKey: string | null): void => {
    setAddArea(areaKey)
    setView('add')
  }

  return (
    <div className="shell">
      <div className={`panel theme-${home.ui.theme}`}>
        <header className="header" ref={headerRef}>
          {view === 'home' ? (
            <>
              <span
                className={`status-dot status-${home.status}`}
                title={home.error ?? undefined}
              />
              <h1 className="header__title">家庭</h1>
              <div className="header__actions">
                <button
                  className={`text-btn ${editMode ? 'is-active' : ''}`}
                  onClick={() => setEditMode((value) => !value)}
                >
                  {editMode ? '完成' : '编辑'}
                </button>
                <button
                  className="icon-btn"
                  title="设置"
                  onClick={() => setView('settings')}
                >
                  <Icon name="gear" size={15} />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                className="icon-btn"
                title="返回"
                onClick={() => {
                  setView('home')
                  setEditMode(false)
                }}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <h1 className="header__title">
                {view === 'settings' ? '设置' : '添加实体'}
              </h1>
              <div className="header__actions">
                {view === 'settings' && (
                  <button className="icon-btn" title="重新连接" onClick={home.refresh}>
                    <Icon name="refresh" size={15} />
                  </button>
                )}
                {view === 'add' && (
                  <button className="text-btn is-active" onClick={() => setView('home')}>
                    完成
                  </button>
                )}
              </div>
            </>
          )}
        </header>

        <div className="content">
          <div className="content__inner" ref={innerRef}>
            {view === 'home' && (
              <Dashboard
                key={panelKey}
                editMode={editMode}
                onOpenSettings={() => setView('settings')}
                onAdd={openAdd}
              />
            )}
            {view === 'settings' && <SettingsView />}
            {view === 'add' && <AddEntitySheet areaKey={addArea} />}
          </div>
        </div>
      </div>
    </div>
  )
}
