PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_announcements_user_read ON announcements(user_id, read_at, created_at);

INSERT OR IGNORE INTO sections (name, slug, description, created_by)
VALUES ('默认板块', 'default', '系统默认板块，不可删除', NULL);

UPDATE articles
SET slug = 'article-' || id
WHERE slug IS NULL;
