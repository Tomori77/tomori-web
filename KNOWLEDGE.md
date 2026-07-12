# 开发知识文档

## 1. Cloudflare Workers 基础
- Workers 是 Cloudflare 的边缘计算服务，运行在 V8 隔离环境中。
- 每个 Worker 脚本可以处理 HTTP 请求并返回响应。
- 支持 Web 标准 API（Fetch, URL, Crypto 等），但无 Node.js API。
- 配合 **Wrangler** 命令行工具进行本地开发、部署和管理。

## 2. Hono 框架
- Hono 是专为 Cloudflare Workers 设计的轻量 Web 框架，速度快，支持中间件、路由、JWT 等。
- 安装：`npm install hono`
- 基本用法：
  ```ts
  import { Hono } from 'hono'
  const app = new Hono()
  app.get('/', (c) => c.text('Hello'))
  export default app
  ```
- 中间件：可使用 `app.use('*', middleware)` 进行全局拦截。

## 3. 数据存储：D1（关系型数据库）
- D1 是 Cloudflare 的全托管 SQLite 数据库，与 Worker 集成。
- 创建：`wrangler d1 create my-db`
- 在 `wrangler.toml` 绑定：
  ```toml
  [[d1_databases]]
  binding = "DB"
  database_name = "my-db"
  database_id = "..."
  ```
- 在 Worker 中使用：
  ```ts
  const { results } = await env.DB.prepare("SELECT * FROM users").all();
  ```
- 迁移：可以通过 `wrangler d1 execute` 执行 SQL 文件，或编写迁移文件。

## 4. 对象存储：R2
- R2 提供与 S3 兼容的对象存储，适合存放用户上传文件。
- 创建存储桶：`wrangler r2 bucket create my-bucket`
- 绑定：
  ```toml
  [[r2_buckets]]
  binding = "MY_BUCKET"
  bucket_name = "my-bucket"
  ```
- 上传文件：
  ```ts
  await env.MY_BUCKET.put(key, fileBody, { httpMetadata: { contentType: ... } });
  ```
- 公开访问：需将存储桶绑定自定义域名或在 Worker 中代理返回。

## 5. 身份认证：JWT + bcryptjs
- **JWT**：使用 `jose` 库，它是纯 JS 实现，支持 Worker 环境。
  - 签发：
    ```ts
    import { SignJWT } from 'jose'
    const token = await new SignJWT({ sub: user.id, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('2h')
      .sign(new TextEncoder().encode(secret))
    ```
  - 验证：使用 `jwtVerify`，从 Authorization header 提取 Bearer token。
- **密码哈希**：使用 `bcryptjs`，同步 API 可能会阻塞，但 Worker 环境接受。推荐 `hashSync(password, saltRounds)` 和 `compareSync(password, hash)`。
  - 安装：`npm install bcryptjs`

## 6. 权限模型与中间件
在 Hono 中创建权限中间件：
```ts
async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const token = authHeader.split(' ')[1]
    const { payload } = await jwtVerify(token, secret)
    c.set('user', payload) // 存入上下文
    await next()
  } catch (e) {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

function requireRole(minRole: number) {
  return async (c, next) => {
    const user = c.get('user')
    if (user.role < minRole) return c.json({ error: 'Forbidden' }, 403)
    await next()
  }
}
// 使用：app.post('/api/articles', authMiddleware, requireRole(2), handler)
```

## 7. 文件上传与大小限制
- Worker 中可使用 `c.req.formData()` 获取上传文件。
- 大小限制：在接受到请求后，先检查 `Content-Length` 头，若 > 2MB 直接返回 413。
  ```ts
  if (c.req.header('Content-Length') > 2_097_152) {
    return c.text('File too large', 413)
  }
  ```
- 文章内容大小：获取 `content` 后，用 `new TextEncoder().encode(content).length` 计算字节数，与 256KB 比较。

## 8. 前端 SPA 动态导航
- 前端在初始化时调用 `/api/settings/nav_items` 获取 JSON 数组。
- 动态渲染导航栏 DOM：遍历数组创建 `<a>` 标签。
- 管理后台提供 `nav_items` 编辑界面（如 JSON 编辑器或可视化列表），保存时 PUT `/api/admin/settings`。

## 9. Worker 同域托管静态文件
使用 Workers Sites 方式：
- `wrangler.toml` 中配置：
  ```toml
  [site]
  bucket = "./public"
  ```
- Worker 代码中结合 `@cloudflare/kv-asset-handler` 从 KV 获取静态文件。
- 另一种方式：直接将前端 HTML/JS/CSS 内联在 Worker 中返回，适合极小项目，但不推荐大型应用。

## 10. 开发最佳实践
- **错误处理**：Worker 中捕获所有异常，返回统一 JSON 错误格式。
- **数据校验**：使用简单函数校验输入（如邮箱格式、权限值范围）。
- **SQL 注入**：使用 D1 的预编译语句（`?` 占位符）。
- **CORS**：API 需设置 CORS 头，Hono 有 `cors()` 中间件。
- **日志**：超级管理员的操作记录应写入 `audit_logs` 表。

## 11. 部署流水线
1. 本地开发：`wrangler dev`（支持 D1 和 R2 本地模拟）
2. 执行数据库迁移：`wrangler d1 execute my-db --file=./migrations/001_initial.sql`
3. 发布 Worker：`wrangler publish`
4. 可选：绑定自定义域名到 Worker 路由。