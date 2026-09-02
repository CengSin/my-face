import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync, readdirSync, mkdtempSync, rmSync, mkdirSync, statSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'

const origin = 'https://journal.example'
const key = randomBytes(32).toString('base64url')
const keyHash = createHash('sha256').update(key).digest('hex')
const schema = readdirSync('cloudflare/migrations')
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .flatMap((name) => readFileSync(`cloudflare/migrations/${name}`, 'utf8')
    .split(';').map((s) => s.trim()).filter(Boolean))
async function start(directory, secret = keyHash) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: resolve('.cloudflare-build/worker.js'),
    compatibilityDate: '2026-08-28',
    d1Databases: { DB: 'journal-tests' },
    resourcePersistencePath: directory,
    telemetry: { enabled: false },
    bindings: { ADMIN_KEY_HASH: secret, PUBLIC_ORIGIN: origin },
    assets: {
      directory: resolve('dist'), binding: 'ASSETS',
      routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
      assetConfig: { not_found_handling: 'single-page-application' },
    },
  }))
  const db = await mf.getD1Database('DB')
  await db.batch(schema.map((s) => db.prepare(s)))
  let cookie = ''
  return {
    mf, db,
    get cookie() { return cookie },
    async request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
      const response = await mf.dispatchFetch(origin + path, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Journal-Request': '1',
          'CF-Connecting-IP': '192.0.2.10', ...(auth ? { Cookie: cookie } : {}), ...headers },
        ...(body !== undefined ? { body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
      })
      if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0]
      const type = response.headers.get('Content-Type') || ''
      return { status: response.status, headers: response.headers,
        data: type.includes('json') ? await response.json()
          : type.startsWith('image/') ? new Uint8Array(await response.arrayBuffer())
          : await response.text() }
    },
  }
}
const input = { title: '隔离测试日记', content: '## 晚风\n\n**很好**，一切都慢下来。', weather: 'cloudy', date: '2026-08-30', status: 'draft' }

test('real Worker/D1: login, private drafts, publish, conflict, restart, revoke and logout', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'journal-worker-test-'))
  let app = await start(directory)
  t.after(async () => { await app.mf.dispose(); rmSync(directory, { recursive: true, force: true }) })
  assert.equal((await app.request('/api/session')).data.authMode, 'access-key')
  assert.equal((await app.request('/api/setup', { method: 'POST', body: { password: key } })).status, 403)
  assert.equal((await app.request('/api/admin/posts')).status, 401)
  const login = await app.request('/api/login', { method: 'POST', body: { password: key } })
  assert.equal(login.status, 200)
  assert.match(login.headers.get('Set-Cookie'), /^__Host-journal_session=/)
  assert.match(login.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict; Max-Age=43200; Secure/)
  assert.equal((await app.request('/api/session')).data.authenticated, true)
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  assert.equal((await app.request('/api/admin/images', { method: 'POST', auth: false,
    body: png, headers: { 'Content-Type': 'image/png' } })).status, 401)
  const upload = await app.request('/api/admin/images', { method: 'POST', body: png,
    headers: { 'Content-Type': 'image/png' } })
  assert.equal(upload.status, 201)
  const publicImage = await app.request(upload.data.image.url, { auth: false })
  assert.equal(publicImage.status, 200)
  assert.equal(publicImage.headers.get('Content-Type'), 'image/png')
  assert.deepEqual(publicImage.data, png)
  assert.equal((await app.request('/api/admin/images', { method: 'POST',
    body: new Uint8Array([0x3c, 0x73, 0x76, 0x67]), headers: { 'Content-Type': 'image/png' } })).status, 415)
  const draft = (await app.request('/api/admin/posts', { method: 'POST', body: input })).data.post
  assert.equal(draft.version, 1)
  assert.deepEqual((await app.request('/api/posts', { auth: false })).data.posts, [])
  assert.equal((await app.request(`/api/posts/${draft.id}`, { auth: false })).status, 404)
  assert.equal((await app.request('/api/admin/posts', { auth: false })).status, 401)
  for (const patch of [{ date: '2026-02-30' }, { title: '' }, { status: 'oops' }, { weather: 'tornado' },
    { content: 'x'.repeat(100001) }, { title: 'x'.repeat(121) }, { content: '', status: 'published' }])
    assert.equal((await app.request('/api/admin/posts', { method: 'POST', body: { ...input, ...patch } })).status, 400)
  assert.equal((await app.request('/api/admin/posts', { method: 'POST', body: '{oops' })).status, 400)
  assert.equal((await app.request('/api/admin/posts', { method: 'POST', body: 'x'.repeat(450001) })).status, 413)
  assert.equal((await app.request('/api/admin/posts', { method: 'POST', body: input, headers: { Origin: 'https://attacker.example' } })).status, 403)
  assert.equal((await app.request('/api/logout', { method: 'POST', headers: { 'X-Journal-Request': '' } })).status, 403)
  const hostile = await app.mf.dispatchFetch('https://attacker.example/api/session')
  assert.equal(hostile.status, 403)
  await hostile.text()
  const results = await Promise.all([1, 2].map(() => app.request(`/api/admin/posts/${draft.id}`, {
    method: 'PUT', body: { ...input, status: 'published', version: 1 },
  })))
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
  const feed = (await app.request('/api/posts', { auth: false })).data.posts
  assert.equal(feed.length, 1)
  assert.ok(!('content' in feed[0]))
  assert.equal((await app.request(`/api/posts/${draft.id}`, { auth: false })).data.post.content, input.content)
  const savedCookie = app.cookie
  await app.mf.dispose()
  app = await start(directory)
  assert.equal((await app.request('/api/posts')).data.posts.length, 1)
  assert.equal((await app.request(upload.data.image.url, { auth: false })).status, 200)
  assert.equal((await app.request('/api/session', { headers: { Cookie: savedCookie } })).data.authenticated, true)
  await app.request('/api/login', { method: 'POST', body: { password: key } })
  assert.equal((await app.request(`/api/admin/posts/${draft.id}`, { method: 'PUT', body: { ...input, version: 2 } })).status, 200)
  assert.deepEqual((await app.request('/api/posts', { auth: false })).data.posts, [])
  assert.equal((await app.request(`/api/posts/${draft.id}`, { auth: false })).status, 404)
  await app.request('/api/logout', { method: 'POST' })
  assert.equal((await app.request('/api/session', { headers: { Cookie: savedCookie } })).data.authenticated, true)
  assert.equal((await app.request('/api/admin/posts')).status, 401)
  const stored = await app.db.prepare('SELECT token FROM sessions LIMIT 1').first()
  assert.notEqual(stored?.token, savedCookie.split('=')[1])
  await app.mf.dispose()
  app = await start(directory, createHash('sha256').update('rotated-key').digest('hex'))
  assert.equal((await app.request('/api/session', { headers: { Cookie: savedCookie } })).data.authenticated, false)
})

