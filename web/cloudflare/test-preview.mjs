// Disposable local UI fixture: no real key, no real articles, no Cloudflare network bindings.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const directory = mkdtempSync(join(tmpdir(), 'journal-worker-preview-'))
const key = 'p'.repeat(43)
const mf = new Miniflare(convertV4MiniflareOptions({
  host: '127.0.0.1', port: 8787, modules: true,
  scriptPath: resolve('.cloudflare-build/worker.js'),
  compatibilityDate: '2026-08-28',
  resourcePersistencePath: directory,
  telemetry: { enabled: false },
  d1Databases: { DB: 'preview-only' },
  bindings: { ADMIN_KEY_HASH: createHash('sha256').update(key).digest('hex'), ALLOW_LOCAL_DEV: 'true', PUBLIC_ORIGIN: 'http://127.0.0.1:8787' },
  assets: { directory: resolve('dist'), binding: 'ASSETS',
    routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
    assetConfig: { not_found_handling: 'single-page-application' } },
}))
const db = await mf.getD1Database('DB')
const schema = readdirSync('cloudflare/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .flatMap((name) => readFileSync(`cloudflare/migrations/${name}`, 'utf8')
    .split(';').map((s) => s.trim()).filter(Boolean))
await db.batch(schema.map((s) => db.prepare(s)))
console.log('隔离 Cloudflare 预览：http://127.0.0.1:8787；测试口令为 43 个 p，仅此预览有效。')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await mf.dispose()
  rmSync(directory, { recursive: true, force: true })
  process.exit(0)
})
