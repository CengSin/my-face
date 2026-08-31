// Disposable local UI fixture. All records live in memory, never in data/journal.sqlite.
import { createJournalServer } from './app.mjs'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'

const server = createJournalServer({
  dbPath: ':memory:',
  origins: ['http://localhost:4302'],
  staticDir: fileURLToPath(new URL('../dist', import.meta.url)),
})
server.listen(4302, '127.0.0.1')
await once(server, 'listening')
const origin = 'http://127.0.0.1:4302'
const headers = {
  'Content-Type': 'application/json',
  'X-Journal-Request': '1',
  Origin: origin,
}
// Synthetic credential for this isolated fixture only. Never accepted by the real backend.
const response = await fetch(origin + '/api/setup', {
  method: 'POST',
  headers,
  body: JSON.stringify({ password: 'local-fixture-weather-2026' }),
})
if (!response.ok) throw new Error('Fixture setup failed')
headers.Cookie = response.headers.get('set-cookie').split(';')[0]
await fetch(origin + '/api/admin/posts', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    title: '一小段晴朗的日子',
    date: '2026-08-29',
    weather: 'sunny',
    status: 'published',
    content:
      '## 慢慢生活\n\n今天的阳光落在窗边。\n\n> 不必每天晴朗，但可以记住这一刻。\n\n- 一杯热茶\n- 一本读到一半的书\n\n这是一篇仅用于验收的示例文章。',
  }),
})
console.log(
  'Isolated UI fixture ready at http://localhost:4302 (in-memory data)',
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)))
