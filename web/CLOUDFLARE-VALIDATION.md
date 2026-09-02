# Cloudflare 部署验收 · 2026-08-31

- 正式网站：https://mood.z-agent.ccwu.cc/
- 写作室：https://mood.z-agent.ccwu.cc/admin
- Worker：`my-face-weather`
- D1：`my-face-journal`，APAC
- 部署版本：`13dfe0bd-0ac9-432a-99a8-ce0f939aac7d`
- 绑定专用子域名，无 DNS 冲突；未覆盖其他站点，未开通付费计划。
- 关闭 workers.dev 及版本预览入口。PUBLIC_ORIGIN 固定为正式 HTTPS 域名。

## 自动验证

- `npm run build`、`npm run lint` 通过。
- 16 项本地测试与 5 项 Workers/D1 测试全部通过。
- Workers 测试在与 Wrangler 相同的 Miniflare/Workerd 运行时中执行，包括 D1 重启持久化、原子限流、并发更新冲突、草稿隔离、口令轮换失效、来源检查、请求大小限制、SQLite 导入与重复导入保护。
- 依赖审计无已知漏洞；部署产物扫描不含平台 Token 或原始后台口令。
- 私有口令与文章导出文件权限均为 0600，临时 Secret 上传文件已清理。

## 浏览器验证

使用独立本机 Workers/D1 预览，不访问真实文章或线上账户：

- Cloudflare 登录页、登录、Markdown 对照预览、选择天气、保存草稿、发布、首页天气同步及阅读全文均正常。
- 390px 手机阅读页无横向溢出。
- 分享封面为真实 JPEG，1200×630；编码、扩展名与响应 Content-Type 一致。

## 公网验证

在最终正式域名完成以下检查，HTTPS 证书与主机名校验始终开启：

- 首页、后台与已发布文章页面返回 HTTP 200。
- HTML 含 og:title、og:description、绝对 HTTPS og:image、twitter:card 与 twitter:image；封面返回 image/jpeg，实际尺寸为 1200×630。
- 正式随机口令登录成功，Cookie 包含 HttpOnly、SameSite=Strict、Secure，退出后会话失效。
- 本地原有 1 篇文章逐字段迁移一致，未修改本地数据库，不迁移本地密码或会话。
- 新建一篇私有验收草稿，验证写入、重读、更新、版本冲突与来源校验；公众无法读取。验收后仅清理该测试草稿，未留下公开测试内容。
- Cloudflare 公共 DNS-over-HTTPS 已返回正常解析。本机创建前的负缓存曾导致 ENOTFOUND；验收使用该公共 DNS 的应答进行单进程解析，不修改本机网络设置，不跳过 TLS。

## 交付边界

后台使用本机 `data/cloudflare-admin.local.json` 中单独生成的随机口令，请存入密码管理器。
本地 Node/SQLite 与线上 D1 不自动双向同步；生产文章应在正式写作室管理。
Three.js 分块仍有原有的大于 500 kB 构建提示，不影响构建。
网站已公开部署；未调用 Idea Platform Work API 发布作品信息。
