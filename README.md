# tomori-web

Tomori Web 是基于 Cloudflare Workers、Hono、D1 和 R2 的轻量内容社区。

## 本地开发

```bash
npm install
npx wrangler d1 execute tomori-web-db --local --file=./migrations/001_initial.sql
npm run dev
```

打开 `http://localhost:8787` 查看前端骨架。

## API

- `GET /api` 返回 Worker 状态。
- `GET /api/health` 检查 D1 连接和 R2 绑定。
- `POST /api/auth/register` 注册并返回 JWT。
- `POST /api/auth/login` 登录并返回 JWT。
- `GET /api/auth/me` 获取当前登录用户。
- `PUT /api/users/me` 更新当前用户资料。
- `GET /api/articles` 获取公开文章列表，`GET /api/articles/:id-or-slug` 获取文章详情。
- `POST /api/articles`、`PUT /api/articles/:id`、`POST /api/articles/:id/submit` 管理作者文章。
- `GET /api/users/me/articles` 获取自己的文章列表，可按状态筛选。
- `GET /api/admin/articles/pending`、`PUT /api/admin/articles/:id/review` 管理文章审核。
- `POST /api/upload` 上传图片到 R2，大小限制 2 MB。
- `GET /api/tools`、`GET /api/tools/:id` 获取可见工具；管理员可通过 `/api/tools` 或 `/api/admin/tools` 的 POST/PUT/DELETE 管理工具。
- `GET /api/settings/nav_items`、`GET /api/settings/site_info` 获取公开站点设置。
- `/api/admin/users`、`/api/admin/logs`、`/api/admin/stats`、`/api/admin/settings` 提供管理后台数据接口。
- `/api/admin/users` 支持搜索、封禁和超级管理员角色调整；`/api/admin/logs` 及 `/api/admin/settings` 需要超级管理员权限。
- `/admin`、`/admin/dashboard`、`/admin/users`、`/admin/tools`、`/admin/logs`、`/admin/settings` 对应管理后台页面；工具使用 sandbox iframe 隔离运行。
- `/api/pages` 仍是后续自定义页面功能的占位路由；`/api/admin/*` 已要求管理员权限。

## Cloudflare 资源

`wrangler.toml` 中的 `database_id` 需要替换为实际 D1 数据库 ID。R2 桶名也需要与 Cloudflare 账户中的资源一致后才能执行远程部署；本地开发使用 Wrangler 的本地模拟资源。

阶段 2 本地开发需要注入 JWT 密钥：

```bash
wrangler secret put JWT_SECRET
```

本地也可以在 `.dev.vars` 中写入 `JWT_SECRET=...`。超级管理员账户需要在 D1 中将指定用户的 `role` 手动设为 `4`。

## 阶段 5 状态

- 已完成认证、文章写入、审核和上传接口的基础限流。
- 已完成图片 MIME 与文件魔数校验、文件响应安全头和文章危险标记校验。
- 已完成移动端断点、触摸区域、焦点样式和减少动效适配。
- 数据导入导出暂缓，当前没有开放对应 API。
