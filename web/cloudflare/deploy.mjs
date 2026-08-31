import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
if (config.d1_databases[0].database_id === '00000000-0000-0000-0000-000000000000')
  throw new Error('请先创建 D1 并将实际 database_id 写入 wrangler.jsonc。')

const skipSecrets = process.env.GITHUB_ACTIONS === 'true' || process.env.CF_DEPLOY_SKIP_SECRETS === '1'
const wranglerBin = 'node_modules/wrangler/bin/wrangler.js'
const wranglerEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' }

function wrangler(args) {
  return spawnSync(process.execPath, [wranglerBin, ...args], { stdio: 'inherit', env: wranglerEnv })
}

const migrate = wrangler(['d1', 'migrations', 'apply', 'DB', '--remote'])
if (migrate.status) process.exit(migrate.status ?? 1)

if (skipSecrets) {
  console.log('CI 部署：保留线上已有 ADMIN_KEY_HASH，不读取本机口令文件。')
  process.exitCode = wrangler(['deploy']).status ?? 1
} else {
  const { key, hash } = JSON.parse(readFileSync('data/cloudflare-admin.local.json', 'utf8'))
  if (!/^[A-Za-z0-9_-]{43}$/.test(key) || createHash('sha256').update(key).digest('hex') !== hash)
    throw new Error('口令文件格式错误；必须使用 cf:credentials 生成的随机口令。')
  const secretFile = 'data/cloudflare-secrets.local.json'
  writeFileSync(secretFile, JSON.stringify({ ADMIN_KEY_HASH: hash }), { mode: 0o600, flag: 'wx' })
  try {
    process.exitCode = wrangler(['deploy', '--secrets-file', secretFile]).status ?? 1
  } finally { unlinkSync(secretFile) }
}
