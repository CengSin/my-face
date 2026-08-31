import { lazy, Suspense, useEffect, useState } from 'react'
import App from './App'
import { api, buildDays, type PostSummary } from './content'

const Admin = lazy(() => import('./Admin'))
const Article = lazy(() => import('./Article'))

function Home() {
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const data = await api<{ posts: PostSummary[] }>('/api/posts')
        if (active) {
          setPosts(data.posts)
          setError('')
        }
      } catch (error) {
        if (active) setError((error as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [retry])
  // Wait for initial data so a date link is resolved against the complete timeline.
  if (loading)
    return (
      <div className="home-loading">
        ✳<p>正在收集今天的天气…</p>
      </div>
    )
  const days = buildDays(posts)
  return (
    <App
      key={days.map((day) => day.id).join(',')}
      moods={days}
      posts={posts}
      articlesError={error}
      onRetry={() => setRetry(retry + 1)}
    />
  )
}

export default function Root() {
  const path = window.location.pathname
  return (
    <Suspense fallback={<div className="home-loading">正在打开这一页…</div>}>
      {/^\/admin\/?$/.test(path) ? (
        <Admin />
      ) : /^\/articles\/[^/]+\/?$/.test(path) ? (
        <Article />
      ) : (
        <Home />
      )}
    </Suspense>
  )
}
