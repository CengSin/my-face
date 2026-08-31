import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const { key, hash } = JSON.parse(readFileSync('data/cloudflare-admin.local.json', 'utf8'))
if (!/^[A-Za-z0-9_-]{43}$/.test(key) || createHash('sha256').update(key).digest('hex') !== hash)
  throw new Error('口令文件格式不正确。请使用 npm run cf:credentials 生成，勿填写普通密码。')
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'ADMIN_KEY_HASH'], {
  input: hash + '\n',
  encoding: 'utf8',
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: ['pipe', 'pipe', 'pipe'],
})
// Never forward tool logs that could contain submitted secret material.
if (result.status !== 0) {
  console.error('Cloudflare Secret 上传失败。请检查 Wrangler 登录及 Workers 权限后重试，口令文件已保留。')
  process.exit(1)
}
console.log('Cloudflare ADMIN_KEY_HASH 已配置；原始登录口令只保存在本机。')
