import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { weatherIndex, type Weather, type Mood } from './moods'
import { readingMinutes, todayDate, type PostSummary } from './content'
import {
  clampProgress,
  readHashProgress,
  sampleProgress,
  splitLine,
  weekdayFor,
} from './journal'

const WeatherWorld = lazy(() => import('./world/WeatherWorld'))

function WeatherIcon({
  weather,
  className = '',
}: {
  weather: Weather
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {weather === 'sunny' ? (
        <>
          <circle cx="16" cy="16" r="6" />
          <path d="M16 3v3m0 20v3M3 16h3m20 0h3M6.8 6.8 9 9m14 14 2.2 2.2M6.8 25.2 9 23M23 9l2.2-2.2" />
        </>
      ) : (
        <>
          {weather === 'cloudy' && (
            <>
              <circle cx="11" cy="11" r="5" />
              <path d="M11 2v2M2 11h2m.5-6.5L6 6M18 4l-1.5 1.5" />
            </>
          )}
          <path d="M9 24a6 6 0 0 1-.5-12 8 8 0 0 1 15.2 2A5 5 0 0 1 24 24H9Z" />
          {weather === 'storm' && <path d="m17 20-4 6h5l-3 5" />}
        </>
      )}
    </svg>
  )
}

function Arrow({ up = false }: { up?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      style={up ? { transform: 'rotate(180deg)' } : undefined}
    >
      <path d="M12 4v15m-6-6 6 6 6-6" />
    </svg>
  )
}

