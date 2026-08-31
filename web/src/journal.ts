export function clampProgress(value: number, count: number) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(value, Math.max(0, count - 1)))
    : 0
}

export function readHashProgress(hash: string, count: number) {
  return clampProgress(Number(hash.replace(/^#/, '')), count)
}

export function sampleProgress(progress: number, count: number) {
  const value = clampProgress(progress, count)
  const from = Math.floor(value)
  return {
    from,
    to: Math.min(from + 1, Math.max(0, count - 1)),
    fraction: value - from,
    active: Math.round(value),
  }
}

export function splitLine(line: string) {
  const index = line.indexOf('。')
  return index < 0
    ? [line, '']
    : [line.slice(0, index + 1), line.slice(index + 1)]
}

export function weekdayFor(date: string) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][
    new Date(`${date}T12:00:00Z`).getUTCDay()
  ]
}
