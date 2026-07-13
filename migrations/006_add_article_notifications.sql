PRAGMA foreign_keys = ON;

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

CREATE INDEX IF NOT EXISTS idx_article_notifications_user_read ON article_notifications(user_id, read_at, created_at);

INSERT INTO article_notifications (user_id, title, message, notification_type, article_ids, read_at, created_at)
SELECT user_id, '文章板块已调整',
       printf('你的 %d 篇文章所属板块已调整：%s', COUNT(*), group_concat(message, '；')),
       'section_move', '[]', NULL, MAX(created_at)
FROM announcements
WHERE title = '文章板块已调整'
GROUP BY user_id;

DELETE FROM announcements WHERE title = '文章板块已调整';
