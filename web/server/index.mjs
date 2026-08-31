import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJournalServer } from './app.mjs'

const projectDir = fileURLToPath(new URL('../', import.meta.url))
const production = process.env.NODE_ENV === 'production'
const publicOrigin = process.env.PUBLIC_ORIGIN
if (
  production &&
  (!publicOrigin || new URL(publicOrigin).protocol !== 'https:')
) {
  throw new Error('生产模式需设置 HTTPS PUBLIC_ORIGIN，并在反向代理后运行。')
}
const origins = publicOrigin
  ? [new URL(publicOrigin).origin]
  : [
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:4173',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:4173',
    ]
const server = createJournalServer({
  dbPath: resolve(
    process.env.JOURNAL_DB || resolve(projectDir, 'data/journal.sqlite'),
  ),
  origins,
  production,
  staticDir: resolve(projectDir, 'dist'),
})
const port = Number(process.env.API_PORT || 4301)
server.listen(port, '127.0.0.1', () =>
  console.log(`Journal API ready at http://127.0.0.1:${port}`),
)
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => process.exit(0)))
