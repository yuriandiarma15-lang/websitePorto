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
let currentDate = null;   // trading_date yang lagi ditampilkan di tabel, format 'YYYY-MM-DD'
let latestDate = null;    // trading_date paling baru yang ada datanya (batas atas navigasi)

const MONTHS_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2,'0')} ${MONTHS_ID[m - 1]} ${y}`;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request gagal: ${url}`);
  return res.json();
}

async function init() {
  const dates = await fetchJSON('/api/dates');
  latestDate = dates.length > 0 ? dates[0].trading_date : todayISO();
  currentDate = latestDate;
  document.getElementById('date-picker').value = currentDate;
  document.getElementById('date-picker').max = latestDate;

  await Promise.all([loadOverallStats(), loadSelectedDate()]);
}

async function loadOverallStats() {
  const stats = await fetchJSON('/api/stats/overall');
  document.getElementById('stat-total').textContent = stats.total ?? 0;
  document.getElementById('stat-tp2').textContent = stats.TP2 ?? 0;
  document.getElementById('stat-tp1').textContent = stats.TP1 ?? 0;
  document.getElementById('stat-sl').textContent = stats.SL ?? 0;
  document.getElementById('stat-pending').textContent = stats.PENDING ?? 0;
  document.getElementById('stat-winrate').textContent = `${stats.win_rate ?? 0}%`;

  const pnlEl = document.getElementById('stat-pnl');
  const pnl = stats.total_pnl ?? 0;
  pnlEl.textContent = `${pnl >= 0 ? '$' : '-$'}${Math.abs(pnl).toFixed(2)}`;
  pnlEl.closest('.stat').classList.toggle('negative', pnl < 0);
}

async function loadSelectedDate() {
  document.getElementById('current-date').textContent = formatDateLabel(currentDate);
  document.getElementById('date-picker').value = currentDate;

  const data = await fetchJSON(`/api/signals?date=${currentDate}`);
  renderTable(data.signals);
  updateNavButtons();
  document.getElementById('last-sync').textContent = new Date().toLocaleTimeString('id-ID', { hour12: false });
}

function pnlCell(s) {
  let val = null;
  if (s.status === 'TP1') val = s.tp1_nominal;
  if (s.status === 'TP2') val = s.tp2_nominal;
  if (s.status === 'SL') val = s.sl_nominal;

  if (val == null) return `<span class="pnl-empty">&mdash;</span>`;
  const cls = val >= 0 ? 'pnl-positive' : 'pnl-negative';
  const sign = val >= 0 ? '+$' : '-$';
  return `<span class="${cls}">${sign}${Math.abs(val).toFixed(2)}</span>`;
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
      <td>${pnlCell(s)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function updateNavButtons() {
  document.getElementById('next-date').disabled = currentDate >= latestDate;
}

document.getElementById('prev-date').addEventListener('click', () => {
  currentDate = addDays(currentDate, -1);
  loadSelectedDate().catch(console.error);
});
document.getElementById('next-date').addEventListener('click', () => {
  if (currentDate >= latestDate) return;
  currentDate = addDays(currentDate, 1);
  loadSelectedDate().catch(console.error);
});

document.getElementById('calendar-btn').addEventListener('click', () => {
  const picker = document.getElementById('date-picker');
  if (picker.showPicker) picker.showPicker();
  else picker.focus();
});
document.getElementById('date-picker').addEventListener('change', (e) => {
  if (!e.target.value) return;
  currentDate = e.target.value;
  loadSelectedDate().catch(console.error);
});

// ===================== BOOT =====================
(async function boot() {
  await playBootSequence();
  try {
    await init();
  } catch (err) {
    console.error(err);
  }
  setInterval(() => {
    loadOverallStats().catch(console.error);
    loadSelectedDate().catch(console.error);
  }, 30000);
})();
