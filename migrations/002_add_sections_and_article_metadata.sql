PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE articles ADD COLUMN section_id INTEGER REFERENCES sections(id);
ALTER TABLE articles ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_sections_slug ON sections(slug);
CREATE INDEX IF NOT EXISTS idx_articles_section_id ON articles(section_id);
CREATE INDEX IF NOT EXISTS idx_articles_tags ON articles(tags);

UPDATE settings
SET value = '[{"label":"首页","path":"/","icon":"home"},{"label":"文章","path":"/articles","icon":"book"},{"label":"工具","path":"/tools","icon":"grid"}]',
    updated_at = datetime('now')
WHERE key = 'nav_items'
  AND value = '[{"label":"首页","path":"/","icon":"home"},{"label":"工具","path":"/tools","icon":"grid"}]';
