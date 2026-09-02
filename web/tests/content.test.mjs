import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from '../src/Markdown.tsx'
import { safeMarkdownUrl } from '../src/markdown-url.ts'
import { buildDays, todayDate, readingMinutes } from '../src/content.ts'
import { validateImage } from '../shared/images.mjs'

test('today always has an empty entry and latest published update decides daily mood', () => {
  const posts = [
    {
      id: 'old',
      date: '2026-08-30',
      weather: 'sunny',
      updated_at: '2026-08-30T10:00:00Z',
    },
    {
      id: 'new',
      date: '2026-08-30',
      weather: 'storm',
      updated_at: '2026-08-30T12:00:00Z',
    },
    {
      id: 'history',
      date: '2026-08-20',
      weather: 'cloudy',
      updated_at: '2026-08-30T13:00:00Z',
    },
  ]
  assert.equal(buildDays([], '2026-08-30')[0].weatherLabel, '待记录')
  const days = buildDays(posts, '2026-08-30')
  assert.equal(days[0].weather, 'storm')
  assert.equal(days.filter((day) => day.id === '2026-08-30').length, 1)
  assert.equal(days.at(-1).id, '2026-08-20')
  assert.equal(todayDate(new Date(2026, 7, 30, 23, 59)), '2026-08-30')
  assert.equal(readingMinutes(0), 1)
})

test('Markdown supports GFM while scripts, raw HTML and unsafe URLs stay inert', () => {
  const html = renderToStaticMarkup(
    createElement(
      Markdown,
      null,
      '## 标题\n\n**加粗**\n\n- [x] 完成\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst a = 1\n```\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n[坏链接](javascript:alert%281%29)',
    ),
  )
  assert.match(html, /<h2>标题<\/h2>/)
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.match(html, /<table>/)
  assert.match(html, /type="checkbox"/)
  assert.match(html, /<pre>/)
  assert.doesNotMatch(html, /<script|onerror|href="javascript:/)
  for (const unsafe of [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///etc/passwd',
    '//evil.example',
    'vbscript:test',
  ])
    assert.equal(safeMarkdownUrl(unsafe), '')
  assert.equal(safeMarkdownUrl('https://example.com'), 'https://example.com')
  const localImage = renderToStaticMarkup(
    createElement(Markdown, null, '![海边](/api/images/123e4567-e89b-12d3-a456-426614174000)'),
  )
  assert.match(localImage, /<img src="\/api\/images\//)
})

test('uploaded images are identified by file signature, not only the request header', () => {
  assert.equal(
    validateImage(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]), 'image/jpeg'),
    'image/jpeg',
  )
  assert.throws(
    () => validateImage(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), 'image/png'),
    /仅支持 JPEG、PNG、GIF 或 WebP/,
  )
  const oversized = new Uint8Array(1_500_001)
  oversized.set([0xff, 0xd8, 0xff])
  assert.throws(() => validateImage(oversized, 'image/jpeg'), /不能超过 1.5 MB/)
})
