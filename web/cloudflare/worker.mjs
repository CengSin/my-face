import { HttpError, validatePost } from '../shared/validation.mjs'
import { MAX_IMAGE_BYTES, validateImage } from '../shared/images.mjs'

const SESSION_SECONDS = 12 * 60 * 60
const BODY_LIMIT = 450000
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
}
const encode = new TextEncoder()
async function digest(value) {
  const result = await crypto.subtle.digest('SHA-256', encode.encode(value))
  return Array.from(new Uint8Array(result), (b) => b.toString(16).padStart(2, '0')).join('')
}
function sameDigest(a, b) {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return difference === 0
}
function json(status, data, headers = {}) {
  return Response.json(data, {
    status,
    headers: { ...securityHeaders, 'Cache-Control': 'no-store', ...headers },
  })
}
async function readJson(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json'))
    throw new HttpError(415, '请求需使用 JSON 格式。')
  if (Number(request.headers.get('Content-Length')) > BODY_LIMIT)
    throw new HttpError(413, '文章过大，请缩短后再试。')
  if (!request.body) throw new HttpError(400, '无法读取请求内容。')
  const reader = request.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BODY_LIMIT) {
        await reader.cancel()
        throw new HttpError(413, '文章过大，请缩短后再试。')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new HttpError(400, '无法读取请求内容。') }
}

async function readImage(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_IMAGE_BYTES)
    throw new HttpError(413, '图片不能超过 1.5 MB，请压缩后再上传。')
  const data = new Uint8Array(await request.arrayBuffer())
  const declaredType = (request.headers.get('Content-Type') || '').split(';')[0].trim()
  return {
    data,
    mimeType: validateImage(
      data,
      declaredType === 'application/octet-stream' ? '' : declaredType,
    ),
  }
}

