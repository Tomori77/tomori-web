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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  filename TEXT NOT NULL,
  r2_key TEXT UNIQUE NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_id INTEGER,
  operator_id INTEGER REFERENCES users(id),
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT,
  html_content TEXT NOT NULL,
  visibility INTEGER NOT NULL DEFAULT 1 CHECK (visibility BETWEEN 0 AND 4),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_status_visibility ON articles(status, visibility);
CREATE INDEX IF NOT EXISTS idx_articles_author_id ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_tools_visibility ON tools(visibility);

INSERT OR IGNORE INTO settings (key, value, description)
VALUES
  ('nav_items', '[{"label":"首页","path":"/","icon":"home"},{"label":"工具","path":"/tools","icon":"grid"}]', '公开导航菜单'),
  ('site_title', 'Tomori Web', '网站标题'),
  ('site_description', '轻量、开放的内容社区', '网站描述'),
  ('upload_max_size', '2097152', '上传大小限制，单位为字节'),
  ('article_max_size', '262144', '文章内容大小限制，单位为字节'),
  ('allow_registration', 'true', '是否开放用户注册');
