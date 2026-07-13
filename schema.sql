PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  github_id TEXT UNIQUE,
  role INTEGER NOT NULL DEFAULT 1 CHECK (role BETWEEN 0 AND 4),
  avatar_url TEXT,
  bio TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
  visibility INTEGER NOT NULL DEFAULT 1 CHECK (visibility BETWEEN 0 AND 4),
  rejected_reason TEXT,
  section_id INTEGER REFERENCES sections(id),
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  post_id INTEGER REFERENCES announcement_posts(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS announcement_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  publisher_id INTEGER REFERENCES users(id),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 2),
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
  published_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS article_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'article',
  article_ids TEXT NOT NULL DEFAULT '[]',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  filename TEXT NOT NULL,
  r2_key TEXT UNIQUE NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id INTEGER,
  operator_id INTEGER REFERENCES users(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT,
  html_content TEXT NOT NULL,
  visibility INTEGER NOT NULL DEFAULT 1 CHECK (visibility BETWEEN 0 AND 4),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

CREATE INDEX IF NOT EXISTS idx_articles_status_visibility ON articles(status, visibility);
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_user_read ON announcements(user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_article_notifications_user_read ON article_notifications(user_id, read_at, created_at);
CREATE INDEX IF NOT EXISTS idx_announcement_posts_published ON announcement_posts(is_pinned, published_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_post_id ON announcements(post_id);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tools_visibility ON tools(visibility);

INSERT OR IGNORE INTO settings (key, value, description)
VALUES
  ('nav_items', '[{"label":"首页","path":"/","icon":"home"},{"label":"文章","path":"/articles","icon":"book"},{"label":"工具","path":"/tools","icon":"grid"}]', '公开导航菜单'),
  ('site_title', 'Tomori Web', '网站标题'),
  ('site_description', '轻量、开放的内容社区', '网站描述'),
  ('upload_max_size', '2097152', '上传大小限制，单位为字节'),
  ('article_max_size', '262144', '文章内容大小限制，单位为字节'),
  ('allow_registration', 'true', '是否开放用户注册'),
  ('tool_max_size', '262144', '工具 HTML 内容大小上限，单位为字节'),
  ('max_title_length', '200', '文章标题最大字符数'),
  ('max_excerpt_length', '300', '文章摘要最大字符数'),
  ('max_bio_length', '500', '个人简介最大字符数'),
  ('max_tags', '20', '单篇文章最多标签数量'),
  ('max_tag_length', '32', '单个标签最大字符数'),
  ('login_rate_limit', '10', '单个客户端每分钟最多登录请求数'),
  ('register_rate_limit', '10', '单个客户端每分钟最多注册请求数'),
  ('article_rate_limit', '20', '单个客户端每小时最多文章写入请求数'),
  ('upload_rate_limit', '30', '单个客户端每小时最多上传请求数'),
  ('review_rate_limit', '100', '单个客户端每小时最多审核请求数');

INSERT OR IGNORE INTO sections (name, slug, description, created_by)
VALUES ('默认板块', 'default', '系统默认板块，不可删除', NULL);
