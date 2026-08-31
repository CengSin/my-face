import { HttpError, validatePost } from '../shared/validation.mjs'
export { validatePost } from '../shared/validation.mjs'
import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import {
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
  createHash,
} from 'node:crypto'
import { promisify } from 'node:util'
import {
  mkdirSync,
  chmodSync,
  existsSync,
  statSync,
  createReadStream,
} from 'node:fs'
import { dirname, resolve, extname, sep } from 'node:path'

const deriveKey = promisify(scrypt)
const digest = (value) => createHash('sha256').update(value).digest('hex')
const SESSION_SECONDS = 12 * 60 * 60
const loopback = (address) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)

async function readJson(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    throw new HttpError(415, '请求需使用 JSON 格式。')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > 450000) throw new HttpError(413, '文章过大，请缩短后再试。')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString())
  } catch {
    throw new HttpError(400, '无法读取请求内容。')
  }
}

export function createJournalServer({
  dbPath,
  origins = [],
  production = false,
  staticDir = null,
}) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 })
  }
  const db = new DatabaseSync(dbPath)
  if (dbPath !== ':memory:') chmodSync(dbPath, 0o600)
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
      date TEXT NOT NULL, weather TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS posts_by_date ON posts(status, date DESC, updated_at DESC);`)

  const attempts = new Map()
  const configured = () =>
    !!db.prepare("SELECT value FROM settings WHERE key = 'password'").get()
  const allowedOrigins = new Set(origins)
  const cookieName = production ? '__Host-journal_session' : 'journal_session'
  const cookie = (token, age = SESSION_SECONDS) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`
  const sessionHash = (req) => {
    const raw = (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
    return raw && /^[a-f0-9]{64}$/.test(raw) ? digest(raw) : ''
  }
  const authenticated = (req) => {
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now())
    return !!db
      .prepare('SELECT token FROM sessions WHERE token = ? AND expires > ?')
      .get(sessionHash(req), Date.now())
  }
  const requireAuth = (req) => {
    if (!authenticated(req))
      throw new HttpError(
        401,
        '登录已过期，请重新登录。未保存的内容仍保留在编辑器中。',
      )
  }
  const issueSession = (res) => {
    const token = randomBytes(32).toString('hex')
    db.prepare('INSERT INTO sessions VALUES (?, ?)').run(
      digest(token),
      Date.now() + SESSION_SECONDS * 1000,
    )
    res.setHeader('Set-Cookie', cookie(token))
  }
  const send = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(data))
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Frame-Options', 'DENY')
    try {
      const address = server.address()
      const ownOrigin = `http://127.0.0.1:${typeof address === 'object' ? address.port : 0}`
      const trusted = new Set([
        ...allowedOrigins,
        ...(!production ? [ownOrigin] : []),
      ])
      const allowedHosts = new Set(
        [...trusted].map((origin) => new URL(origin).host),
      )
      if (!allowedHosts.has(req.headers.host))
        throw new HttpError(403, '不受信任的访问地址。')
      const url = new URL(req.url, ownOrigin)
      const path = url.pathname
      if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
        if (
          !trusted.has(req.headers.origin) ||
          req.headers['x-journal-request'] !== '1'
        )
          throw new HttpError(403, '请求来源校验失败，请从本站重新操作。')
      }

      if (req.method === 'GET' && path === '/api/session') {
        return send(res, 200, {
          configured: configured(),
          authenticated: authenticated(req),
          canSetup: !production && loopback(req.socket.remoteAddress),
        })
      }
      if (
        req.method === 'POST' &&
        ['/api/setup', '/api/login'].includes(path)
      ) {
        const ip = req.socket.remoteAddress
        const now = Date.now()
        for (const [key, value] of attempts)
          if (value.until < now) attempts.delete(key)
        const attempt = attempts.get(ip) || {
          count: 0,
          until: now + 15 * 60 * 1000,
        }
        if (attempt.count >= 8)
          throw new HttpError(429, '尝试过于频繁，请 15 分钟后再试。')
        attempt.count++
        attempts.set(ip, attempt)
        const input = await readJson(req)
        const password = input?.password
        if (
          typeof password !== 'string' ||
          password.length < 12 ||
          password.length > 128
        )
          throw new HttpError(400, '密码长度需为 12–128 个字符。')
        if (path === '/api/setup') {
          if (production || !loopback(req.socket.remoteAddress))
            throw new HttpError(403, '首次设置只能在本机开发模式完成。')
          if (configured()) throw new HttpError(409, '后台已经设置，请登录。')
          const salt = randomBytes(16).toString('hex')
          const hash = (await deriveKey(password, salt, 64)).toString('hex')
          const result = db
            .prepare(
              "INSERT OR IGNORE INTO settings (key, value) VALUES ('password', ?)",
            )
            .run(`${salt}:${hash}`)
          if (!result.changes)
            throw new HttpError(409, '后台已经设置，请登录。')
        } else {
          const saved = db
            .prepare("SELECT value FROM settings WHERE key = 'password'")
            .get()?.value
          if (!saved) throw new HttpError(409, '请先在本机设置后台密码。')
          const [salt, hash] = saved.split(':')
          const supplied = await deriveKey(password, salt, 64)
          if (!timingSafeEqual(supplied, Buffer.from(hash, 'hex')))
            throw new HttpError(401, '密码不正确，请再试一次。')
        }
        attempts.delete(ip)
        issueSession(res)
        return send(res, 200, { configured: true, authenticated: true })
      }
      if (req.method === 'POST' && path === '/api/logout') {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(sessionHash(req))
        res.setHeader('Set-Cookie', cookie('', 0))
        return send(res, 200, { ok: true })
      }
      if (req.method === 'GET' && path === '/api/posts') {
        // No draft content or private account details ever enter the public feed.
        const posts = db
          .prepare(
            "SELECT id, title, date, weather, updated_at, length(content) AS characters FROM posts WHERE status = 'published' ORDER BY date DESC, updated_at DESC, id DESC",
          )
          .all()
        return send(res, 200, { posts })
      }
      if (req.method === 'GET' && /^\/api\/posts\/[^/]+$/.test(path)) {
        const post = db
          .prepare("SELECT * FROM posts WHERE id = ? AND status = 'published'")
          .get(path.split('/').at(-1))
        if (!post) throw new HttpError(404, '这篇文章暂未发布或已转为草稿。')
        return send(res, 200, { post })
      }
      if (path.startsWith('/api/admin/')) {
        requireAuth(req)
        if (req.method === 'GET' && path === '/api/admin/posts') {
          return send(res, 200, {
            posts: db
              .prepare('SELECT * FROM posts ORDER BY updated_at DESC, id DESC')
              .all(),
          })
        }
        if (req.method === 'POST' && path === '/api/admin/posts') {
          const post = validatePost(await readJson(req))
          const id = randomUUID()
          const now = new Date().toISOString()
          db.prepare(
            'INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
          ).run(
            id,
            post.title,
            post.content,
            post.date,
            post.weather,
            post.status,
            now,
            now,
          )
          return send(res, 201, {
            post: db.prepare('SELECT * FROM posts WHERE id = ?').get(id),
          })
        }
        if (req.method === 'PUT' && /^\/api\/admin\/posts\/[^/]+$/.test(path)) {
          const id = path.split('/').at(-1)
          const input = await readJson(req)
          const post = validatePost(input)
          if (!Number.isInteger(input.version))
            throw new HttpError(400, '缺少文章版本，请重新加载文章。')
          const result = db
            .prepare(
              'UPDATE posts SET title = ?, content = ?, date = ?, weather = ?, status = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ?',
            )
            .run(
              post.title,
              post.content,
              post.date,
              post.weather,
              post.status,
              new Date().toISOString(),
              id,
              input.version,
            )
          if (!result.changes)
            throw new HttpError(
              409,
              '文章已在其他页面修改。请先复制当前正文，再刷新页面后合并，避免覆盖。',
            )
          return send(res, 200, {
            post: db.prepare('SELECT * FROM posts WHERE id = ?').get(id),
          })
        }
      }
      if (path.startsWith('/api/')) throw new HttpError(404, '接口不存在。')
      if (staticDir && req.method === 'GET') {
        const root = resolve(staticDir)
        const filePath = resolve(root, `.${decodeURIComponent(path)}`)
        if (filePath !== root && !filePath.startsWith(root + sep))
          throw new HttpError(404, '页面不存在。')
        const file =
          existsSync(filePath) && statSync(filePath).isFile()
            ? filePath
            : resolve(root, 'index.html')
        if (!existsSync(file))
          throw new HttpError(503, '请先运行 npm run build。')
        const mime = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
        }
        res.setHeader(
          'Content-Type',
          mime[extname(file)] || 'application/octet-stream',
        )
        res.setHeader(
          'Cache-Control',
          extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
        )
        return createReadStream(file).pipe(res)
      }
      throw new HttpError(404, '页面不存在。')
    } catch (error) {
      if (!res.headersSent)
        send(res, error instanceof HttpError ? error.status : 500, {
          error:
            error instanceof HttpError
              ? error.message
              : '保存服务暂时出错，请稍后重试。未保存的内容不会清空。',
        })
    }
  })
  server.on('close', () => db.close())
  return server
}
