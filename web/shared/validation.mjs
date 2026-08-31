export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const weathers = new Set(['sunny', 'cloudy', 'overcast', 'storm'])

export function validatePost(input) {
  if (!input || typeof input !== 'object')
    throw new HttpError(400, '文章格式不正确。')
  const { title, content, date, weather, status } = input
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120)
    throw new HttpError(400, '标题需为 1–120 个字符。')
  if (typeof content !== 'string' || content.length > 100000)
    throw new HttpError(400, '正文不能超过 100,000 个字符。')
  if (!['draft', 'published'].includes(status))
    throw new HttpError(400, '请选择草稿或发布。')
  if (status === 'published' && !content.trim())
    throw new HttpError(400, '写一点正文再发布吧。')
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  ) throw new HttpError(400, '请选择有效的日期。')
  if (!weathers.has(weather)) throw new HttpError(400, '请选择一种心情天气。')
  return { title: title.trim(), content, date, weather, status }
}
