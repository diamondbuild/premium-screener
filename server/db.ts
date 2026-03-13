import Database from "better-sqlite3";
import path from "path";

// Works in both ESM (dev via tsx) and CJS (production bundle)
const currentDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(new URL(import.meta.url).pathname);
const DB_PATH = path.join(currentDir, "..", "data", "screener.db");

// Ensure data directory exists
import fs from "fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

// ── Create tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS scan_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_date TEXT NOT NULL,
    completed_at TEXT,
    mode TEXT NOT NULL DEFAULT 'manual',
    total_tickers INTEGER NOT NULL DEFAULT 0,
    scanned_tickers INTEGER NOT NULL DEFAULT 0,
    total_trades INTEGER NOT NULL DEFAULT 0,
    csp_count INTEGER NOT NULL DEFAULT 0,
    pcs_count INTEGER NOT NULL DEFAULT 0,
    strangle_count INTEGER NOT NULL DEFAULT 0,
    ic_count INTEGER NOT NULL DEFAULT 0,
    avg_score REAL NOT NULL DEFAULT 0,
    avg_roc REAL NOT NULL DEFAULT 0,
    avg_pop REAL NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'complete',
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS trades (
    id TEXT NOT NULL,
    scan_id INTEGER NOT NULL,
    strategy_type TEXT NOT NULL,
    underlying_ticker TEXT NOT NULL,
    underlying_price REAL NOT NULL,
    legs_json TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    days_to_expiration INTEGER NOT NULL,
    net_credit REAL NOT NULL,
    max_profit REAL NOT NULL,
    max_loss REAL NOT NULL,
    break_even_low REAL,
    break_even_high REAL,
    risk_reward_ratio REAL NOT NULL,
    probability_of_profit REAL NOT NULL,
    net_delta REAL NOT NULL,
    net_theta REAL NOT NULL,
    net_vega REAL NOT NULL,
    avg_iv REAL NOT NULL,
    delta_z_score REAL NOT NULL,
    annualized_roc REAL NOT NULL,
    premium_per_day REAL NOT NULL,
    composite_score REAL NOT NULL,
    min_open_interest INTEGER NOT NULL,
    total_volume INTEGER NOT NULL,
    spread_width REAL,
    PRIMARY KEY (id, scan_id),
    FOREIGN KEY (scan_id) REFERENCES scan_records(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_trades_scan_id ON trades(scan_id);
  CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(scan_id, strategy_type);
  CREATE INDEX IF NOT EXISTS idx_trades_score ON trades(scan_id, composite_score DESC);
  CREATE INDEX IF NOT EXISTS idx_scan_date ON scan_records(scan_date DESC);

  CREATE TABLE IF NOT EXISTS watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    added_at TEXT NOT NULL,
    score_threshold REAL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_id INTEGER NOT NULL,
    ticker TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    trade_id TEXT NOT NULL,
    composite_score REAL NOT NULL,
    threshold REAL NOT NULL,
    scan_id INTEGER NOT NULL,
    triggered_at TEXT NOT NULL,
    seen INTEGER NOT NULL DEFAULT 0,
    net_credit REAL NOT NULL DEFAULT 0,
    annualized_roc REAL NOT NULL DEFAULT 0,
    probability_of_profit REAL NOT NULL DEFAULT 0,
    days_to_expiration INTEGER NOT NULL DEFAULT 0,
    expiration_date TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (watchlist_id) REFERENCES watchlist(id) ON DELETE CASCADE,
    FOREIGN KEY (scan_id) REFERENCES scan_records(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_seen ON alerts(seen, triggered_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_ticker ON alerts(ticker, triggered_at DESC);

  CREATE TABLE IF NOT EXISTS iv_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    atm_iv REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'scan',
    UNIQUE(ticker, date)
  );

  CREATE INDEX IF NOT EXISTS idx_iv_history_ticker_date ON iv_history(ticker, date DESC);

  CREATE TABLE IF NOT EXISTS journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    legs_json TEXT NOT NULL,
    expiration_date TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    entry_credit REAL NOT NULL,
    contracts INTEGER NOT NULL DEFAULT 1,
    underlying_price_at_entry REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    exit_date TEXT,
    exit_debit REAL,
    pnl_per_contract REAL,
    pnl_total REAL,
    pnl_percent REAL,
    underlying_price_at_exit REAL,
    max_loss REAL NOT NULL,
    spread_width REAL,
    composite_score_at_entry REAL,
    iv_rank_at_entry REAL,
    scan_trade_id TEXT,
    notes TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_journal_status ON journal_entries(status);
  CREATE INDEX IF NOT EXISTS idx_journal_ticker ON journal_entries(ticker);
  CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal_entries(entry_date DESC);
  CREATE INDEX IF NOT EXISTS idx_journal_strategy ON journal_entries(strategy_type);

  CREATE TABLE IF NOT EXISTS backtest_cache (
    cache_key TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    computed_at TEXT NOT NULL
  );
`);

export default db;
export { DB_PATH };