export default function App({
  moods,
  posts,
  articlesError,
  onRetry,
}: {
  moods: Mood[]
  posts: PostSummary[]
  articlesError: string
  onRetry: () => void
}) {
  const initialProgress = () => {
    const date = new URLSearchParams(window.location.search).get('date')
    const index = moods.findIndex((mood) => mood.id === date)
    return index >= 0
      ? index
      : readHashProgress(window.location.hash, moods.length)
  }
  const [progress, setProgress] = useState(() => initialProgress())
  const [paused, setPaused] = useState(false)
  const startingProgress = useRef(progress)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const dialogRef = useRef<HTMLDialogElement>(null)
  const aboutRef = useRef<HTMLButtonElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const { from, to, fraction, active } = sampleProgress(progress, moods.length)
  const mood = moods[active]
  const dayPosts = posts.filter((post) => post.date === mood.id)
  const isToday = mood.id === todayDate()
  const [headline, aside] = splitLine(mood.line)
  const weather =
    weatherIndex[moods[from].weather] * (1 - fraction) +
    weatherIndex[moods[to].weather] * fraction

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    let frame = 0
    let height = window.innerHeight || 1
    const initial = startingProgress.current
    document.documentElement.style.setProperty('--page-height', `${height}px`)
    window.scrollTo({ top: initial * height, behavior: 'instant' })
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setProgress(clampProgress(window.scrollY / height, moods.length))
      })
    }
    const onHash = () =>
      window.scrollTo({
        top: readHashProgress(window.location.hash, moods.length) * height,
        behavior: 'instant',
      })
    const onResize = () => {
      const current = clampProgress(window.scrollY / height, moods.length)
      height = window.innerHeight || 1
      document.documentElement.style.setProperty('--page-height', `${height}px`)
      window.scrollTo({ top: current * height, behavior: 'instant' })
      onScroll()
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.addEventListener('hashchange', onHash)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('hashchange', onHash)
    }
  }, [moods.length])

  const goTo = (index: number) => {
    frameRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo({
      top: index * window.innerHeight,
      behavior: reducedMotion ? 'instant' : 'smooth',
    })
  }

  return (
    <div className={`app theme-${mood.weather}`}>
      <div className="page-frame" ref={frameRef}>
        <header className="site-header">
          <button
            className="brand"
            onClick={() => goTo(0)}
            aria-label="今天的天气，返回最新心情"
          >
            <span className="brand-mark">
              <WeatherIcon weather="sunny" />
            </span>
            <span>
              今天的天气
              <span className="brand-sub">A PERSONAL WEATHER JOURNAL</span>
            </span>
          </button>
          <div className="header-right">
            <span className="header-note">每一种心情，都有它的天气。</span>
            <a className="write-entry-link" href="/admin">
              写作室 <span aria-hidden="true">↗</span>
            </a>
            <button
              ref={aboutRef}
              className="about-button"
              onClick={() => dialogRef.current?.showModal()}
            >
              关于这里 <span aria-hidden="true">↗</span>
            </button>
          </div>
        </header>

        <main className="journal" aria-label="心情手记">
          <div className="journal-copy" aria-live="polite" aria-atomic="false">
            <div className="eyebrow">
              <span className="status-dot" />
              日子有晴，也有阴
              <span className="edition">
                VOL. {String(active + 1).padStart(2, '0')}
              </span>
            </div>
            <div className="entry" key={mood.id} aria-atomic="true">
              <p className="entry-date">
                <time dateTime={mood.id}>{mood.date}</time>
                <span>/</span>
                {weekdayFor(mood.id)}
                <span className="latest-label">
                  {isToday ? '今天' : active === 0 ? '最近的一天' : '往日心情'}
                </span>
              </p>
              <h1>{headline}</h1>
              <p className="entry-aside">{aside}</p>
              <div className="mood-stamp">
                <WeatherIcon weather={mood.weather} />
                <span>
                  心情天气
                  <span className="stamp-weather">{mood.weatherLabel}</span>
                </span>
                <span className="stamp-line" />
                <span className="stamp-note">{mood.note}</span>
              </div>
            </div>
            <section className="daily-posts" aria-label={`${mood.date}的文章`}>
              <div className="daily-posts-heading">
                <h2>{isToday ? '今天的文字' : '这一天的文字'}</h2>
                <span>{dayPosts.length} 篇手记</span>
              </div>
              {articlesError ? (
                <div className="daily-empty">
                  <p role="alert">文章暂时无法加载。</p>
                  <button onClick={onRetry}>重新连接</button>
                </div>
              ) : dayPosts.length ? (
                <div className="daily-post-links">
                  {dayPosts.map((post) => (
                    <a href={`/articles/${post.id}`} key={post.id}>
                      <span className="post-link-title">{post.title}</span>
                      <span className="post-link-time">
                        {readingMinutes(post.characters)} 分钟{' '}
                        <span aria-hidden="true">↗</span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="daily-empty">
                  <p>这一天，还没有公开的文字。</p>
                  <a href="/admin">去写下这一页 ↗</a>
                </div>
              )}
            </section>
            <div className="copy-bottom">
              <span className="handwritten">天气会变，心情也是。</span>
              <button
                className="turn-page"
                aria-label={
                  active === moods.length - 1
                    ? '回到最近的一天'
                    : '往下翻，看看前几天'
                }
                onClick={() =>
                  goTo(active === moods.length - 1 ? 0 : active + 1)
                }
              >
                <span className="arrow-circle">
                  <Arrow up={active === moods.length - 1} />
                </span>
                <span>
                  {active === moods.length - 1
                    ? '回到最近的一天'
                    : '往下翻，看看前几天'}
                  <small>
                    {active === moods.length - 1
                      ? '每一天，都值得被记录'
                      : 'SCROLL TO WANDER'}
                  </small>
                </span>
              </button>
            </div>
          </div>

          <div
            className="scene-panel"
            role="region"
            aria-label={`${mood.weatherLabel}天的心情小岛，可拖动旋转`}
          >
            <div className="scene-halo" />
            <div className="scene-top">
              <span className="scene-label">
                <span className="status-dot" />
                我的心情小岛
              </span>
              <span className="scene-coordinate">拖动旋转 · DRAG TO LOOK AROUND</span>
            </div>
            <Suspense
              fallback={<div className="world-loading">小岛正在醒来…</div>}
            >
              <WeatherWorld
                weather={weather}
                paused={paused || reducedMotion}
              />
            </Suspense>
            <div className="scene-caption">
              <span className="scene-weather">
                <WeatherIcon weather={mood.weather} />
                <span>
                  {mood.weatherLabel}
                  <small>{mood.english}</small>
                </span>
              </span>
              <button
                className="motion-button"
                aria-label={
                  reducedMotion
                    ? '已跟随系统减少动态效果'
                    : paused
                      ? '播放天气动效'
                      : '暂停天气动效'
                }
                aria-pressed={paused || reducedMotion}
                disabled={reducedMotion}
                onClick={() => setPaused(!paused)}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  {paused || reducedMotion ? (
                    <path d="m7 4 9 6-9 6Z" />
                  ) : (
                    <path d="M7 4v12m6-12v12" />
                  )}
                </svg>
              </button>
            </div>
            <span className="scene-footnote">
              不是天气预报，是我的内心实况。
            </span>
          </div>
        </main>

        <section className="archive" aria-label="往日心情">
          <div className="archive-heading">
            <span>
              心情存档 <small>THE PAST DAYS</small>
            </span>
            <span>
              {String(active + 1).padStart(2, '0')}
              <span className="archive-total">
                {' '}
                / {String(moods.length).padStart(2, '0')}
              </span>
            </span>
          </div>
          <nav className="days" aria-label="按日期浏览心情">
            {moods.map((item, i) => (
              <button
                key={item.id}
                className={`day ${i === active ? 'is-active' : ''}`}
                onClick={() => goTo(i)}
                aria-current={i === active ? 'date' : undefined}
                aria-label={`${item.date}，${item.weatherLabel}：${item.line}`}
              >
                <span className="day-top">
                  <span className="day-date">
                    {item.date}
                    <small>{weekdayFor(item.id)}</small>
                  </span>
                  <WeatherIcon weather={item.weather} />
                </span>
                <span className="day-line">{splitLine(item.line)[0]}</span>
                <span
                  className="day-progress"
                  style={{ transform: `scaleX(${i === active ? 1 : 0})` }}
                />
              </button>
            ))}
          </nav>
        </section>

        <footer className="site-footer">
          <span>
            一个人的天气，<span>也是生活的痕迹。</span>
          </span>
          <span>
            不必每天晴朗 <span aria-hidden="true">✳</span>
          </span>
        </footer>
      </div>
      <div
        className="scroll-track"
        style={{ height: `calc(var(--page-height, 100svh) * ${moods.length})` }}
        aria-hidden="true"
      />
      <dialog
        ref={dialogRef}
        className="about-dialog"
        aria-labelledby="about-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dialogRef.current?.close()
          }
        }}
        onClose={() => aboutRef.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close()
        }}
      >
        <div className="dialog-inner">
          <WeatherIcon weather="sunny" />
          <p className="eyebrow">ABOUT THIS LITTLE PLACE</p>
          <h2 id="about-title">不必每天晴朗。</h2>
          <p>
            这是一个个人心情网站。把说不清的心情，留给晴天、多云、阴天和雷暴。
          </p>
          <p>
            往下翻，或点击日期，走进另一天的小岛。这里不预报天气，只记录自己。
          </p>
          <button
            autoFocus
            className="dialog-close"
            onClick={() => dialogRef.current?.close()}
          >
            回到小岛 <span aria-hidden="true">↗</span>
          </button>
        </div>
      </dialog>
    </div>
  )
}