test('D1 login rate limit is atomic and survives Worker restart', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'journal-limit-test-'))
  let app = await start(directory)
  t.after(async () => { await app.mf.dispose(); rmSync(directory, { recursive: true, force: true }) })
  const wrongKey = randomBytes(32).toString('base64url')
  const results = await Promise.all(Array.from({ length: 12 }, () => app.request('/api/login', { method: 'POST', body: { password: wrongKey } })))
  assert.equal(results.filter((r) => r.status === 401).length, 8)
  assert.equal(results.filter((r) => r.status === 429).length, 4)
  await app.mf.dispose()
  app = await start(directory)
  assert.equal((await app.request('/api/login', { method: 'POST', body: { password: key } })).status, 429)
  await app.db.prepare('UPDATE login_attempts SET expires = 0').run()
  assert.equal((await app.request('/api/login', { method: 'POST', body: { password: key } })).status, 200)
})

test('SPA routes and absolute sharing metadata; unconfigured owner fails closed', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'journal-assets-test-'))
  const app = await start(directory, '')
  t.after(async () => { await app.mf.dispose(); rmSync(directory, { recursive: true, force: true }) })
  assert.equal((await app.request('/api/session')).data.configured, false)
  assert.equal((await app.request('/api/login', { method: 'POST', body: { password: key } })).status, 503)
  for (const path of ['/', '/admin', '/articles/example']) {
    const page = await app.request(path, { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } })
    assert.equal(page.status, 200)
    assert.match(page.data, /property="og:image" content="https:\/\/journal.example\/og-image.jpg"/)
    assert.match(page.data, /name="twitter:image" content="https:\/\/journal.example\/og-image.jpg"/)
    assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff')
  }
  assert.equal((await app.request('/admin')).headers.get('X-Robots-Tag'), 'noindex, nofollow')
  assert.equal((await app.request('/api/missing')).status, 404)
  const image = await app.mf.dispatchFetch(origin + '/og-image.jpg')
  assert.equal(image.status, 200)
  assert.match(image.headers.get('Content-Type'), /image\/jpeg/)
  assert.ok((await image.arrayBuffer()).byteLength > 1000)
})

test('SQLite export imports into D1 without credentials or overwriting newer articles', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'journal-import-test-'))
  mkdirSync(join(directory, 'data'))
  const local = new DatabaseSync(join(directory, 'data/journal.sqlite'))
  local.exec(readFileSync('cloudflare/migrations/0001_journal.sql', 'utf8'))
  local.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); INSERT INTO settings VALUES ('password', 'must-not-leave-local')")
  const body = "中文、emoji ☀️、单引号 ' 和换行\n<script>原样存储，不执行</script>"
  local.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('migration-fixture', '迁移验证', body, '2026-08-30', 'cloudy', 'draft', '2026-08-30T00:00:00Z', '2026-08-30T00:00:00Z', 7)
  local.close()
  execFileSync(process.execPath, [resolve('cloudflare/export-posts.mjs')], {
    cwd: directory, env: { ...process.env, JOURNAL_DB: join(directory, 'data/journal.sqlite') }, stdio: 'pipe',
  })
  const exportFile = join(directory, 'data/cloudflare-posts.local.sql')
  const sql = readFileSync(exportFile, 'utf8')
  assert.equal(statSync(exportFile).mode & 0o777, 0o600)
  assert.ok(!sql.includes('must-not-leave-local'))
  const app = await start(join(directory, 'd1'))
  t.after(async () => { await app.mf.dispose(); rmSync(directory, { recursive: true, force: true }) })
  await app.db.prepare(sql).run()
  const imported = await app.db.prepare('SELECT * FROM posts WHERE id = ?').bind('migration-fixture').first()
  assert.equal(imported.content, body)
  assert.equal(imported.version, 7)
  assert.equal(imported.status, 'draft')
  await app.db.prepare("UPDATE posts SET title = '线上新标题' WHERE id = 'migration-fixture'").run()
  await app.db.prepare(sql).run()
  assert.equal((await app.db.prepare('SELECT title FROM posts').first()).title, '线上新标题')
})
