import { useEffect, useState } from 'react'
import { api, readingMinutes, weatherOptions, type Post } from './content'
import Markdown from './Markdown'
import './writing.css'

export default function Article() {
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const id = window.location.pathname.split('/').filter(Boolean).at(-1)
    api<{ post: Post }>(`/api/posts/${encodeURIComponent(id || '')}`)
      .then(({ post }) => {
        if (active) {
          setPost(post)
          setError('')
          document.title = `${post.title} · 今天的天气`
        }
      })
      .catch((error) => {
        if (active) setError(error.message)
      })
    return () => {
      active = false
    }
  }, [retry])
  const mood = weatherOptions.find((option) => option.value === post?.weather)
  return (
    <div className="reader-page">
      <header className="writing-header">
        <a className="writing-brand" href="/">
          ✳{' '}
          <span>
            今天的天气<small>A PERSONAL WEATHER JOURNAL</small>
          </span>
        </a>
        <a className="reader-back" href={post ? `/?date=${post.date}` : '/'}>
          ← 回到这一天
        </a>
      </header>
      <main className="reader-paper">
        {error ? (
          <div className="reader-error">
            <h1>这一页暂时打不开。</h1>
            <p role="alert">{error}</p>
            <button
              className="secondary-button"
              onClick={() => setRetry(retry + 1)}
            >
              重试
            </button>
          </div>
        ) : post ? (
          <article>
            <div className="reader-meta">
              <time dateTime={post.date}>{post.date}</time>
              <span>·</span>
              <span>
                {mood?.symbol} {mood?.label}
              </span>
              <span>·</span>
              <span>约 {readingMinutes(post.content.length)} 分钟</span>
            </div>
            <h1>{post.title}</h1>
            <div className="reader-divider" />
            <Markdown>{post.content}</Markdown>
            <footer className="reader-footer">
              <span>
                写在 {post.date}，心情是{mood?.label}。
              </span>
              <a href={`/?date=${post.date}`}>回到小岛 ↗</a>
            </footer>
          </article>
        ) : (
          <p className="writing-loading">正在打开这一页…</p>
        )}
      </main>
      <p className="reader-motto">天气会变，留下的文字不会。</p>
    </div>
  )
}
