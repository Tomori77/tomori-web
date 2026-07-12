# 开发顺序 (DEVELOPMENT_ORDER.md)

## 第一阶段：项目骨架与基础设施
**目标**：项目可运行，数据库就绪，前端路由与基础 UI 框架搭建完毕。

1. 初始化 Wrangler 项目，配置 `wrangler.toml`，绑定 D1 数据库与 R2 存储桶。
2. 编写数据库初始化 SQL，创建所有表：
   - `users`, `articles`, `media`, `audit_logs`, `settings`, `tools`
3. 搭建 Worker 基础架构：
   - 引入 Hono，设置 CORS 中间件、错误处理中间件。
   - 创建占位路由（`/api/...`），返回 501 或简单 JSON。
4. 搭建前端骨架：
   - 创建 `public/index.html`，引入全局样式（毛玻璃、渐变背景）。
   - 实现前端路由系统（如 Navigo 或自研 history 路由），定义所有页面占位组件。
   - 构建静态导航栏（先写死几个链接）。
5. 验证：本地 `wrangler dev` 启动，页面可互相跳转，API 返回占位信息，数据库连接正常。

## 第二阶段：用户认证与权限体系
**目标**：完整的注册/登录流程，JWT 认证，角色中间件可用。

1. 实现认证 API：
   - `POST /api/auth/register` 邮箱密码注册（bcryptjs 哈希）。
   - `POST /api/auth/login` 返回 JWT（`jose` 库签发）。
   - `GET /api/auth/me` 返回当前用户信息（需有效 token）。
2. 编写 JWT 验证中间件，从 `Authorization: Bearer <token>` 提取并验证，将用户信息挂载到上下文。
3. 编写角色检查中间件 `requireRole(minRole)`，用于保护路由。
4. 前端登录/注册页面：
   - 表单 UI，对接 API，存储 token 到 `localStorage`。
   - 路由守卫：未登录用户访问需权限页面时跳转登录。
   - 登录后根据角色显示/隐藏导航项（暂用硬编码）。
5. 用户资料修改：`PUT /api/users/me`，前端个人资料页。
6. 初始化超级管理员账户（手动在 D1 中插入 role=4 的用户）。

## 第三阶段：核心内容——文章系统
**目标**：文章 CRUD、审核流程、权限过滤、文件上传。

1. 文章 API：
   - `POST /api/articles` 创建文章（校验内容大小 ≤ 256KB）。
   - `GET /api/articles` 公开列表（仅 status=published 且 visibility ≤ 用户 role）。
   - `GET /api/articles/:id` 文章详情（权限判断）。
   - `PUT /api/articles/:id` 编辑自己的文章。
   - `POST /api/articles/:id/submit` 提交审核（status → pending）。
   - 管理端：`GET /api/admin/articles/pending`、`PUT /api/admin/articles/:id/review`。
2. 文件上传：
   - `POST /api/upload`，大小限制 2MB，存储到 R2，按人类可读路径命名，写入 `media` 表。
3. 前端编辑器：
   - 集成 Markdown 编辑器（如 EasyMDE），实现新建/编辑文章、保存草稿、提交审核、图片上传。
4. 前端页面：
   - 首页文章列表（卡片）、文章详情页、我的文章列表（按状态筛选）。
   - 管理后台文章审核页（待审列表、通过/驳回操作）。
5. 所有文章相关的数据库查询均需结合权限模型，确保跨权限访问时数据隔离。

## 第四阶段：管理后台完善 + 工具页 + 动态导航
**目标**：管理功能完整，工具页可动态添加和使用，导航可可视化配置。

1. 用户管理 API（管理端）：
   - `GET /api/admin/users` 列表+搜索。
   - `PUT /api/admin/users/:id/role` 升降角色（超管）。
   - `PUT /api/admin/users/:id/ban` 封禁/解封。
2. 操作日志：
   - 在关键操作处写入 `audit_logs`（文章审核、角色变更、封禁等）。
   - 管理后台日志查看页面。
3. 系统设置：
   - `GET /api/admin/settings`、`PUT /api/admin/settings` 读写所有配置项。
   - 导航配置 `nav_items` 可视化编辑（JSON 或拖拽列表），修改后前端导航栏动态渲染。
4. 工具功能全栈：
   - 工具 CRUD API（`/api/tools`、`/api/admin/tools`），含 visibility 权限。
   - 工具展示页 `/tools`，卡片网格，点击通过 `iframe srcdoc` 安全运行 HTML。
   - 管理后台工具管理页：列表、新增/编辑表单、设置可见权限。
5. 管理仪表盘：聚合统计数据（总文章数、待审核数、用户数）并展示。

## 第五阶段：高级功能与优化
**目标**：数据迁移能力、多端适配打磨、安全加固与性能优化。

1. 数据导入导出：
   - `POST /api/admin/export` 导出 JSON.gz（可选表、是否包含媒体 Base64）。
   - `POST /api/admin/import` 导入，二次密码验证，replace 模式，保留超管账户。
2. 多端适配完善：
   - 按设计稿调试移动端、平板布局，确保所有页面可用。
   - 测试触摸交互、虚拟键盘对编辑器的影响。
3. 安全加固：
   - 为认证接口添加 rate limiting。
   - 文章渲染使用 DOMPurify 防 XSS。
   - 文件上传严格校验 MIME 类型和魔数。
4. 性能与体验：
   - 图片懒加载、代码分割（若有必要）。
   - 路由切换动画优化，减少布局抖动。
5. 可选增强：
   - WebSocket 实时通知（审核结果、新文章提醒）。
   - GitHub OAuth 登录集成。

## 开发原则
- 每阶段完成后再进入下一阶段，避免大量未完成代码互相阻塞。
- 前后端 API 成对开发，接口定义先行。
- 数据库迁移文件按阶段逐步追加，保持版本化。
- 每个阶段结束进行基本的功能验收，确保系统始终处于可运行状态。