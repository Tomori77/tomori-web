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
- `GET /api/sections` 获取板块列表，`GET /api/sections/:slug` 获取板块文章。
- `GET /api/articles?q=...` 按文章标题、板块名称/slug 和 tags 搜索。
- `POST /api/articles`、`PUT /api/articles/:id`、`POST /api/articles/:id/submit` 管理作者文章。
- `GET /api/users/me/articles` 获取自己的文章列表，可按状态筛选。
- `GET /api/admin/articles/pending`、`PUT /api/admin/articles/:id/review` 管理文章审核。
- `POST /api/upload` 上传图片到 R2，大小限制 2 MB。
- `GET /api/tools`、`GET /api/tools/:id` 获取可见工具；管理员可通过 `/api/tools` 或 `/api/admin/tools` 的 POST/PUT/DELETE 管理工具。
- `GET /api/settings/nav_items`、`GET /api/settings/site_info` 获取公开站点设置。
- `/api/admin/users`、`/api/admin/logs`、`/api/admin/stats`、`/api/admin/settings` 提供管理后台数据接口。
- `/api/admin/users` 支持搜索、封禁和超级管理员角色调整；`/api/admin/logs` 及 `/api/admin/settings` 需要超级管理员权限。
- `/admin`、`/admin/dashboard`、`/admin/users`、`/admin/tools`、`/admin/logs`、`/admin/settings` 对应管理后台页面；工具使用 sandbox iframe 隔离运行。
- `/admin/articles` 显示全部文章，按板块和发布人分组，分类默认折叠；含有文章的板块不可删除。
- `/api/pages` 仍是后续自定义页面功能的占位路由；`/api/admin/*` 已要求管理员权限。

## Cloudflare 资源

`wrangler.toml` 中的 `database_id` 需要替换为实际 D1 数据库 ID。R2 桶名也需要与 Cloudflare 账户中的资源一致后才能执行远程部署；本地开发使用 Wrangler 的本地模拟资源。

阶段 2 本地开发需要注入 JWT 密钥：

```bash
wrangler secret put JWT_SECRET
```

本地也可以在 `.dev.vars` 中写入 `JWT_SECRET=...` 和 `SUPER_ADMIN_EMAIL=...`。

### Cloudflare 控制台配置超级管理员

在 Cloudflare Dashboard 中打开 `Workers & Pages`，进入 `tomori-web`，然后打开 `Settings` → `Variables and Secrets`。新增一个明文变量：

```text
变量名：SUPER_ADMIN_EMAIL
变量值：你的管理员邮箱
```

同时确认 `JWT_SECRET` 已作为 Secret 配置。保存并部署后，使用该邮箱注册的新用户会自动获得 `role=4` 超级管理员权限；邮箱比较会忽略首尾空格和大小写。

该规则只对注册时生效，不会自动修改已经存在的同邮箱用户。若该邮箱已经注册，需要在 D1 中执行一次：

```bash
npx wrangler d1 execute tomori-web-db --remote --command "UPDATE users SET role = 4, updated_at = datetime('now') WHERE email = '你的管理员邮箱';"
```

## 阶段 5 状态

- 已完成认证、文章写入、审核和上传接口的基础限流。
- 已完成图片 MIME 与文件魔数校验、文件响应安全头和文章危险标记校验。
- 已完成移动端断点、触摸区域、焦点样式和减少动效适配。
- 数据导入导出暂缓，当前没有开放对应 API。
