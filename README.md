# 今天的天气

个人心情网站：[mood.z-agent.ccwu.cc](https://mood.z-agent.ccwu.cc/)

源码在 [`web/`](web/)。本地运行见 [web/README.md](web/README.md)，Cloudflare 部署与 GitHub Actions 见 [web/CLOUDFLARE.md](web/CLOUDFLARE.md)。

## 修改线上数据库

GitHub Actions 推送 `main` 只会发布 Worker 和静态资源，**不会**改 D1 表结构，也不会重置文章。

改线上库时：

1. 在 `web/cloudflare/migrations/` **新增**迁移文件，不要改已经执行过的迁移。
2. 本机进入 `web/`，登录 Wrangler 后执行：

```bash
npm run cf:migrate:remote
```

3. 不要在 GitHub Actions 里跑 D1 迁移。部署用的 Token 是 Edit Cloudflare Workers，没有 D1 权限，强行迁移会返回 7403。

本地 Node/SQLite 与线上 D1 彼此独立，不会自动同步。备份用 `npx wrangler d1 export DB --remote`，导出文件不要提交到仓库。
