// Explicit live acceptance check. Creates one private test draft and removes only that draft.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
const origin = config.vars.PUBLIC_ORIGIN
if (!origin?.startsWith('https://')) throw new Error('仅验证配置中的正式 HTTPS 域名。')
const { key } = JSON.parse(readFileSync('data/cloudflare-admin.local.json', 'utf8'))
let cookie = ''
async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const response = await fetch(origin + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(25000),
    headers: { 'Content-Type': 'application/json', Origin: origin, 'X-Journal-Request': '1',
      ...(auth ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.headers.has('Set-Cookie')) cookie = response.headers.get('Set-Cookie').split(';')[0]
  const type = response.headers.get('Content-Type') || ''
  return { status: response.status, headers: response.headers,
    data: type.includes('json') ? await response.json() : await response.text() }
}
for (const path of ['/', '/admin']) {
  const page = await request(path, { headers: { Accept: 'text/html' } })
  assert.equal(page.status, 200)
  for (const marker of ['property="og:title"', 'property="og:description"', `property="og:image" content="${origin}/og-image.jpg"`,
    'name="twitter:card" content="summary_large_image"', `name="twitter:image" content="${origin}/og-image.jpg"`])
    assert.ok(page.data.includes(marker), `缺少分享元数据：${marker}`)
  assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff')
}
const cover = await fetch(origin + '/og-image.jpg', { signal: AbortSignal.timeout(25000) })
assert.equal(cover.status, 200)
assert.match(cover.headers.get('Content-Type'), /image\/jpeg/)
const jpeg = Buffer.from(await cover.arrayBuffer())
assert.equal(jpeg.readUInt16BE(0), 0xffd8)
let dimensions
for (let offset = 2; offset + 8 < jpeg.length;) {
  const marker = jpeg.readUInt16BE(offset)
  offset += 2
  const length = jpeg.readUInt16BE(offset)
  if (marker === 0xffc0 || marker === 0xffc2) {
    dimensions = { height: jpeg.readUInt16BE(offset + 3), width: jpeg.readUInt16BE(offset + 5) }
    break
  }
  if (length < 2) break
  offset += length
}
assert.deepEqual(dimensions, { width: 1200, height: 630 })
console.log('PASS HTTPS、首页/后台路由、HTML 分享元数据与 1200×630 JPEG 封面')

assert.equal((await request('/api/admin/posts', { auth: false })).status, 401)
assert.equal((await request('/api/setup', { method: 'POST', body: {} })).status, 403)
const login = await request('/api/login', { method: 'POST', body: { password: key } })
assert.equal(login.status, 200, '正式后台登录失败')
assert.match(login.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict; Max-Age=43200; Secure/)
assert.equal((await request('/api/session')).data.authenticated, true)
const remote = (await request('/api/admin/posts')).data.posts
const local = new DatabaseSync(process.env.JOURNAL_DB || 'data/journal.sqlite', { readOnly: true })
const rows = local.prepare('SELECT * FROM posts').all()
local.close()
const hash = (value) => createHash('sha256').update(value).digest('hex')
for (const post of rows) {
  const imported = remote.find((item) => item.id === post.id)
  assert.ok(imported, '迁移文章缺失')
  for (const field of ['title', 'content', 'date', 'weather', 'status', 'created_at', 'updated_at', 'version'])
    assert.ok(hash(String(imported[field])) === hash(String(post[field])), `迁移字段不一致：${field}`)
}
const feed = (await request('/api/posts', { auth: false })).data.posts
assert.ok(remote.filter((p) => p.status === 'draft').every((p) => !feed.some((item) => item.id === p.id)))
for (const post of feed) {
  assert.equal((await request(`/api/posts/${post.id}`, { auth: false })).status, 200)
  const page = await request(`/articles/${post.id}`, { auth: false, headers: { Accept: 'text/html' } })
  assert.equal(page.status, 200)
}
console.log(`PASS 正式登录、安全 Cookie 与 ${rows.length} 篇原始文章逐字段迁移校验`)

let testId
const title = `deployment-check-${randomUUID()}`
try {
  const input = { title, content: 'Private deployment verification. Never published.', date: '2026-08-31', weather: 'cloudy', status: 'draft' }
  const created = await request('/api/admin/posts', { method: 'POST', body: input })
  assert.equal(created.status, 201)
  testId = created.data.post.id
  assert.match(testId, /^[a-f0-9-]{36}$/)
  assert.equal((await request(`/api/posts/${testId}`, { auth: false })).status, 404)
  assert.ok(!(await request('/api/posts', { auth: false })).data.posts.some((p) => p.id === testId))
  const saved = await request(`/api/admin/posts/${testId}`, { method: 'PUT', body: { ...input, content: 'Updated private verification.', version: 1 } })
  assert.equal(saved.status, 200)
  assert.equal(saved.data.post.version, 2)
  assert.equal((await request(`/api/admin/posts/${testId}`, { method: 'PUT', body: { ...input, version: 1 } })).status, 409)
  assert.equal((await request('/api/admin/posts', { method: 'POST', body: input, headers: { Origin: 'https://attacker.example' } })).status, 403)
  const reread = (await request('/api/admin/posts')).data.posts.find((p) => p.id === testId)
  assert.ok(reread?.content === 'Updated private verification.')
  console.log('PASS 正式 D1 私有草稿写入/重读、更新、冲突保护、草稿隔离与来源校验')
} finally {
  if (testId) {
    execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--command',
      `DELETE FROM posts WHERE id = '${testId}' AND title = '${title}' AND status = 'draft'`],
    { stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
    assert.ok(!(await request('/api/admin/posts')).data.posts.some((p) => p.id === testId))
    console.log('PASS 仅清理本次私有验收草稿，原有文章未改动')
  }
  if (cookie) await request('/api/logout', { method: 'POST' })
}
assert.equal((await request('/api/admin/posts')).status, 401)
console.log('PASS 退出后会话失效；公网验收全部通过')
