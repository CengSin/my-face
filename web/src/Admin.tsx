import { useEffect, useRef, useState } from 'react'
import {
  api,
  todayDate,
  weatherOptions,
  type Post,
  type PostInput,
  type Session,
} from './content'
import Markdown from './Markdown'
import './writing.css'

const blankPost = (): PostInput => ({
  title: '',
  content: '',
  date: todayDate(),
  weather: 'sunny',
  status: 'draft',
})
const sameContent = (a: PostInput, b: PostInput) =>
  a.title === b.title &&
  a.content === b.content &&
  a.date === b.date &&
  a.weather === b.weather &&
  a.status === b.status

function Login({
  session,
  onSuccess,
  inline = false,
}: {
  session: Session
  onSuccess: () => void
  inline?: boolean
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setup = !session.configured
  const accessKey = session.authMode === 'access-key'
  return (
    <form
      className={inline ? 'reauth-form' : 'login-card'}
      onSubmit={async (event) => {
        event.preventDefault()
        setError('')
        if (setup && password !== confirmation) {
          setError('两次输入的密码不一致。')
          return
        }
        setBusy(true)
        try {
          await api(setup ? '/api/setup' : '/api/login', {
            method: 'POST',
            body: JSON.stringify({ password }),
          })
          setPassword('')
          onSuccess()
        } catch (error) {
          setError((error as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <span className="writing-mark" aria-hidden="true">
        ✳
      </span>
      <p className="writing-eyebrow">YOUR PRIVATE WRITING ROOM</p>
      <h1>{setup ? '给小岛配一把钥匙。' : '欢迎回到写作室。'}</h1>
      <p className="writing-description">
        {accessKey
          ? '使用部署时生成的 Cloudflare 后台口令，继续写下今天。'
          : setup
          ? '第一次使用，先设置只属于你的后台密码。'
          : '这里存放还没说完的话，和已经写下的日子。'}
      </p>
      {setup && !session.canSetup ? (
        <p role="alert">{accessKey ? '请先通过部署工具配置 Cloudflare 后台口令，本站不开放注册。' : '请先在本机开发模式设置密码，再开放线上访问。'}</p>
      ) : (
        <>
          <label>
            {accessKey ? 'Cloudflare 后台口令' : '后台密码'}
            <input
              type="password"
              autoComplete={setup ? 'new-password' : 'current-password'}
              minLength={12}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={accessKey ? '粘贴部署时生成的 43 位口令' : '至少 12 个字符'}
            />
          </label>
          {setup && (
            <label>
              再输入一次
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="确认后台密码"
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button" disabled={busy}>
            {busy ? '正在打开…' : setup ? '设置密码，开始写作' : '进入写作室'}{' '}
            <span aria-hidden="true">↗</span>
          </button>
        </>
      )}
      {!inline && (
        <a className="quiet-link" href="/">
          ← 先回小岛看看
        </a>
      )}
    </form>
  )
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [draft, setDraft] = useState<PostInput>(blankPost)
  const [saved, setSaved] = useState<PostInput>(blankPost)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [pane, setPane] = useState<'write' | 'preview' | 'split'>('split')
  const [reauth, setReauth] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const confirmRef = useRef<HTMLDialogElement>(null)
  const pendingAction = useRef<(() => void) | null>(null)
  const dirty = !sameContent(draft, saved)

  async function load() {
    try {
      const next = await api<Session>('/api/session')
      setSession(next)
      if (next.authenticated)
        setPosts((await api<{ posts: Post[] }>('/api/admin/posts')).posts)
      setError('')
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setLoading(false)
    }
  }
  // Synchronize with the server session; this is not state derived from rendering.
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    void load()
  }, [])
  useEffect(() => {
    if (!dirty) return
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  function choose(next: PostInput) {
    const action = () => {
      setDraft(next)
      setSaved(next)
      setError('')
      setNotice('')
    }
    if (dirty) {
      pendingAction.current = action
      confirmRef.current?.showModal()
    } else action()
  }
  function update<K extends keyof PostInput>(key: K, value: PostInput[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setNotice('')
  }
  async function save(status: PostInput['status']) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { post } = await api<{ post: Post }>(
        draft.id ? `/api/admin/posts/${draft.id}` : '/api/admin/posts',
        {
          method: draft.id ? 'PUT' : 'POST',
          body: JSON.stringify({ ...draft, status }),
        },
      )
      setDraft(post)
      setSaved(post)
      setPosts((previous) => [
        post,
        ...previous.filter((item) => item.id !== post.id),
      ])
      setNotice(
        status === 'published'
          ? '已发布，首页这一天的文章与天气已更新。'
          : '草稿已保存，仅你可见。',
      )
    } catch (error) {
      setError((error as Error).message)
      try {
        const current = await api<Session>('/api/session')
        if (!current.authenticated) {
          setSession(current)
          setReauth(true)
        }
      } catch {
        /* Preserve all editor state on network failure. */
      }
    } finally {
      setBusy(false)
    }
  }
  function insert(before: string, after = '', fallback = '文字') {
    const textarea = textRef.current
    if (!textarea) {
      setPane('write')
      return
    }
    const start = textarea.selectionStart,
      end = textarea.selectionEnd
    const selection = draft.content.slice(start, end) || fallback
    update(
      'content',
      draft.content.slice(0, start) +
        before +
        selection +
        after +
        draft.content.slice(end),
    )
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selection.length,
      )
    })
  }
  const shown = posts.filter(
    (post) =>
      (filter === 'all' || post.status === filter) &&
      post.title.toLowerCase().includes(search.toLowerCase()),
  )

  if (loading && !session)
    return <div className="writing-loading">正在打开写作室…</div>
  if (!session)
    return (
      <div className="login-page">
        <p role="alert">{error}</p>
        <button className="primary-button" onClick={load}>
          重新连接
        </button>
        <a href="/">返回首页</a>
      </div>
    )
  if (!session.authenticated && !reauth)
    return (
      <div className="login-page">
        <Login session={session} onSuccess={load} />
      </div>
    )

  return (
    <div className="admin-page">
      <header className="writing-header">
        <a className="writing-brand" href="/">
          ✳{' '}
          <span>
            今天的天气<small>THE WRITING ROOM</small>
          </span>
        </a>
        <div className="writing-header-actions">
          <a href="/" target="_blank" rel="noreferrer">
            看看小岛 ↗
          </a>
          <button
            onClick={() => {
              const action = async () => {
                try {
                  await api('/api/logout', { method: 'POST' })
                  setSession({ ...session, authenticated: false })
                  setDraft(blankPost())
                  setSaved(blankPost())
                  setPosts([])
                } catch (error) {
                  setError((error as Error).message)
                }
              }
              if (dirty) {
                pendingAction.current = action
                confirmRef.current?.showModal()
              } else void action()
            }}
          >
            退出登录
          </button>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="post-sidebar">
          <div className="sidebar-title">
            <h2>
              我的文章 <span>{posts.length}</span>
            </h2>
            <button
              className="new-post-button"
              onClick={() => choose(blankPost())}
            >
              ＋ 写一篇
            </button>
          </div>
          <input
            className="post-search"
            aria-label="搜索文章标题"
            placeholder="搜索写下的日子…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="post-filters" aria-label="文章状态筛选">
            {[
              ['all', '全部'],
              ['published', '已发布'],
              ['draft', '草稿'],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="post-list">
            {shown.length ? (
              shown.map((post) => (
                <button
                  key={post.id}
                  className={`post-list-item ${draft.id === post.id ? 'selected' : ''}`}
                  onClick={() => choose(post)}
                >
                  <span className="post-list-date">
                    {post.date}
                    <span>
                      {
                        weatherOptions.find(
                          (option) => option.value === post.weather,
                        )?.symbol
                      }
                    </span>
                  </span>
                  <strong>{post.title}</strong>
                  <small>
                    <span className={`post-status ${post.status}`}>
                      {post.status === 'published' ? '已发布' : '草稿'}
                    </span>
                  </small>
                </button>
              ))
            ) : (
              <div className="sidebar-empty">
                <span>一页空白，也很好。</span>
                <p>
                  {search || filter !== 'all'
                    ? '没有符合条件的文章。'
                    : '从第一篇文章开始，收集你的天气。'}
                </p>
              </div>
            )}
          </div>
          <p className="sidebar-footnote">
            文章保存到服务器数据库。
            <br />
            草稿只在你的写作室里可见。
          </p>
        </aside>
        <main className="editor-main">
          <div className="editor-heading">
            <div>
              <p className="writing-eyebrow">A SMALL NOTE TO THE WORLD</p>
              <h1>{draft.id ? '继续这一页。' : '今天，想写点什么？'}</h1>
            </div>
            <span className={`save-state ${dirty ? 'unsaved' : ''}`}>
              {busy
                ? '保存中…'
                : dirty
                  ? '● 尚未保存'
                  : draft.id
                    ? '✓ 已保存'
                    : '新的一页'}
            </span>
          </div>
          {reauth && (
            <section className="reauth-panel">
              <p>登录已过期，编辑内容已保留。重新登录后即可继续保存。</p>
              <Login
                inline
                session={session}
                onSuccess={() => {
                  setSession({ ...session, authenticated: true })
                  setReauth(false)
                  setError('')
                  setNotice('已重新登录，可继续保存。')
                }}
              />
            </section>
          )}
          <fieldset className="editor-fields" disabled={busy || reauth}>
            <label className="title-label">
              <span className="sr-only">文章标题</span>
              <input
                className="title-input"
                value={draft.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="给这一天起个标题…"
                maxLength={120}
              />
            </label>
            <div className="entry-settings">
              <label className="date-field">
                记录日期
                <input
                  type="date"
                  required
                  value={draft.date}
                  onChange={(event) => update('date', event.target.value)}
                />
              </label>
              <fieldset className="weather-picker">
                <legend>此刻的心情</legend>
                {weatherOptions.map((option) => (
                  <label
                    key={option.value}
                    className={draft.weather === option.value ? 'chosen' : ''}
                  >
                    <input
                      type="radio"
                      name="weather"
                      value={option.value}
                      checked={draft.weather === option.value}
                      onChange={() => update('weather', option.value)}
                    />
                    <span aria-hidden="true">{option.symbol}</span>
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </div>
            <p className="weather-rule">
              同一天有多篇文章时，小岛天气取最近更新的已发布文章心情。
            </p>
            <div className="editor-workspace">
              <div className="editor-toolbar">
                <div className="format-actions">
                  <button
                    type="button"
                    title="加粗"
                    aria-label="插入加粗"
                    onClick={() => insert('**', '**')}
                  >
                    <b>B</b>
                  </button>
                  <button
                    type="button"
                    title="标题"
                    aria-label="插入二级标题"
                    onClick={() => insert('\n## ', '\n', '小标题')}
                  >
                    H₂
                  </button>
                  <button
                    type="button"
                    aria-label="插入引用"
                    onClick={() => insert('\n> ', '\n', '引用')}
                  >
                    ❞
                  </button>
                  <button
                    type="button"
                    aria-label="插入链接"
                    onClick={() =>
                      insert('[', '](https://example.com)', '链接文字')
                    }
                  >
                    ↗
                  </button>
                  <button
                    type="button"
                    aria-label="插入列表"
                    onClick={() => insert('\n- ', '\n', '列表项')}
                  >
                    ☷
                  </button>
                </div>
                <div className="editor-tabs">
                  {[
                    ['write', '写作'],
                    ['split', '对照'],
                    ['preview', '预览'],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={pane === value}
                      onClick={() => setPane(value as typeof pane)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`editor-panes pane-${pane}`}>
                {pane !== 'preview' && (
                  <textarea
                    ref={textRef}
                    className="markdown-input"
                    aria-label="Markdown 正文"
                    spellCheck={false}
                    value={draft.content}
                    onChange={(event) => update('content', event.target.value)}
                    placeholder={
                      '从这里开始，慢慢写。\n\n## 今天的小事\n\n用 **加粗** 留下重点，\n用 > 引用收藏一句话。\n\nMarkdown 会把这些文字变成一篇文章。'
                    }
                    maxLength={100000}
                  />
                )}
                {pane !== 'write' && (
                  <section className="markdown-preview" aria-label="文章预览">
                    {draft.content ? (
                      <Markdown>{draft.content}</Markdown>
                    ) : (
                      <div className="preview-empty">
                        <span>✳</span>
                        <p>
                          文字在左边生长，
                          <br />
                          故事在这里成形。
                        </p>
                      </div>
                    )}
                  </section>
                )}
              </div>
              <div className="editor-bottomline">
                <span>MARKDOWN · 支持标题、列表、代码与表格</span>
                <span>{draft.content.length.toLocaleString()} 字符</span>
              </div>
            </div>
            <div className="editor-savebar">
              <div>
                <span className="post-status">
                  {draft.status === 'published'
                    ? '这篇文章已公开'
                    : '未发布前，仅你可见'}
                </span>
                {draft.id && (
                  <small>
                    最后保存{' '}
                    {new Date((saved as Post).updated_at).toLocaleString(
                      'zh-CN',
                    )}
                  </small>
                )}
              </div>
              <div className="save-buttons">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => save('draft')}
                >
                  {draft.status === 'published' ? '转为草稿' : '保存草稿'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => save('published')}
                >
                  {busy
                    ? '保存中…'
                    : draft.status === 'published'
                      ? '更新文章'
                      : '发布文章'}{' '}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="save-notice" role="status">
              {notice}
              {draft.status === 'published' && (
                <a
                  href={`/?date=${draft.date}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看这一天 ↗
                </a>
              )}
            </p>
          )}
        </main>
      </div>
      <dialog
        ref={confirmRef}
        className="unsaved-dialog"
        aria-labelledby="unsaved-title"
      >
        <h2 id="unsaved-title">这页还有未保存的文字。</h2>
        <p>要先留在这里保存，还是放弃未保存的修改？</p>
        <div>
          <button
            className="secondary-button"
            onClick={() => confirmRef.current?.close()}
          >
            继续写作
          </button>
          <button
            className="primary-button"
            onClick={() => {
              confirmRef.current?.close()
              pendingAction.current?.()
              pendingAction.current = null
            }}
          >
            放弃修改并继续
          </button>
        </div>
      </dialog>
    </div>
  )
}
