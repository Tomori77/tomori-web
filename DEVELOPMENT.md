# 项目开发文档

## 1. 项目概述
- **项目名称**：tomori-web
- **类型**：轻量级内容管理与社区系统
- **技术栈**：
  - 前端：原生 HTML/CSS/JavaScript，SPA 模式，轻量路由（Navigo 或自主实现）
  - 后端：Cloudflare Workers（使用 Hono 框架）
  - 数据存储：Cloudflare D1（关系型数据） + R2（文件/图片存储）
  - 认证：JWT（`jose` 库签发/验证），密码哈希 `bcryptjs`，可选 GitHub OAuth
- **核心特性**：
  - 文章发布与审核流程
  - 基于角色的权限控制（0~4 级）
  - 动态可配置的导航页面（支持随时增减）
  - 超级管理员独立管理后台（仪表盘、日志、设置）
  - 文件上传限制（2MB），单篇文章内容限制 256KB
  - 工具页：可动态添加独立的 HTML 工具并展示运行
  - 数据迁移：支持一键导入导出

## 2. 架构设计
整体采用 **边缘计算 + 静态前端** 模式：
- 所有请求由 Cloudflare Worker 处理，Worker 提供两种职能：
  1. 返回前端静态资源（HTML/JS/CSS），通过 Workers Sites 或内联返回
  2. 提供 RESTful API（`/api/*`）
- 前端 SPA 运行在浏览器，通过 API 与 Worker 交互
- 数据存储：D1 负责用户、文章、工具、权限、设置、日志；R2 负责用户上传文件（头像、文章配图）
- 导航菜单由数据库 `settings` 表中 `nav_items` 配置，前端动态渲染，实现页面随时增减

## 3. 数据库设计（D1）

### 3.1 用户表 (`users`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 用户ID |
| username | TEXT UNIQUE NOT NULL | 用户名 |
| email | TEXT UNIQUE NOT NULL | 邮箱 |
| password_hash | TEXT | bcrypt 哈希（邮箱登录） |
| github_id | TEXT UNIQUE | GitHub OAuth ID |
| role | INTEGER DEFAULT 1 | 权限级别 0~4 |
| avatar_url | TEXT | 头像 R2 链接 |
| bio | TEXT | 个人简介 |
| is_banned | INTEGER DEFAULT 0 | 是否被封禁 |
| created_at | TEXT DEFAULT (datetime('now')) | 注册时间 |
| updated_at | TEXT DEFAULT (datetime('now')) | 更新时间 |

### 3.2 文章表 (`articles`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 文章ID |
| title | TEXT NOT NULL | 标题 |
| slug | TEXT UNIQUE | URL 友好标识 |
| content | TEXT NOT NULL | Markdown 内容（限制 256KB） |
| excerpt | TEXT | 摘要（可选） |
| author_id | INTEGER REFERENCES users(id) | 作者ID |
| status | TEXT DEFAULT 'draft' | 状态：draft/pending/published/rejected |
| visibility | INTEGER DEFAULT 1 | 最低可读权限级别（0~4） |
| rejected_reason | TEXT | 驳回原因（仅 status=rejected） |
| created_at | TEXT DEFAULT (datetime('now')) | 创建时间 |
| updated_at | TEXT DEFAULT (datetime('now')) | 更新时间 |

### 3.3 媒体文件表 (`media`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 文件ID |
| user_id | INTEGER REFERENCES users(id) | 上传者ID |
| filename | TEXT NOT NULL | 原始文件名 |
| r2_key | TEXT UNIQUE NOT NULL | R2 存储键（人类可读路径） |
| size | INTEGER | 文件大小（字节） |
| mime_type | TEXT | MIME 类型 |
| uploaded_at | TEXT DEFAULT (datetime('now')) | 上传时间 |

### 3.4 审核日志表 (`audit_logs`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 日志ID |
| action | TEXT NOT NULL | 操作类型（article_review/user_role_change/user_ban/setting_update 等） |
| target_id | INTEGER | 目标对象ID（文章/用户） |
| operator_id | INTEGER REFERENCES users(id) | 操作人ID |
| detail | TEXT | 详细信息（JSON） |
| created_at | TEXT DEFAULT (datetime('now')) | 操作时间 |

### 3.5 系统设置表 (`settings`)
| 字段 | 类型 | 说明 |
|------|------|------|
| key | TEXT PRIMARY KEY | 设置键 |
| value | TEXT | 设置值（JSON 字符串） |
| description | TEXT | 描述 |
| updated_at | TEXT DEFAULT (datetime('now')) | 更新时间 |

