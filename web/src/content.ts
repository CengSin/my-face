import { moods, type Mood, type Weather } from './moods'

export type PostSummary = {
  id: string
  title: string
  date: string
  weather: Weather
  updated_at: string
  characters: number
}
export type Post = Omit<PostSummary, 'characters'> & {
  content: string
  status: 'draft' | 'published'
  created_at: string
  version: number
}
export type PostInput = Pick<
  Post,
  'title' | 'content' | 'date' | 'weather' | 'status'
> & { id?: string; version?: number }
export type Session = {
  configured: boolean
  authenticated: boolean
  canSetup?: boolean
  authMode?: 'access-key'
}
export type UploadedImage = {
  id: string
  url: string
  mime_type: string
  size: number
}

export const weatherOptions = [
  {
    value: 'sunny' as const,
    label: '晴',
    description: '心里有光',
    symbol: '☀',
    english: 'A LITTLE SUNSHINE',
  },
  {
    value: 'cloudy' as const,
    label: '多云',
    description: '思绪飘飘',
    symbol: '☁',
    english: 'A LITTLE CLOUDY',
  },
  {
    value: 'overcast' as const,
    label: '阴',
    description: '想静一静',
    symbol: '☂',
    english: 'A QUIET GREY DAY',
  },
  {
    value: 'storm' as const,
    label: '雷暴',
    description: '等雨过去',
    symbol: 'ϟ',
    english: 'LET IT RAIN',
  },
]

export function todayDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function buildDays(posts: PostSummary[], today = todayDate()): Mood[] {
  const days = new Map(moods.map((mood) => [mood.id, mood]))
  if (!days.has(today))
    days.set(today, {
      id: today,
      date: formatDate(today),
      weather: 'sunny',
      weatherLabel: '待记录',
      line: '今天，留一点空白。写下故事，让心情有个地方停留。',
      note: '等待今天的第一篇文章',
      english: 'A DAY TO BEGIN',
    })
  const latest = [...posts].sort(
    (a, b) =>
      b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id),
  )
  const visited = new Set<string>()
  for (const post of latest) {
    if (visited.has(post.date)) continue
    visited.add(post.date)
    const option = weatherOptions.find(
      (option) => option.value === post.weather,
    )!
    const original = days.get(post.date)
    days.set(post.date, {
      id: post.date,
      date: formatDate(post.date),
      weather: post.weather,
      weatherLabel: option.label,
      line:
        original && moods.some((mood) => mood.id === post.date)
          ? original.line
          : `${option.description}。把这一天，慢慢写下来。`,
      note: '心情来自这一天的文章',
      english: option.english,
    })
  }
  return [...days.values()].sort((a, b) => b.id.localeCompare(a.id))
}

export function formatDate(date: string) {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}
export function readingMinutes(characters: number) {
  return Math.max(1, Math.ceil(characters / 500))
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Journal-Request': '1',
        ...options.headers,
      },
    })
  } catch {
    throw new Error(
      '暂时连接不到文章服务，请确认后台服务已启动。你的编辑内容仍在。',
    )
  }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data)
    throw new Error(data?.error || '文章服务暂时不可用，请稍后再试。')
  return data as T
}
