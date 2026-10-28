import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useHome } from '../home'

const STATUS_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中…',
  disconnected: '未连接',
  error: '连接失败'
}

function tokenPageUrl(url: string): string | null {
  if (!url) return null
  const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`
  try {
    const parsed = new URL(normalized)
    return `${parsed.origin}/profile/security`
  } catch {
    return null
  }
}

export function SettingsView(): ReactNode {
  const home = useHome()
  const [url, setUrl] = useState(home.config.url)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setUrl(home.config.url)
  }, [home.config.url])

  // Keep the panel open while editing: a click elsewhere would otherwise hide it.
  useEffect(() => {
    window.api.setPinned(true)
    return () => window.api.setPinned(false)
  }, [])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const result = await home.saveConfig({
      url: url.trim(),
      token: token.trim() ? token.trim() : undefined
    })
    setBusy(false)
    if (result.ok) {
      setToken('')
      setMessage('已保存，正在连接…')
    } else {
      setMessage(result.error ?? '保存失败')
    }
  }

  const link = tokenPageUrl(home.config.url)

  return (
    <form className="settings" onSubmit={submit}>
      <div className="status-line">
        <span className={`status-dot status-${home.status}`} />
        <span>{STATUS_LABEL[home.status] ?? home.status}</span>
        {home.error && <span className="status-line__error">{home.error}</span>}
      </div>

      <section className="card">
        <div className="card__row">
          <span className="card__row-label">界面风格</span>
          <div className="segmented segmented--compact">
            <button
              type="button"
              className={home.ui.theme === 'windows' ? 'is-active' : ''}
              onClick={() => home.updateUi({ theme: 'windows' })}
            >
              Windows
            </button>
            <button
              type="button"
              className={home.ui.theme === 'macos' ? 'is-active' : ''}
              onClick={() => home.updateUi({ theme: 'macos' })}
            >
              macOS
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h3 className="card__title">连接</h3>

        <label className="field">
          <span className="field__label">服务器地址</span>
          <input
            className="field__input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="http://homeassistant.local:8123"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>

        <label className="field">
          <span className="field__label">长期访问令牌</span>
          <input
            className="field__input"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={home.config.hasToken ? '已保存，留空则不修改' : '粘贴长期访问令牌'}
            spellCheck={false}
          />
        </label>

        <div className="card__actions">
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? '保存中…' : '保存并连接'}
          </button>
          {message && <span className="card__message">{message}</span>}
        </div>

        <p className="hint">
          在 Home Assistant 的「个人资料 → 安全 → 长期访问令牌」里创建。
          {link && (
            <>
              {' '}
              <a href={link} target="_blank" rel="noreferrer">
                打开令牌页面
              </a>
            </>
          )}
        </p>
      </section>

      <div className="settings__footer">
        <button type="button" className="link-btn" onClick={home.refresh}>
          重新连接
        </button>
        <span className="sep">·</span>
        <span>Ctrl + Alt + H 打开面板</span>
      </div>
    </form>
  )
}
