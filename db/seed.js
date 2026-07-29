// Jalankan: npm run seed
// Mengisi data DEMO 20 signal untuk trading_date hari ini, supaya
// tampilan portofolio tidak kosong sebelum bot asli mulai kirim data.
const { db, getTradingDate } = require('./db');

const tradingDate = getTradingDate();
console.log(`Seeding data demo untuk trading_date: ${tradingDate}`);

db.prepare(`DELETE FROM signals WHERE trading_date = ?`).run(tradingDate);

const insert = db.prepare(`
  INSERT INTO signals (trading_date, sequence, direction, entry_price, sl_price, tp1_price, tp2_price, status, signal_time, resolved_at, tp1_nominal, tp2_nominal, sl_nominal)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let base = 2400;
const statuses = ['TP2','TP1','SL','TP2','PENDING'];

for (let i = 1; i <= 20; i++) {
  const direction = i % 2 === 0 ? 'SELL' : 'BUY';
  const entry = +(base + (Math.random() * 10 - 5)).toFixed(2);
  const sl = direction === 'BUY' ? +(entry - 8).toFixed(2) : +(entry + 8).toFixed(2);
  const tp1 = direction === 'BUY' ? +(entry + 6).toFixed(2) : +(entry - 6).toFixed(2);
  const tp2 = direction === 'BUY' ? +(entry + 14).toFixed(2) : +(entry - 14).toFixed(2);
  const status = i === 20 ? 'PENDING' : statuses[i % statuses.length];
  const hour = (6 + i) % 24;
  const signalTime = new Date();
  signalTime.setHours(hour, 0, 0, 0);

  // nominal contoh (dalam USD) - ini nanti diisi manual oleh kamu lewat /admin
  const tp1_nominal = status === 'TP1' || status === 'TP2' ? 50 : null;
  const tp2_nominal = status === 'TP2' ? 120 : null;
  const sl_nominal = status === 'SL' ? -40 : null;

  insert.run(
    tradingDate, i, direction, entry, sl, tp1, tp2, status,
    signalTime.toISOString(),
    status !== 'PENDING' ? new Date().toISOString() : null,
    tp1_nominal, tp2_nominal, sl_nominal
  );
  base = entry;
}

console.log('Selesai. 20 signal demo berhasil dibuat.');
