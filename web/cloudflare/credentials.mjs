import { randomBytes, createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve('data')
const file = resolve(directory, 'cloudflare-admin.local.json')
if (existsSync(file)) throw new Error('已有 Cloudflare 口令文件，拒绝覆盖。轮换前请先安全保管旧文件。')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const key = randomBytes(32).toString('base64url')
writeFileSync(file, JSON.stringify({
  note: '这是 Cloudflare 写作室的登录口令，请保存到密码管理器，不要提交或分享此文件。',
  key,
  hash: createHash('sha256').update(key).digest('hex'),
}, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
console.log('已生成 256 位随机后台口令，保存在 data/cloudflare-admin.local.json（仅当前用户可读）。')
