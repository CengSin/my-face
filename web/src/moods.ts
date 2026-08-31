export type Weather = 'sunny' | 'cloudy' | 'overcast' | 'storm'

export type Mood = {
  id: string
  date: string
  weather: Weather
  weatherLabel: string
  line: string
  note: string
  english: string
}

export const weatherIndex: Record<Weather, number> = {
  sunny: 0,
  cloudy: 1,
  overcast: 2,
  storm: 3,
}

export const moods: Mood[] = [
  {
    id: '2026-08-29',
    date: '8月29日',
    weather: 'sunny',
    weatherLabel: '晴',
    line: '今天刚刚好。除非你还有未读消息。',
    note: '适合发一会儿呆',
    english: 'A LITTLE SUNSHINE',
  },
  {
    id: '2026-08-28',
    date: '8月28日',
    weather: 'cloudy',
    weatherLabel: '多云',
    line: '云压得很低。我也是，别问。',
    note: '暂时不想营业',
    english: 'A LITTLE CLOUDY',
  },
  {
    id: '2026-08-27',
    date: '8月27日',
    weather: 'overcast',
    weatherLabel: '阴',
    line: '就让天阴着吧。我懒得解释。',
    note: '允许自己放个空',
    english: 'A QUIET GREY DAY',
  },
  {
    id: '2026-08-26',
    date: '8月26日',
    weather: 'storm',
    weatherLabel: '雷暴',
    line: '心里有点闷。你要是来劝，门没开。',
    note: '等这一阵雨过去',
    english: 'LET IT RAIN',
  },
]