常用设置键：
- `nav_items`: JSON 数组，格式 `[{"label":"首页","path":"/","icon":"home"},...]`
- `site_title`: 网站标题
- `site_description`: 网站描述
- `upload_max_size`: 上传大小限制（字节），默认 2097152
- `article_max_size`: 文章内容大小限制（字节），默认 262144
- `allow_registration`: 是否开放注册 (`true`/`false`)

### 3.6 工具表 (`tools`)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PRIMARY KEY AUTOINCREMENT | 工具ID |
| name | TEXT NOT NULL | 工具名称 |
| description | TEXT | 功能注释/说明 |
| source | TEXT | 来源（作者或网址） |
| html_content | TEXT NOT NULL | 工具的完整 HTML 代码（包含 CSS/JS） |
| visibility | INTEGER DEFAULT 1 | 可见权限级别（0~4） |
| created_by | INTEGER REFERENCES users(id) | 添加者 |
| created_at | TEXT DEFAULT (datetime('now')) | 添加时间 |
| updated_at | TEXT DEFAULT (datetime('now')) | 更新时间 |


### 3.7 存储命名与人类可读性规范

#### 3.7.1 数据库表与字段
- 所有表名、字段名均使用小写英文单词，下划线分隔（snake_case），见名知义。
- 关联外键采用 `表名单数_id` 形式（如 `author_id`）。
- 时间字段统一后缀 `_at`（`created_at`, `updated_at`）。
- 状态字段使用明确的字符串枚举（如 `draft/pending/published/rejected`），避免数字代码。

#### 3.7.2 R2 文件存储路径
为便于人工管理和排查，R2 文件路径需遵循语义化层级结构，拒绝无意义随机名。

**路径格式**：`<类别>/<所有者或关联ID>/<日期或标识>/<原始文件名>`

示例：
- 用户头像：`avatars/<user_id>/<timestamp>-<original_filename>.webp`
- 文章配图：`articles/<article_id>/<timestamp>-<original_filename>.webp`
- 系统资源：`system/logo.png`

**规则**：
1. 保留原始文件名（过滤特殊字符，仅允许字母、数字、`-`、`_`），以便通过路径识别内容。
2. 添加时间戳或短哈希（8位）以防止同名覆盖，同时保持可读性，如 `20260712-image.png` 或 `a3f8-image.png`。
3. 路径层级体现归属关系，便于手动清理或迁移。
4. 禁止直接使用 D1 自动生成 ID 作为孤立的文件名，必须包含语义前缀。

**示例**：某用户 ID 为 42，上传头像，最终 R2 键为 `avatars/42/20260712-avatar.jpg`。

#### 3.7.3 D1 中保存的引用
- `users.avatar_url` 存储完整的 R2 访问 URL 或 Worker 代理路径（如 `/files/avatars/42/20260712-avatar.jpg`），而非单独的 key。
- `media` 表的 `r2_key` 字段存储上述规范路径，`filename` 存储原始文件名，便于展示。

这样无论是查看数据库记录还是直接浏览 R2 存储桶，都能一眼识别文件用途和归属。



## 4. API 设计（Hono Router）

### 4.1 认证相关
- `POST /api/auth/register` 注册（邮箱+密码）
- `POST /api/auth/login` 登录，返回 JWT
- `GET /api/auth/github` GitHub OAuth 起始
- `GET /api/auth/github/callback` OAuth 回调
- `GET /api/auth/me` 获取当前用户信息（需 Bearer Token）

### 4.2 用户相关（需登录）
- `GET /api/users/:id` 获取公开资料
- `PUT /api/users/me` 更新个人资料（昵称、头像、密码等）
- `GET /api/users/me/articles` 自己的文章列表（分页，支持状态过滤）

### 4.3 文章相关
- `GET /api/articles` 公开文章列表（只返回已发布且 visibility ≤ 当前用户级别）
- `GET /api/articles/:id` 单篇文章（权限检查）
- `POST /api/articles` 创建文章（作者以上，状态可为 draft/pending）
- `PUT /api/articles/:id` 编辑自己的文章（作者可编辑自己文章）
- `DELETE /api/articles/:id` 删除自己的文章（软删除或仅作者+管理员）
- `POST /api/articles/:id/submit` 提交审核（状态改为 pending）
- `GET /api/admin/articles/pending` 待审列表（管理员以上）
- `PUT /api/admin/articles/:id/review` 审核操作（通过/驳回，携带理由）

### 4.4 工具相关
- `GET /api/tools` – 获取当前用户可见的工具列表（按 visibility 过滤，分页可选）
- `GET /api/tools/:id` – 获取单个工具详情及 HTML 代码
- `POST /api/admin/tools` – 新增工具（管理员以上）
- `PUT /api/admin/tools/:id` – 修改工具信息或代码
- `DELETE /api/admin/tools/:id` – 删除工具

