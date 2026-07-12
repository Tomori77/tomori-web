# 项目文件目录结构

```
tomori-web/
├── wrangler.toml              # Wrangler 配置，绑定 D1/R2
├── package.json               # 项目依赖 (honojs, jose, bcryptjs, ...)
├── tsconfig.json              # 如果使用 TypeScript（可选）
├── worker/
│   ├── index.ts               # Worker 入口，创建 Hono 应用
│   ├── router/                # 路由模块
│   │   ├── auth.ts
│   │   ├── articles.ts
│   │   ├── users.ts
│   │   ├── admin.ts
│   │   ├── upload.ts
│   │   ├── tools.ts           # 工具相关 API 路由
│   │   └── pages.ts           # 自定义页面 API
│   ├── middleware/             # 中间件
│   │   ├── auth.ts            # JWT 验证、角色检查
│   │   ├── errorHandler.ts
│   │   └── rateLimit.ts
│   ├── services/              # 业务逻辑层
│   │   ├── authService.ts
│   │   ├── articleService.ts
│   │   ├── userService.ts
│   │   ├── adminService.ts
│   │   ├── toolsService.ts    # 工具业务逻辑
│   │   └── settingsService.ts
│   ├── models/                # 数据模型或 SQL 查询封装
│   │   ├── user.ts
│   │   ├── article.ts
│   │   ├── tool.ts            # 工具模型
│   │   └── setting.ts
│   ├── utils/                 # 工具函数
│   │   ├── jwt.ts
│   │   ├── validators.ts     # 校验（大小限制等）
│   │   └── slugify.ts
│   └── types/                 # TypeScript 类型定义
│       └── index.ts
├── public/                    # 前端静态资源（Workers Sites）
│   ├── index.html             # SPA 入口
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── app.js             # 主应用，路由初始化
│   │   ├── router.js          # 前端路由定义
│   │   ├── api.js             # Fetch API 封装（带 Token）
│   │   ├── components/        # UI 组件
│   │   │   ├── navbar.js      # 动态导航栏
│   │   │   ├── articleCard.js
│   │   │   ├── editor.js      # Markdown 编辑器封装
│   │   │   └── ...
│   │   ├── pages/             # 页面视图
│   │   │   ├── home.js
│   │   │   ├── login.js
│   │   │   ├── profile.js
│   │   │   ├── editorPage.js
│   │   │   ├── tools.js       # 工具展示页
│   │   │   ├── admin/
│   │   │   │   ├── dashboard.js
│   │   │   │   ├── review.js
│   │   │   │   ├── users.js
│   │   │   │   ├── toolsManage.js  # 工具管理页
│   │   │   │   ├── logs.js
│   │   │   │   └── settings.js
│   │   │   └── ...
│   │   └── utils.js           # 通用函数
│   ├── images/                # 静态图片（如 logo）
│   └── favicon.ico
├── migrations/                # D1 数据库迁移文件
│   └── 001_initial.sql
├── schema.sql                 # 完整数据库模式参考
└── README.md
```

**说明**：
- 前端使用纯 JavaScript，无构建工具，所有 JS 文件通过 ES modules 引入（`<script type="module">`）或动态加载。
- Worker 代码推荐使用 TypeScript，Wrangler 默认支持编译。
- 目录 `public/` 直接作为 Workers Sites 的 asset 目录。