async function api(request, env, url, local) {
  const db = env.DB
  const path = url.pathname
  const method = request.method
  const configured = /^[a-f0-9]{64}$/.test(env.ADMIN_KEY_HASH || '')
  const cookieName = local ? 'journal_session' : '__Host-journal_session'
  const cookie = (token, age = SESSION_SECONDS) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${local ? '' : '; Secure'}`
  const rawToken = (request.headers.get('Cookie') || '').split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1) || ''
  const sessionHash = /^[a-f0-9]{64}$/.test(rawToken) ? await digest(rawToken) : ''
  const keyVersion = configured ? await digest(env.ADMIN_KEY_HASH) : ''
  const authenticated = async () => !!(configured && sessionHash && await db.prepare(
    'SELECT token FROM sessions WHERE token = ? AND expires > ? AND key_version = ?',
  ).bind(sessionHash, Date.now(), keyVersion).first())

  if (method === 'GET' && path === '/api/session')
    return json(200, { configured, authenticated: await authenticated(), canSetup: false, authMode: 'access-key' })
  // Provision the owner through a Cloudflare secret, never through a public first-run endpoint.
  if (path === '/api/setup') throw new HttpError(403, '线上口令只能通过部署工具设置，本站不开放注册。')
  if (method === 'POST' && path === '/api/login') {
    if (!configured) throw new HttpError(503, '写作室尚未配置，请先完成 Cloudflare 口令部署。')
    const input = await readJson(request)
    const now = Date.now()
    const ip = request.headers.get('CF-Connecting-IP') || 'local'
    const bucket = await digest(`login:${ip}`)
    await db.prepare('DELETE FROM login_attempts WHERE expires <= ?').bind(now).run()
    // A single atomic write enforces the limit across concurrent requests and Worker instances.
    const attempt = await db.prepare(`
      INSERT INTO login_attempts (bucket, attempts, expires) VALUES (?, 1, ?)
      ON CONFLICT(bucket) DO UPDATE SET attempts = attempts + 1
      WHERE attempts < 8 RETURNING attempts
    `).bind(bucket, now + 15 * 60 * 1000).first()
    if (!attempt) throw new HttpError(429, '尝试过于频繁，请 15 分钟后再试。')
    const password = input?.password
    // Only random 256-bit deployment keys are supported. Never hash a human password with SHA-256.
    if (typeof password !== 'string' || !KEY_PATTERN.test(password) ||
        !sameDigest(await digest(password), env.ADMIN_KEY_HASH))
      throw new HttpError(401, '后台口令不正确，请使用部署时生成的 Cloudflare 口令。')
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
    await db.batch([
      db.prepare('DELETE FROM login_attempts WHERE bucket = ?').bind(bucket),
      db.prepare('DELETE FROM sessions WHERE expires <= ? OR key_version != ?').bind(now, keyVersion),
      db.prepare('INSERT INTO sessions (token, expires, key_version) VALUES (?, ?, ?)')
        .bind(await digest(token), now + SESSION_SECONDS * 1000, keyVersion),
    ])
    return json(200, { configured: true, authenticated: true }, { 'Set-Cookie': cookie(token) })
  }
  if (method === 'POST' && path === '/api/logout') {
    if (sessionHash) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(sessionHash).run()
    return json(200, { ok: true }, { 'Set-Cookie': cookie('', 0) })
  }
  if (method === 'GET' && path === '/api/posts') {
    const { results } = await db.prepare(
      "SELECT id, title, date, weather, updated_at, length(content) AS characters FROM posts WHERE status = 'published' ORDER BY date DESC, updated_at DESC, id DESC",
    ).all()
    return json(200, { posts: results })
  }
  if (method === 'GET' && /^\/api\/posts\/[^/]+$/.test(path)) {
    const post = await db.prepare("SELECT * FROM posts WHERE id = ? AND status = 'published'")
      .bind(path.split('/').at(-1)).first()
    if (!post) throw new HttpError(404, '这篇文章暂未发布或已转为草稿。')
    return json(200, { post })
  }
  if (method === 'GET' && /^\/api\/images\/[A-Za-z0-9-]+$/.test(path)) {
    const image = await db.prepare('SELECT mime_type, data FROM images WHERE id = ?')
      .bind(path.split('/').at(-1)).first()
    if (!image) throw new HttpError(404, '图片不存在。')
    return new Response(new Uint8Array(image.data), {
      headers: {
        ...securityHeaders,
        'Content-Type': image.mime_type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }
  if (path.startsWith('/api/admin/')) {
    if (!await authenticated()) throw new HttpError(401, '登录已过期，请重新登录。未保存的内容仍保留在编辑器中。')
    if (method === 'POST' && path === '/api/admin/images') {
      const { data, mimeType } = await readImage(request)
      const id = crypto.randomUUID()
      const size = data.byteLength
      await db.prepare(`INSERT INTO images (id, mime_type, data, size, created_at)
        VALUES (?, ?, ?, ?, ?)`)
        .bind(id, mimeType, data.buffer, size, new Date().toISOString()).run()
      return json(201, { image: { id, url: `/api/images/${id}`, mime_type: mimeType, size } })
    }
    if (method === 'GET' && path === '/api/admin/posts') {
      const { results } = await db.prepare('SELECT * FROM posts ORDER BY updated_at DESC, id DESC').all()
      return json(200, { posts: results })
    }
    if (method === 'POST' && path === '/api/admin/posts') {
      const post = validatePost(await readJson(request))
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const saved = await db.prepare(`INSERT INTO posts
        (id, title, content, date, weather, status, created_at, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING *`)
        .bind(id, post.title, post.content, post.date, post.weather, post.status, now, now).first()
      return json(201, { post: saved })
    }
    if (method === 'PUT' && /^\/api\/admin\/posts\/[^/]+$/.test(path)) {
      const input = await readJson(request)
      const post = validatePost(input)
      if (!Number.isInteger(input.version) || input.version < 1)
        throw new HttpError(400, '缺少文章版本，请重新加载文章。')
      const saved = await db.prepare(`UPDATE posts SET title = ?, content = ?, date = ?,
        weather = ?, status = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND version = ? RETURNING *`)
        .bind(post.title, post.content, post.date, post.weather, post.status, new Date().toISOString(), path.split('/').at(-1), input.version).first()
      if (!saved) throw new HttpError(409, '文章已在其他页面修改。请先复制当前正文，再刷新页面后合并，避免覆盖。')
      return json(200, { post: saved })
    }
  }
  throw new HttpError(404, '接口不存在。')
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)
      const local = env.ALLOW_LOCAL_DEV === 'true' && ['localhost', '127.0.0.1'].includes(url.hostname)
      if (!local && url.protocol !== 'https:') throw new HttpError(403, '请通过 HTTPS 访问本站。')
      if (env.PUBLIC_ORIGIN && url.origin !== new URL(env.PUBLIC_ORIGIN).origin)
        throw new HttpError(403, '不受信任的访问地址。')
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method) &&
            (request.headers.get('Origin') !== url.origin || request.headers.get('X-Journal-Request') !== '1'))
          throw new HttpError(403, '请求来源校验失败，请从本站重新操作。')
        return await api(request, env, url, local)
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, '请求方法不支持。')
      let response = await env.ASSETS.fetch(request)
      response = new Response(response.body, response)
      for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value)
      if (response.headers.get('Content-Type')?.includes('text/html')) {
        response.headers.set('Cache-Control', 'no-cache')
        response.headers.delete('ETag')
        response.headers.delete('Content-Length')
        if (url.pathname.startsWith('/admin')) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
        response = new HTMLRewriter().on('meta[property="og:image"], meta[name="twitter:image"]', {
          element(element) { element.setAttribute('content', `${url.origin}/og-image.jpg`) },
        }).transform(response)
      }
      return response
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.message : '保存服务暂时出错，请稍后重试。未保存的内容不会清空。',
      })
    }
  },
}
