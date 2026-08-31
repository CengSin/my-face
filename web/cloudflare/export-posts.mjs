import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const input = resolve(process.env.JOURNAL_DB || 'data/journal.sqlite')
const output = resolve('data/cloudflare-posts.local.sql')
const db = new DatabaseSync(input, { readOnly: true })
const columns = ['id', 'title', 'content', 'date', 'weather', 'status', 'created_at', 'updated_at', 'version']
const rows = db.prepare(`SELECT ${columns.join(', ')} FROM posts ORDER BY created_at, id`).all()
db.close()
const literal = (value) => typeof value === 'number' ? String(value) :
  `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`
const sql = rows.map((row) => `INSERT INTO posts (${columns.join(', ')}) VALUES (${columns.map((name) => literal(row[name])).join(', ')}) ON CONFLICT(id) DO NOTHING;`).join('\n')
mkdirSync(resolve('data'), { recursive: true, mode: 0o700 })
writeFileSync(output, sql + '\n', { mode: 0o600 })
console.log(`已导出 ${rows.length} 篇文章到 data/cloudflare-posts.local.sql，不含本地密码或会话。重复导入不会覆盖线上文章。`)
