import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import { createJournalServer } from '../server/app.mjs'

const password = 'test-only-weather-passphrase'
function rawRequest(origin, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      origin + path,
      { method: body ? 'POST' : 'GET', headers },
      (res) => {
        let text = ''
        res.on('data', (chunk) => {
          text += chunk
        })
        res.on('end', () =>
          resolve({ status: res.statusCode, data: JSON.parse(text) }),
        )
      },
    )
    req.on('error', reject)
    req.end(body ? JSON.stringify(body) : undefined)
  })
}
async function start(dbPath = ':memory:', options = {}) {
  const server = createJournalServer({ dbPath, ...options })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  let session = ''
  return {
    server,
    origin,
    close: () => new Promise((resolve) => server.close(resolve)),
    async request(
      path,
      { method = 'GET', body, auth = true, headers = {} } = {},
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Journal-Request': '1',
          Origin: origin,
          ...(auth ? { Cookie: session } : {}),
          ...headers,
        },
        ...(body !== undefined
          ? {
              body:
                typeof body === 'string' || body instanceof Uint8Array
                  ? body
                  : JSON.stringify(body),
            }
          : {}),
      })
      if (response.headers.has('set-cookie'))
        session = response.headers.get('set-cookie').split(';')[0]
      const type = response.headers.get('Content-Type') || ''
      const data = type.includes('json')
        ? await response.json()
        : new Uint8Array(await response.arrayBuffer())
      return { status: response.status, data, headers: response.headers }
    },
  }
}

