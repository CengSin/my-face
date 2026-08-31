# Cloudflare 部署

当前正式网站：[mood.z-agent.ccwu.cc](https://mood.z-agent.ccwu.cc/)。写作室：[/admin](https://mood.z-agent.ccwu.cc/admin)。
已绑定 Workers Custom Domain，由 Cloudflare 管理 DNS 与 HTTPS；临时 workers.dev 入口已关闭。
后台口令在本机 `data/cloudflare-admin.local.json` 的 `key` 字段中，不是原来 Node 版的后台密码。

当前代码支持两种独立运行方式：原有 Node 24 + SQLite，以及 Cloudflare Workers + D1。
Cloudflare 版保留相同的文章接口、写作室、草稿、发布/撤回、版本冲突保护和 12 小时会话。
不需要购买服务器。不会自动开通付费计划，免费额度与实际 CPU/请求用量仍需在部署后观察。

## 本地验证

```bash
npm ci
npm run build
npm run lint
npm test
npm run test:cloudflare
npm run cf:preview
```

`cf:preview` 使用独立临时 D1，在 `http://127.0.0.1:8787` 提供页面。
测试口令为 43 个 `p`，仅该本机预览有效；停止服务会清理测试数据，不读取真实 SQLite。
测试使用与 Wrangler 一致的 Miniflare/Workerd 版本，包括重启持久化、并发限流、导入与分享元数据检查。

## 登录 Cloudflare

可连接 `https://mcp.cloudflare.com/mcp`；该地址本身不包含账户授权。
若 MCP 不可用，可使用官方 CLI：

```bash
npx wrangler login --scopes account:read user:read workers:write workers_scripts:write workers_routes:write workers_tail:read d1:write
npx wrangler whoami
```

无法接收浏览器 localhost 回调时，可在 login 后加 `--device` 完成设备授权。
MCP OAuth 与 Wrangler OAuth 为不同客户端，不共享登录状态。

## 首次部署

在 `web` 目录执行。使用自己的 Cloudflare 账号，不上传 AGENTS.md、data 目录或本地配置凭证。

1. 执行 `npx wrangler d1 create my-face-journal`。将返回的 `database_id` 填入 `wrangler.jsonc`；不要使用占位 ID。账号有多个账户时，先明确 `account_id`。
2. 执行 `npm run cf:migrate:remote`，创建表结构，不清空已有文章。
3. 执行 `npm run cf:credentials`，生成 256 位随机口令。口令保存在 `data/cloudflare-admin.local.json`，文件权限为 0600，且已加入忽略规则。已有文件不会被覆盖。
4. 如需迁移本地文章，执行 `npm run cf:export`，然后执行 `npx wrangler d1 execute DB --remote --file data/cloudflare-posts.local.sql`。草稿仍为草稿；导出不包含本地密码或会话，重复导入不会覆盖相同 ID 的线上文章。
5. 执行 `npm run cf:deploy`。它在同一次部署中上传 Worker、构建后的静态文件和 `ADMIN_KEY_HASH` Secret，原始口令不会上传。
6. 打开返回的 HTTPS 地址，访问 `/admin`，使用第 3 步文件里的 `key` 登录。建议存入密码管理器。
7. 确认实际域名后，可在 `wrangler.jsonc` 设置 `vars.PUBLIC_ORIGIN` 为该 HTTPS origin，执行 `npm run cf:deploy` 固定允许的域名。切换自定义域名时应同步修改。

部署脚本检测占位数据库 ID 并拒绝发布。不要将隔离预览中的测试口令配置到线上。
仅 `dist` 文件和 Worker bundle 会发布；本地数据库、迁移导出、口令和平台 Token 都不属于静态资源。

## 后台口令与安全

Cloudflare 使用单独生成的随机口令，不使用本地手选密码。
这样可避免在免费 Worker 中执行高成本 scrypt，同时保持 256 位随机秘密的安全强度。
**不能把普通密码做 SHA-256 后填入 Secret**：普通密码必须使用高成本密码哈希，这里的 SHA-256 仅用于校验随机生成的高熵口令。

随机口令只保存在本机；Cloudflare Secret 保存摘要。D1 只保存会话摘要，浏览器使用 HttpOnly/SameSite=Strict/Secure Cookie。
所有写接口检查同源 Origin 和请求头，公网不开放注册。错误登录每 IP 每 15 分钟最多 8 次，限流通过 D1 原子操作实现。
口令更新后旧会话立即失效；会话过期记录在成功登录时清理。

若需要轮换，先安全保存旧口令文件，再移走本机文件并重新运行 `cf:credentials`、`cf:secret`。
只更新目标 Worker 的口令，不能使用其他站点的凭证。丢失口令后可用拥有该 Worker 的 Cloudflare 账号重新配置。

## 分享预览与上线检查

封面为 `public/og-image.jpg`（1200×630）。Worker 在 HTML 响应中将 `og:image` / `twitter:image` 设置为当前 HTTPS 域名的绝对地址。
分享卡同时包含标题、描述和 `twitter:card=summary_large_image`，不依赖浏览器执行 JavaScript。

上线后应实际请求首页、`/admin`、文章链接及图片，检查 HTTP 状态、元标签与 Content-Type。
检查登录、私有草稿、发布与撤回，以及刷新后文章持久化；不应将验收文章留在公开首页。
Cloudflare 本地测试不能代替公网访问测试，也不代表账号已完成部署。

## GitHub Actions 自动部署

`main` 分支每次推送会先跑 lint / 测试，再部署到 Cloudflare，不会重置 D1，也不会改后台口令。
Pull Request 只跑检查，不发布。也可在 Actions 页手动运行 **Deploy Cloudflare**。

GitHub 只需要一个仓库 Secret：`CLOUDFLARE_API_TOKEN`。不要把 Token、后台口令或 `AGENTS.md` 写进仓库。

1. 打开 [Account API tokens](https://dash.cloudflare.com/0b6decfbed0f3439726d7ded971b57e5/api-tokens)，创建 Token。
2. 权限模板选 **Edit Cloudflare Workers**，把范围限制在当前账号。该模板足够发布 Worker 和静态资源；不必勾选 D1。
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 添加 `CLOUDFLARE_API_TOKEN`。可选添加 `CLOUDFLARE_ACCOUNT_ID`（`0b6decfbed0f3439726d7ded971b57e5`）；`wrangler.jsonc` 里已有该值。
4. 或在本机执行：`gh secret set CLOUDFLARE_API_TOKEN -R CengSin/my-face`，粘贴 Token 后回车。
5. 打开 [Actions](https://github.com/CengSin/my-face/actions) 手动运行一次 **Deploy Cloudflare**，确认部署成功。

CI 使用 `GITHUB_ACTIONS` 跳过本机口令文件，线上 `ADMIN_KEY_HASH` 保持不变。轮换后台口令仍在本机执行 `npm run cf:credentials` 和 `npm run cf:secret`。
表结构变更不要指望 GitHub Actions：在本机执行 `npm run cf:migrate:remote`。Edit Cloudflare Workers 模板不能查询 D1，强行在 CI 跑迁移会返回 7403。

## 备份与更新

```bash
npx wrangler d1 export DB --remote --output data/cloudflare-backup.local.sql
npm run cf:deploy
```

备份文件含私有文章与会话摘要，请妥善保管，不要提交到代码仓库。
后续代码更新只部署 Worker/静态资源，不会重置 D1。表结构变更应新增迁移文件，不能修改已执行的迁移。
原有本地 Node 版与 Cloudflare 版的数据彼此独立，不自动双向同步。

发布网站与发布 Idea Platform 作品信息是两项操作；未明确确认公开作品信息前，不调用平台 Work API。

## 公网自动验收

`npm run cf:verify` 使用配置中的正式 HTTPS 域名，检查证书、元数据、封面尺寸、后台登录、文章迁移和接口安全。
它会创建一篇私有测试草稿，测试更新后仅删除该草稿，并退出验收会话；从不发布测试内容。
执行前需要 Wrangler 仍保持登录，且本机原始 SQLite 和口令文件存在。该命令不会覆盖原文。
新域名如遇本机 DNS 负缓存，应等待缓存过期再执行；不要关闭 HTTPS 校验。
