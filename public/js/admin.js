const KEY_STORAGE = 'xau_admin_api_key';

function getApiKey() { return localStorage.getItem(KEY_STORAGE); }
function setApiKey(k) { localStorage.setItem(KEY_STORAGE, k); }
function clearApiKey() { localStorage.removeItem(KEY_STORAGE); }

function showGate() {
  document.getElementById('key-gate').classList.remove('hidden');
  document.getElementById('admin-app').classList.add('hidden');
}
function showApp() {
  document.getElementById('key-gate').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ===================== KEY GATE =====================
document.getElementById('key-submit').addEventListener('click', async () => {
  const val = document.getElementById('key-input').value.trim();
  if (!val) return;
  setApiKey(val);
  document.getElementById('key-error').classList.add('hidden');
  showApp();
  try {
    await init();
  } catch (err) {
    console.error(err);
  }
});

// ===================== DATE HELPERS =====================
let currentDate = null;
let latestDate = null;
let currentSignals = [];

const MONTHS_ID = ['JAN','FEB','MAR','APR','MEI','JUN','JUL','AGU','SEP','OKT','NOV','DES'];

function formatDateLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${String(d).padStart(2,'0')} ${MONTHS_ID[m - 1]} ${y}`;
}
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function addDays(iso, delta) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request gagal (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

// ===================== LOAD & RENDER =====================
async function init() {
  const dates = await fetchJSON('/api/dates');
  latestDate = dates.length > 0 ? dates[0].trading_date : todayISO();
  currentDate = latestDate;
  document.getElementById('date-picker').max = latestDate;
  await loadSelectedDate();
}

async function loadSelectedDate() {
  document.getElementById('current-date').textContent = formatDateLabel(currentDate);
  document.getElementById('date-picker').value = currentDate;

  const data = await fetchJSON(`/api/signals?date=${currentDate}`);
  currentSignals = data.signals || [];
  renderTable(currentSignals);
  updateNavButtons();
}

function nominalForStatus(s, status) {
  if (status === 'TP1') return s.tp1_nominal;
  if (status === 'TP2') return s.tp2_nominal;
  if (status === 'SL') return s.sl_nominal;
  return null;
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
    const prefillNominal = nominalForStatus(s, s.status);

    tr.innerHTML = `
      <td>${s.sequence}</td>
      <td>${time}</td>
      <td class="${dirClass}">${s.direction}</td>
      <td>${s.entry_price}</td>
      <td>${s.sl_price}</td>
      <td>${s.tp1_price}</td>
      <td>${s.tp2_price}</td>
      <td>
        <select class="status-select" data-id="${s.id}">
          <option value="PENDING" ${s.status === 'PENDING' ? 'selected' : ''}>PENDING</option>
          <option value="TP1" ${s.status === 'TP1' ? 'selected' : ''}>TP1</option>
          <option value="TP2" ${s.status === 'TP2' ? 'selected' : ''}>TP2</option>
          <option value="SL" ${s.status === 'SL' ? 'selected' : ''}>SL</option>
        </select>
      </td>
      <td>
        <input type="number" step="0.01" class="nominal-input" data-id="${s.id}"
               placeholder="mis. 50 atau -40" value="${prefillNominal != null ? prefillNominal : ''}" />
      </td>
      <td class="row-controls">
        <button class="save-btn" data-id="${s.id}">SIMPAN</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.save-btn').forEach(btn => {
    btn.addEventListener('click', () => saveRow(btn.dataset.id));
  });
}

async function saveRow(id) {
  const select = document.querySelector(`.status-select[data-id="${id}"]`);
  const input = document.querySelector(`.nominal-input[data-id="${id}"]`);
  const btn = document.querySelector(`.save-btn[data-id="${id}"]`);

  const status = select.value;
  const nominalRaw = input.value.trim();
  const nominal = nominalRaw === '' ? null : parseFloat(nominalRaw);

  btn.disabled = true;
  btn.textContent = '...';
  try {
    await fetchJSON(`/api/signals/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': getApiKey() },
      body: JSON.stringify({ status, nominal }),
    });
    showToast(`Signal #${id} tersimpan: ${status}${nominal != null ? ` ($${nominal})` : ''}`);
    await loadSelectedDate();
  } catch (err) {
    if (err.status === 401) {
      showToast('API key salah / ditolak server.', true);
      clearApiKey();
      showGate();
    } else {
      showToast(err.message, true);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'SIMPAN';
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
  if (getApiKey()) {
    showApp();
    try {
      await init();
    } catch (err) {
      console.error(err);
      if (err.status === 401) {
        clearApiKey();
        showGate();
      }
    }
  } else {
    showGate();
  }
})();

// ============================================
// DAILY PNL
// ============================================

async function loadDailyPNL() {

    const date =
        document.getElementById("pnl-date").value ||
        currentDate;

    try{

        const data =
            await fetchJSON(
                "/api/daily-pnl?date="+date
            );

        const img =
            document.getElementById("pnl-preview");

        const empty =
            document.getElementById("no-image");

        if(data){

            img.src=data.image_path+
                "?t="+Date.now();

            img.style.display="block";
            empty.style.display="none";

        }else{

            img.style.display="none";
            empty.style.display="block";

        }

    }catch(e){

        console.error(e);

    }

}

document
.getElementById("pnl-date")
.addEventListener("change",loadDailyPNL);

document
.getElementById("upload-pnl")
.addEventListener("click",uploadDailyPNL);

document
.getElementById("delete-pnl")
.addEventListener("click",deleteDailyPNL);

async function uploadDailyPNL(){

    const file =
        document.getElementById("pnl-image").files[0];

    if(!file){

        showToast("Pilih gambar dahulu",true);
        return;

    }

    const fd=new FormData();

    fd.append("image",file);

    fd.append(
        "trading_date",
        document.getElementById("pnl-date").value
    );

    try{

        const res=await fetch(
            "/api/daily-pnl",
            {
                method:"POST",
                headers:{
                    "x-api-key":getApiKey()
                },
                body:fd
            }
        );

        const json=await res.json();

        if(!res.ok)
            throw new Error(json.error);

        showToast("Upload berhasil");

        loadDailyPNL();

    }catch(err){

        showToast(err.message,true);

    }

}

async function deleteDailyPNL(){

    const date=
        document.getElementById("pnl-date").value;

    if(!date) return;

    if(!confirm("Hapus screenshot ini?"))
        return;

    try{

        const res=await fetch(
            "/api/daily-pnl/"+date,
            {
                method:"DELETE",
                headers:{
                    "x-api-key":getApiKey()
                }
            }
        );

        const json=await res.json();

        if(!res.ok)
            throw new Error(json.error);

        showToast("Screenshot dihapus");

        loadDailyPNL();

    }catch(err){

        showToast(err.message,true);

    }

}
