const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'signals.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trading_date TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    pair TEXT NOT NULL DEFAULT 'XAUUSD',
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    sl_price REAL NOT NULL,
    tp1_price REAL NOT NULL,
    tp2_price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    signal_time TEXT NOT NULL,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_trading_date ON signals(trading_date);
`);

/**
 * Hitung "trading_date" dari timestamp asli.
 * Sesi berjalan 07:00 -> 02:00 dini hari berikutnya.
 * Jam 00:00 - 06:59 dianggap masih bagian dari trading_date HARI SEBELUMNYA.
 */
function getTradingDate(date = new Date()) {
  const d = new Date(date);
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = { db, getTradingDate };
