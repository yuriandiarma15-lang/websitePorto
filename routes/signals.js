const express = require('express');
const router = express.Router();
const { db, getTradingDate } = require('../db/db');

// --- Middleware: proteksi endpoint tulis (dipakai bot) dengan API key ---
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');
  if (!process.env.API_KEY) {
    return res.status(500).json({ error: 'API_KEY belum diset di server (.env)' });
  }
  if (key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: x-api-key tidak valid' });
  }
  next();
}

// --- GET /api/dates -> daftar semua trading_date yang ada datanya ---
router.get('/dates', (req, res) => {
  const rows = db.prepare(
    `SELECT trading_date, COUNT(*) as total FROM signals GROUP BY trading_date ORDER BY trading_date DESC`
  ).all();
  res.json(rows);
});

// --- GET /api/signals?date=YYYY-MM-DD -> list signal untuk 1 trading_date ---
router.get('/signals', (req, res) => {
  const date = req.query.date || getTradingDate();
  const rows = db.prepare(
    `SELECT * FROM signals WHERE trading_date = ? ORDER BY sequence ASC`
  ).all(date);
  res.json({ trading_date: date, signals: rows });
});

// --- GET /api/stats?date=YYYY-MM-DD -> ringkasan statistik hari itu ---
router.get('/stats', (req, res) => {
  const date = req.query.date || getTradingDate();
  const rows = db.prepare(`SELECT status FROM signals WHERE trading_date = ?`).all(date);
  const stats = { total: rows.length, PENDING: 0, TP1: 0, TP2: 0, SL: 0 };
  rows.forEach(r => { stats[r.status] = (stats[r.status] || 0) + 1; });
  const resolved = stats.TP1 + stats.TP2 + stats.SL;
  const wins = stats.TP1 + stats.TP2;
  stats.win_rate = resolved > 0 ? Math.round((wins / resolved) * 1000) / 10 : 0;
  res.json(stats);
});

// --- POST /api/signals -> bot 1 (signal generator) kirim signal baru ---
router.post('/signals', requireApiKey, (req, res) => {
  const { direction, entry_price, sl_price, tp1_price, tp2_price, signal_time } = req.body;

  if (!direction || entry_price == null || sl_price == null || tp1_price == null || tp2_price == null) {
    return res.status(400).json({ error: 'Field wajib: direction, entry_price, sl_price, tp1_price, tp2_price' });
  }

  const ts = signal_time ? new Date(signal_time) : new Date();
  const tradingDate = getTradingDate(ts);

  const countRow = db.prepare(
    `SELECT COUNT(*) as c FROM signals WHERE trading_date = ?`
  ).get(tradingDate);
  const sequence = countRow.c + 1;

  const info = db.prepare(`
    INSERT INTO signals (trading_date, sequence, direction, entry_price, sl_price, tp1_price, tp2_price, signal_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tradingDate, sequence, direction.toUpperCase(), entry_price, sl_price, tp1_price, tp2_price, ts.toISOString());

  const created = db.prepare(`SELECT * FROM signals WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(created);
});

// --- PATCH /api/signals/:id/status -> bot 2 (monitor) update status ---
router.patch('/signals/:id/status', requireApiKey, (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // 'TP1' | 'TP2' | 'SL'

  const valid = ['PENDING', 'TP1', 'TP2', 'SL'];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status harus salah satu dari: ${valid.join(', ')}` });
  }

  const signal = db.prepare(`SELECT * FROM signals WHERE id = ?`).get(id);
  if (!signal) return res.status(404).json({ error: 'Signal tidak ditemukan' });

  // Aturan state machine: begitu TP1 kena, tidak boleh turun ke SL lagi.
  if (signal.status === 'TP1' && status === 'SL') {
    return res.status(409).json({ error: 'Signal sudah TP1, tidak bisa diubah jadi SL' });
  }
  if ((signal.status === 'TP2' || signal.status === 'SL') && signal.status !== status) {
    return res.status(409).json({ error: `Signal sudah final dengan status ${signal.status}` });
  }

  const isFinal = status === 'TP2' || status === 'SL';
  db.prepare(`
    UPDATE signals SET status = ?, resolved_at = ? WHERE id = ?
  `).run(status, isFinal ? new Date().toISOString() : signal.resolved_at, id);

  const updated = db.prepare(`SELECT * FROM signals WHERE id = ?`).get(id);
  res.json(updated);
});

module.exports = router;
