// ===================== MATRIX RAIN BACKGROUND =====================
(function matrixRain() {
  const canvas = document.getElementById('matrix-bg');
  const ctx = canvas.getContext('2d');
  let w, h, columns, drops;
  const chars = '01XAUUSDABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    columns = Math.floor(w / 16);
    drops = new Array(columns).fill(1);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw() {
    ctx.fillStyle = 'rgba(6,10,6,0.08)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#33ff66';
    ctx.font = '14px monospace';
    for (let i = 0; i < drops.length; i++) {
      const text = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(text, i * 16, drops[i] * 16);
      if (drops[i] * 16 > h && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  setInterval(draw, 50);
})();

// ===================== LIVE CLOCK =====================
function updateClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('id-ID', { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();

// ===================== BOOT SEQUENCE =====================
const BOOT_LINES = [
  '> initializing signal.ai portfolio module...',
  '> connecting to XAUUSD data feed... [OK]',
  '> loading trading_date index...',
  '> syncing signal history...',
  '> rendering dashboard...',
];

async function playBootSequence() {
  const logEl = document.getElementById('boot-log');
  for (const line of BOOT_LINES) {
    const p = document.createElement('div');
    p.className = line.includes('OK') ? 'ok' : 'dim-line';
    logEl.appendChild(p);
    await typeLine(p, line);
    await sleep(120);
  }
  await sleep(250);
  document.getElementById('boot-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

function typeLine(el, text) {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      el.textContent = text.slice(0, i + 1);
      i++;
      if (i >= text.length) {
        clearInterval(interval);
        resolve();
      }
    }, 12);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ===================== DATA / STATE =====================
let availableDates = [];
let currentIndex = 0;

const MONTHS_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2,'0')} ${MONTHS_ID[m - 1]} ${y}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request gagal: ${url}`);
  return res.json();
}

async function loadDates() {
  const dates = await fetchJSON('/api/dates');
  availableDates = dates.map(d => d.trading_date);
  if (availableDates.length === 0) {
    // fallback: tampilkan hari ini walau kosong
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    availableDates = [iso];
  }
  currentIndex = 0; // paling baru
  await loadSelectedDate();
}

async function loadSelectedDate() {
  const date = availableDates[currentIndex];
  document.getElementById('current-date').textContent = formatDateLabel(date);

  const [data, stats] = await Promise.all([
    fetchJSON(`/api/signals?date=${date}`),
    fetchJSON(`/api/stats?date=${date}`),
  ]);

  renderStats(stats);
  renderTable(data.signals);
  updateNavButtons();
  document.getElementById('last-sync').textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function renderStats(stats) {
  document.getElementById('stat-total').textContent = stats.total ?? 0;
  document.getElementById('stat-tp2').textContent = stats.TP2 ?? 0;
  document.getElementById('stat-tp1').textContent = stats.TP1 ?? 0;
  document.getElementById('stat-sl').textContent = stats.SL ?? 0;
  document.getElementById('stat-pending').textContent = stats.PENDING ?? 0;
  document.getElementById('stat-winrate').textContent = `${stats.win_rate ?? 0}%`;
}

function renderTable(signals) {
  const tbody = document.getElementById('signal-tbody');
  const emptyState = document.getElementById('empty-state');
  tbody.innerHTML = '';

  if (!signals || signals.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  for (const s of signals) {
    const tr = document.createElement('tr');
    const time = new Date(s.signal_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dirClass = s.direction === 'BUY' ? 'dir-buy' : 'dir-sell';
    tr.innerHTML = `
      <td>${s.sequence}</td>
      <td>${time}</td>
      <td class="${dirClass}">${s.direction}</td>
      <td>${s.entry_price}</td>
      <td>${s.sl_price}</td>
      <td>${s.tp1_price}</td>
      <td>${s.tp2_price}</td>
      <td><span class="badge ${s.status}">${s.status}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

function updateNavButtons() {
  document.getElementById('prev-date').disabled = currentIndex >= availableDates.length - 1;
  document.getElementById('next-date').disabled = currentIndex <= 0;
}

document.getElementById('prev-date').addEventListener('click', () => {
  if (currentIndex < availableDates.length - 1) {
    currentIndex++;
    loadSelectedDate();
  }
});
document.getElementById('next-date').addEventListener('click', () => {
  if (currentIndex > 0) {
    currentIndex--;
    loadSelectedDate();
  }
});

// ===================== INIT =====================
(async function init() {
  await playBootSequence();
  try {
    await loadDates();
  } catch (err) {
    console.error(err);
  }
  // auto-refresh data tiap 30 detik (untuk lihat update dari bot monitor)
  setInterval(() => {
    loadSelectedDate().catch(console.error);
  }, 30000);
})();
