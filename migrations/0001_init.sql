CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  book TEXT NOT NULL,
  equity_usd REAL NOT NULL,
  pnl_price REAL NOT NULL,
  pnl_funding REAL NOT NULL,
  pnl_fees REAL NOT NULL,
  benchmark_pct REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  book TEXT NOT NULL,
  asset TEXT NOT NULL,
  size REAL NOT NULL,
  entry_px REAL NOT NULL,
  mark_px REAL NOT NULL,
  liq_px REAL,
  leverage REAL NOT NULL,
  funding_rate_hourly REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS fills (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  book TEXT NOT NULL,
  proposal_id TEXT,
  asset TEXT NOT NULL,
  side TEXT NOT NULL,
  size REAL NOT NULL,
  px REAL NOT NULL,
  fee_usd REAL NOT NULL,
  venue_tx TEXT
);

CREATE TABLE IF NOT EXISTS funding_payments (
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  book TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount_usd REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL,
  book TEXT NOT NULL,
  reason TEXT NOT NULL,
  orders_json TEXT NOT NULL,
  est_cost_usd REAL,
  status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS book_config (
  book TEXT PRIMARY KEY,
  budget_usd REAL NOT NULL,
  weights_json TEXT NOT NULL,
  leverage REAL NOT NULL,
  opened_ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_book_ts ON snapshots(book, ts);
CREATE INDEX IF NOT EXISTS idx_positions_book_ts ON positions(book, ts);
CREATE INDEX IF NOT EXISTS idx_fills_book_ts ON fills(book, ts);
CREATE INDEX IF NOT EXISTS idx_funding_book_ts ON funding_payments(book, ts);
