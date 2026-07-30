const express = require('express');
const router = express.Router();
const { db, getTradingDate } = require('../db/db');

const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');

// --- Middleware: proteksi endpoint tulis (dipakai bot & admin) dengan API key ---
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
  const rows = db.prepare(`SELECT status, tp1_nominal, tp2_nominal, sl_nominal FROM signals WHERE trading_date = ?`).all(date);
  res.json(computeStats(rows));
});

// --- GET /api/stats/overall -> gabungan SEMUA tanggal (all-time) ---
router.get('/stats/overall', (req, res) => {
  const rows = db.prepare(`SELECT status, tp1_nominal, tp2_nominal, sl_nominal FROM signals`).all();
  res.json(computeStats(rows));
});

// --- Helper: hitung ringkasan dari kumpulan baris signal ---
function computeStats(rows) {
  const stats = { total: rows.length, PENDING: 0, TP1: 0, TP2: 0, SL: 0, total_pnl: 0 };
  rows.forEach(r => {
    stats[r.status] = (stats[r.status] || 0) + 1;
    if (r.status === 'TP1') stats.total_pnl += r.tp1_nominal || 0;
    if (r.status === 'TP2') stats.total_pnl += r.tp2_nominal || 0;
    if (r.status === 'SL') stats.total_pnl += r.sl_nominal || 0;
  });
  const resolved = stats.TP1 + stats.TP2 + stats.SL;
  const wins = stats.TP1 + stats.TP2;
  stats.win_rate = resolved > 0 ? Math.round((wins / resolved) * 1000) / 10 : 0;
  stats.total_pnl = Math.round(stats.total_pnl * 100) / 100;
  return stats;
}

// --- POST /api/signals -> bot kirim signal baru (mentah, tanpa status/nominal) ---
router.post('/signals', requireApiKey, (req, res) => {
  const { direction, entry_price, sl_price, tp1_price, tp2_price, signal_time } = req.body;

  if (!direction || entry_price == null || sl_price == null || tp1_price == null || tp2_price == null) {
    return res.status(400).json({ error: 'Field wajib: direction, entry_price, sl_price, tp1_price, tp2_price' });
  }

  const ts = signal_time
  ? new Date(signal_time)
  : (() => {
      const d = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "Asia/Jakarta"
        })
      );

      d.setHours(d.getHours() - 1);

      return d;
    })();

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

// --- PATCH /api/signals/:id/status -> update status + nominal (diisi manual lewat /admin) ---
router.patch('/signals/:id/status', requireApiKey, (req, res) => {
  const { id } = req.params;
  const { status, nominal } = req.body; // status: 'TP1' | 'TP2' | 'SL' | 'PENDING', nominal: angka $ (opsional)

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

  // Nominal disimpan per tahap (TP1/TP2/SL) supaya histori tidak hilang
  // walau signal lanjut dari TP1 -> TP2.
  const tp1_nominal = status === 'TP1' && nominal != null ? nominal : signal.tp1_nominal;
  const tp2_nominal = status === 'TP2' && nominal != null ? nominal : signal.tp2_nominal;
  const sl_nominal  = status === 'SL'  && nominal != null ? nominal : signal.sl_nominal;

  db.prepare(`
    UPDATE signals
    SET status = ?, resolved_at = ?, tp1_nominal = ?, tp2_nominal = ?, sl_nominal = ?
    WHERE id = ?
  `).run(
    status,
    isFinal ? new Date().toISOString() : signal.resolved_at,
    tp1_nominal, tp2_nominal, sl_nominal,
    id
  );

  
const updated = db.prepare(`SELECT * FROM signals WHERE id = ?`).get(id);
res.json(updated);
});


// ===========================================
// DAILY PNL
// ===========================================

router.post(
  "/daily-pnl",
  requireApiKey,
  upload.single("image"),
  (req, res) => {

    const trading_date =
      req.body.trading_date || getTradingDate();

    if (!req.file) {
      return res.status(400).json({
        error: "Image wajib diupload"
      });
    }

    const image_path =
      "/uploads/pnl/" + req.file.filename;

    db.prepare(`
      INSERT INTO daily_pnl
      (trading_date,image_path)
      VALUES(?,?)
      ON CONFLICT(trading_date)
      DO UPDATE SET
      image_path=excluded.image_path
    `).run(
      trading_date,
      image_path
    );

    res.json({
  success: true,
  image: image_path
 });

   }
);

router.get("/daily-pnl", (req, res) => {

  const trading_date =
    req.query.date || getTradingDate();

  const row = db.prepare(`
    SELECT *
    FROM daily_pnl
    WHERE trading_date=?
  `).get(trading_date);

  res.json(row || null);

});

router.delete(
  "/daily-pnl/:date",
  requireApiKey,
  (req, res) => {

    const row = db.prepare(`
      SELECT *
      FROM daily_pnl
      WHERE trading_date=?
    `).get(req.params.date);

    if (!row) {
      return res.status(404).json({
        error: "Data tidak ditemukan"
      });
    }

    const file =
      path.join(
        __dirname,
        "..",
        row.image_path
      );

    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }

    db.prepare(`
      DELETE FROM daily_pnl
      WHERE trading_date=?
    `).run(req.params.date);

    res.json({
      success: true
 });
  
  }
});

module.exports = router;