test('authenticated publishing workflow, drafts, validation and restart persistence', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'weather-api-test-'))
  const dbPath = join(directory, 'journal.sqlite')
  let app = await start(dbPath)
  t.after(async () => {
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  })
  assert.equal((await app.request('/api/session')).data.configured, false)
  assert.equal((await app.request('/api/admin/posts')).status, 401)
  assert.equal(
    (
      await app.request('/api/setup', {
        method: 'POST',
        body: { password: 'short' },
      })
    ).status,
    400,
  )
  const setup = await app.request('/api/setup', {
    method: 'POST',
    body: { password },
  })
  assert.equal(setup.status, 200)
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/)
  assert.match(setup.headers.get('set-cookie'), /SameSite=Strict/)
  assert.equal(
    (await app.request('/api/setup', { method: 'POST', body: { password } }))
      .status,
    409,
  )
  assert.equal(statSync(dbPath).mode & 0o777, 0o600)

  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ])
  assert.equal(
    (
      await app.request('/api/admin/images', {
        method: 'POST',
        auth: false,
        body: png,
        headers: { 'Content-Type': 'image/png' },
      })
    ).status,
    401,
  )
  const upload = await app.request('/api/admin/images', {
    method: 'POST',
    body: png,
    headers: { 'Content-Type': 'image/png' },
  })
  assert.equal(upload.status, 201)
  assert.match(upload.data.image.url, /^\/api\/images\/[a-f0-9-]+$/)
  const publicImage = await app.request(upload.data.image.url, { auth: false })
  assert.equal(publicImage.status, 200)
  assert.equal(publicImage.headers.get('Content-Type'), 'image/png')
  assert.deepEqual(publicImage.data, png)
  assert.equal(
    (
      await app.request('/api/admin/images', {
        method: 'POST',
        body: new Uint8Array([0x3c, 0x73, 0x76, 0x67]),
        headers: { 'Content-Type': 'image/png' },
      })
    ).status,
    415,
  )

  const input = {
    title: '今天的小事',
    content: '## 晚风\n\n**很好**，一切都慢下来。',
    weather: 'cloudy',
    date: '2026-08-30',
    status: 'draft',
  }
  const draft = (
    await app.request('/api/admin/posts', { method: 'POST', body: input })
  ).data.post
  assert.equal(draft.version, 1)
  assert.equal(
    (await app.request('/api/posts', { auth: false })).data.posts.length,
    0,
  )
  assert.equal(
    (await app.request(`/api/posts/${draft.id}`, { auth: false })).status,
    404,
  )
  assert.equal(
    (await app.request('/api/admin/posts', { auth: false })).status,
    401,
  )
  assert.equal(
    (
      await app.request(`/api/admin/posts/${draft.id}`, {
        method: 'PUT',
        auth: false,
        body: { ...input, version: 1 },
      })
    ).status,
    401,
  )

  for (const bad of [
    { date: '2026-02-30' },
    { weather: 'tornado' },
    { status: 'private' },
    { title: '' },
    { title: 'x'.repeat(121) },
    { content: 'x'.repeat(100001) },
    { status: 'published', content: ' ' },
  ]) {
    assert.equal(
      (
        await app.request('/api/admin/posts', {
          method: 'POST',
          body: { ...input, ...bad },
        })
      ).status,
      400,
    )
  }
  assert.equal(
    (
      await app.request('/api/admin/posts', {
        method: 'POST',
        body: '{bad json',
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await app.request('/api/admin/posts', {
        method: 'POST',
        body: input,
        headers: { Origin: 'https://attacker.example' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await app.request('/api/admin/posts', {
        method: 'POST',
        body: input,
        headers: { 'X-Journal-Request': '' },
      })
    ).status,
    403,
  )
  assert.equal(
    (await rawRequest(app.origin, '/api/session', { Host: 'attacker.example' }))
      .status,
    403,
  )

  const published = (
    await app.request(`/api/admin/posts/${draft.id}`, {
      method: 'PUT',
      body: { ...input, status: 'published', version: 1 },
    })
  ).data.post
  assert.equal(published.version, 2)
  assert.equal(
    (
      await app.request(`/api/admin/posts/${draft.id}`, {
        method: 'PUT',
        body: { ...input, version: 1 },
      })
    ).status,
    409,
  )
  const feed = (await app.request('/api/posts', { auth: false })).data.posts
  assert.equal(feed.length, 1)
  assert.equal(feed[0].weather, 'cloudy')
  assert.ok(!('content' in feed[0]))
  assert.equal(
    (await app.request(`/api/posts/${draft.id}`, { auth: false })).data.post
      .content,
    input.content,
  )

  await app.close()
  app = await start(dbPath)
  assert.equal((await app.request('/api/session')).data.configured, true)
  assert.equal(
    (await app.request(upload.data.image.url, { auth: false })).status,
    200,
  )
  assert.equal(
    (await app.request('/api/posts', { auth: false })).data.posts.length,
    1,
  )
  assert.equal(
    (
      await app.request('/api/login', {
        method: 'POST',
        body: { password: 'wrong-but-long-password' },
      })
    ).status,
    401,
  )
  assert.equal(
    (await app.request('/api/login', { method: 'POST', body: { password } }))
      .status,
    200,
  )
  assert.equal((await app.request('/api/admin/posts')).data.posts.length, 1)
  assert.equal(
    (
      await app.request(`/api/admin/posts/${draft.id}`, {
        method: 'PUT',
        body: { ...input, version: 2 },
      })
    ).status,
    200,
  )
  assert.equal(
    (await app.request('/api/posts', { auth: false })).data.posts.length,
    0,
  )
  assert.equal(
    (await app.request(`/api/posts/${draft.id}`, { auth: false })).status,
    404,
  )
  await app.request('/api/logout', { method: 'POST' })
  assert.equal((await app.request('/api/admin/posts')).status, 401)
})

test('login attempts are rate limited', async (t) => {
  const app = await start()
  t.after(app.close)
  await app.request('/api/setup', { method: 'POST', body: { password } })
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await app.request('/api/login', {
          method: 'POST',
          body: { password: 'incorrect-password' },
        })
      ).status,
      401,
    )
  assert.equal(
    (await app.request('/api/login', { method: 'POST', body: { password } }))
      .status,
    429,
  )
})

test('first-run initialization cannot replace an existing owner under concurrency', async (t) => {
  const app = await start()
  t.after(app.close)
  const results = await Promise.all([
    app.request('/api/setup', { method: 'POST', body: { password } }),
    app.request('/api/setup', { method: 'POST', body: { password } }),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
})

test('public bootstrap disabled in production', async (t) => {
  const app = await start(':memory:', {
    production: true,
    origins: ['https://journal.example'],
  })
  t.after(app.close)
  const result = await rawRequest(
    app.origin,
    '/api/setup',
    {
      Host: 'journal.example',
      Origin: 'https://journal.example',
      'X-Journal-Request': '1',
      'Content-Type': 'application/json',
    },
    { password },
  )
  assert.equal(result.status, 403)
  assert.match(result.data.error, /首次设置/)
})