### 4.5 管理功能（需要对应权限）
- `GET /api/admin/users` 用户列表（支持搜索、分页，管理员以上）
- `PUT /api/admin/users/:id/role` 修改角色（超级管理员）
- `PUT /api/admin/users/:id/ban` 封禁/解封
- `GET /api/admin/logs` 操作日志列表（支持搜索）
- `GET /api/admin/stats` 仪表盘统计（文章数、用户数、待审核数等）
- `GET /api/admin/settings` 获取所有设置项
- `PUT /api/admin/settings` 批量更新设置（包含导航项）
- `POST /api/admin/pages` 创建自定义页面（可选）
- `PUT /api/admin/pages/:id`
- `DELETE /api/admin/pages/:id`

### 4.6 文件上传
- `POST /api/upload` 上传文件到 R2（需登录，限制大小 2MB），返回访问 URL
- 上传时验证文件大小和类型（图片仅允许 jpg/png/gif/webp）

### 4.7 数据迁移（仅超级管理员）
- `POST /api/admin/export` – 导出数据（JSON.gz），可选表及是否包含媒体文件
- `POST /api/admin/import` – 导入数据（multipart，附带二次密码验证）

### 4.8 通用
- `GET /api/settings/nav_items` 获取导航菜单（公开）
- `GET /api/settings/site_info` 获取站点标题等公开设置

## 5. 权限模型
| 级别 | 角色 | 说明 |
|------|------|------|
| 0 | 访客 | 未登录，只能看到 visibility=0 的文章、工具和公开页面 |
| 1 | 普通用户 | 注册登录后，可查看 visibility≤1 的内容 |
| 2 | 作者 | 可写文章、发布（需审核）、管理自己的文章 |
| 3 | 管理员 | 审核文章、管理用户（修改信息、封禁，但不能改角色）、管理工具 |
| 4 | 超级管理员 | 所有权限，包括升降角色、修改系统设置、查看日志、数据迁移 |

**权限检查中间件**：每个需要权限的 API 端点，通过 JWT 提取用户 role，与所需最低级别比较。

## 6. 前端路由与页面
采用 hash 路由（如 `#/`）或 history API（需 Worker 配置 fallback 到 index.html）。

页面清单：
- 首页文章列表 `/`
- 文章详情 `/article/:slug`
- 登录 `/login`
- 注册 `/register`
- 个人资料 `/profile`
- 我的文章 `/my-posts`
- 写作编辑器 `/editor` 或 `/editor/:id`
- 工具展示页 `/tools`：卡片网格展示所有可见工具，点击在模态框或独立页面运行 HTML
- 管理后台（根据角色显示不同菜单）：
  - 仪表盘 `/admin`
  - 文章审核 `/admin/review`
  - 用户管理 `/admin/users`
  - 工具管理 `/admin/tools`：列表管理，新增/编辑工具信息及代码，设置可见权限
  - 日志查看 `/admin/logs`
  - 系统设置 `/admin/settings`（包含导航编辑、基本设置、数据导入导出入口）
  - 自定义页面管理 `/admin/pages`

## 7. 关键业务逻辑
- **文章大小限制**：创建/更新文章时，计算 `new TextEncoder().encode(content).length`，超过 256KB 拒绝。
- **文件上传限制**：Worker 中读取 `Content-Length` 头，若大于 2MB 直接返回 413；R2 存储路径按人类可读规范生成。
- **审核流程**：作者提交后 status 变为 `pending`；管理员审核通过改为 `published`，驳回改为 `rejected` 并记录原因。
- **工具运行**：前端展示时通过 `iframe` 的 `srcdoc` 属性嵌入 `html_content`，并设置 `sandbox="allow-scripts allow-same-origin"`（按需调整权限），保证安全隔离。
- **权限控制**：访问文章或工具时，比较 `visibility` 与当前用户 role。
- **用户封禁**：封禁用户 `is_banned=1`，认证中间件拦截所有需登录的接口。
- **数据导入导出**：导出支持可选表和媒体 Base64 选项；导入使用二次密码验证，`replace` 模式下按依赖顺序清空表并重新插入，保留超级管理员账户。

## 8. 部署
- 使用 Wrangler CLI 管理
- Worker 绑定了 D1 数据库和 R2 存储桶
- 前端资源部署方式：将整个前端 SPA 打包后放入 `public/`，利用 Workers Sites 托管；或直接由 Worker 返回内联 HTML。推荐 Workers Sites 方式，方便管理与 API 同域。
- 环境变量：JWT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET 等。