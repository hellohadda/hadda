-- Cloudflare D1 数据库表结构
-- 在 Cloudflare Dashboard 中创建 D1 数据库后，执行此 SQL 创建表

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL UNIQUE,
  x_handle TEXT NOT NULL,
  tweet_link TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_wallet_address ON submissions(wallet_address);
CREATE INDEX IF NOT EXISTS idx_submitted_at ON submissions(submitted_at);

