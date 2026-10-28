import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const [backdropLum, setBackdropLum] = useState<number | null>(null)

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

  useEffect(
    () =>
      window.api.onBackdrop((dataUrl) => {
        setBackdrop(dataUrl)
        const image = new Image()
        image.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const context = canvas.getContext('2d')
          if (!context) return
          context.drawImage(image, 0, 0, 1, 1)
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data
          setBackdropLum((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
        }
        image.src = dataUrl
      }),
    []
  )

  // Thicken the panel when the glass sits over a backdrop of the opposite tone,
  // the way macOS vibrancy keeps text legible on any wallpaper.
  const darkUi = window.matchMedia('(prefers-color-scheme: dark)').matches
  const lum = backdropLum ?? (darkUi ? 0.15 : 0.85)
  const bgAlpha = darkUi
    ? Math.min(0.96, Math.max(0.9, 0.9 + (lum - 0.45) * 0.4))
    : Math.min(0.96, Math.max(0.88, 0.88 + (0.5 - lum) * 0.5))

  const headerRef = useRef<HTMLElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const lastHeight = useRef(0)

  useEffect(() => {
    // Wait for the first snapshot: sizing an empty panel would shrink the
    // window and then stretch it once data arrives.
    if (!home.loaded) return
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
  }, [home.loaded])

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
      <div
        className={`panel theme-${home.ui.theme}`}
        style={{ '--bg-alpha': bgAlpha } as CSSProperties}
      >
        {home.ui.theme === 'macos' && backdrop && (
          <div
            className="panel__backdrop"
            style={{ backgroundImage: `url(${backdrop})` }}
            aria-hidden="true"
          />
        )}
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
