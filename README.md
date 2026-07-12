# tomori-web

Tomori Web 是基于 Cloudflare Workers、Hono、D1 和 R2 的轻量内容社区。

## 本地开发

```bash
npm install
npx wrangler d1 execute tomori-web-db --local --file=./migrations/001_initial.sql
npm run dev
```

打开 `http://localhost:8787` 查看前端骨架。

## 阶段 1 API

- `GET /api` 返回 Worker 状态。
- `GET /api/health` 检查 D1 连接和 R2 绑定。
- `/api/auth`、`/api/articles`、`/api/users`、`/api/admin`、`/api/upload`、`/api/tools`、`/api/pages` 当前返回 `501` 占位响应。

## Cloudflare 资源

`wrangler.toml` 中的 `database_id` 需要替换为实际 D1 数据库 ID。R2 桶名也需要与 Cloudflare 账户中的资源一致后才能执行远程部署；本地开发使用 Wrangler 的本地模拟资源。
