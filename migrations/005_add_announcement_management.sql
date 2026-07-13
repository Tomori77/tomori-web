PRAGMA foreign_keys = ON;

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

ALTER TABLE announcements ADD COLUMN post_id INTEGER REFERENCES announcement_posts(id);

CREATE INDEX IF NOT EXISTS idx_announcement_posts_published ON announcement_posts(is_pinned, published_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_announcements_post_id ON announcements(post_id);
