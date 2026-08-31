import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampProgress,
  readHashProgress,
  sampleProgress,
  splitLine,
  weekdayFor,
} from '../src/journal.ts'
import { moods, weatherIndex } from '../src/moods.ts'

test('scroll progress is bounded and non-finite input is safe', () => {
  assert.equal(clampProgress(-1, 4), 0)
  assert.equal(clampProgress(99, 4), 3)
  assert.equal(clampProgress(Infinity, 4), 0)
  assert.equal(clampProgress(NaN, 4), 0)
})
test('legacy hash deep links are supported and clamped', () => {
  for (const [hash, expected] of [
    ['', 0],
    ['#2', 2],
    ['#1.5', 1.5],
    ['#99', 3],
    ['#-2', 0],
    ['#bad', 0],
  ]) {
    assert.equal(readHashProgress(hash, 4), expected)
  }
})
test('weather interpolation is continuous while only one entry is active', () => {
  assert.deepEqual(sampleProgress(1.4, 4), {
    from: 1,
    to: 2,
    fraction: 1.4 - 1,
    active: 1,
  })
  assert.equal(sampleProgress(1.5, 4).active, 2)
  assert.deepEqual(sampleProgress(3, 4), {
    from: 3,
    to: 3,
    fraction: 0,
    active: 3,
  })
  assert.deepEqual(sampleProgress(0, 1), {
    from: 0,
    to: 0,
    fraction: 0,
    active: 0,
  })
})
test('headlines preserve the complete original entry text', () => {
  for (const mood of moods)
    assert.equal(splitLine(mood.line).join(''), mood.line)
  assert.deepEqual(splitLine('没有标点的日子'), ['没有标点的日子', ''])
})
test('weekdays match the actual dates, independently of local timezone', () => {
  assert.deepEqual(
    moods.map((mood) => weekdayFor(mood.id)),
    ['周六', '周五', '周四', '周三'],
  )
})
test('all dates and weather types are valid and unique', () => {
  assert.equal(new Set(moods.map((mood) => mood.id)).size, moods.length)
  for (const mood of moods) {
    assert.ok(Number.isFinite(Date.parse(mood.id)))
    assert.ok(weatherIndex[mood.weather] >= 0)
    assert.ok(mood.note && mood.english)
  }
})
