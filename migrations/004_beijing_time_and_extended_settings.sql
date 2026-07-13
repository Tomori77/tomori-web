PRAGMA foreign_keys = ON;

UPDATE users SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE articles SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE sections SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE announcements SET created_at = datetime(created_at, '+8 hours'), read_at = CASE WHEN read_at IS NULL THEN NULL ELSE datetime(read_at, '+8 hours') END
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE media SET uploaded_at = datetime(uploaded_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE audit_logs SET created_at = datetime(created_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE settings SET updated_at = datetime(updated_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');
UPDATE tools SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours')
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'migration_004_beijing_time_applied');

INSERT OR IGNORE INTO settings (key, value, description, updated_at)
VALUES ('migration_004_beijing_time_applied', 'true', '内部迁移标记，不用于业务配置', datetime('now', '+8 hours'));

INSERT OR IGNORE INTO settings (key, value, description, updated_at) VALUES
  ('tool_max_size', '262144', '工具 HTML 内容大小上限，单位为字节', datetime('now', '+8 hours')),
  ('max_title_length', '200', '文章标题最大字符数', datetime('now', '+8 hours')),
  ('max_excerpt_length', '300', '文章摘要最大字符数', datetime('now', '+8 hours')),
  ('max_bio_length', '500', '个人简介最大字符数', datetime('now', '+8 hours')),
  ('max_tags', '20', '单篇文章最多标签数量', datetime('now', '+8 hours')),
  ('max_tag_length', '32', '单个标签最大字符数', datetime('now', '+8 hours')),
  ('login_rate_limit', '10', '单个客户端每分钟最多登录请求数', datetime('now', '+8 hours')),
  ('register_rate_limit', '10', '单个客户端每分钟最多注册请求数', datetime('now', '+8 hours')),
  ('article_rate_limit', '20', '单个客户端每小时最多文章写入请求数', datetime('now', '+8 hours')),
  ('upload_rate_limit', '30', '单个客户端每小时最多上传请求数', datetime('now', '+8 hours')),
  ('review_rate_limit', '100', '单个客户端每小时最多审核请求数', datetime('now', '+8 hours'));
