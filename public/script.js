/* global MONGO_CONFIG, DISPLAY_CONFIG, Chart */
'use strict';

// ============================================================
//  PARTICLE ANIMATION
// ============================================================
let particleCtx, particleCanvas;
const particles = [];

function initParticles() {
  particleCanvas = document.getElementById('particleCanvas');
  if (!particleCanvas) return;
  particleCtx = particleCanvas.getContext('2d');

  const resize = () => {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * particleCanvas.width,
      y: Math.random() * particleCanvas.height,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.1,
    });
  }
  requestAnimationFrame(animateParticles);
}

function animateParticles() {
  if (!particleCtx) return;
  particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);

  particles.forEach(p => {
    p.x += p.speedX;
    p.y += p.speedY;

    if (p.x < 0) p.x = particleCanvas.width;
    if (p.x > particleCanvas.width) p.x = 0;
    if (p.y < 0) p.y = particleCanvas.height;
    if (p.y > particleCanvas.height) p.y = 0;

    particleCtx.beginPath();
    particleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    particleCtx.fillStyle = `rgba(45, 212, 191, ${p.opacity})`;
    particleCtx.fill();
  });

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        particleCtx.beginPath();
        particleCtx.moveTo(particles[i].x, particles[i].y);
        particleCtx.lineTo(particles[j].x, particles[j].y);
        particleCtx.strokeStyle = `rgba(45, 212, 191, ${0.04 * (1 - dist / 120)})`;
        particleCtx.lineWidth = 0.5;
        particleCtx.stroke();
      }
    }
  }

  requestAnimationFrame(animateParticles);
}

// ============================================================
//  STATE
// ============================================================
const state = {
  waterLevel: 0,
  prevLevel: 0,
  pumpIn: false,
  pumpOut: false,
  lastUpdate: null,
  chartData: [],
  chartLabels: [],
  demoPhase: 0,
  pollInterval: null,
  currentMode: 'demo', // 'live' or 'demo'
};

const MAX_POINTS = 30;

// ============================================================
//  BACKEND API HELPER
// ============================================================
function apiUrl(path) {
  const base = (MONGO_CONFIG.BACKEND_URL || '').replace(/\/$/, '');
  return `${base}${path}`;
}

async function apiFetch(path, options = {}) {
  try {
    const res = await fetch(apiUrl(path), {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`API ${path} error:`, err.message);
    return null;
  }
}

// ============================================================
//  CHART
// ============================================================
let waterChart = null;

function initChart() {
  const canvas = document.getElementById('waterChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  waterChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: state.chartLabels,
      datasets: [
        {
          label: 'Mực nước (%)',
          data: state.chartData,
          borderColor: '#2dd4bf',
          backgroundColor: (scriptCtx) => {
            const { ctx: c, chartArea } = scriptCtx.chart;
            if (!chartArea) return 'rgba(45,212,191,0.1)';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(45,212,191,0.25)');
            g.addColorStop(1, 'rgba(45,212,191,0.01)');
            return g;
          },
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#2dd4bf',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Ngưỡng tràn (90%)',
          data: [],
          borderColor: 'rgba(248,113,113,0.4)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Ngưỡng cạn (10%)',
          data: [],
          borderColor: 'rgba(251,191,36,0.4)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(21, 29, 46, 0.95)',
          borderColor: 'rgba(45,212,191,0.2)',
          borderWidth: 1,
          titleColor: 'rgba(255,255,255,0.5)',
          bodyColor: '#f1f5f9',
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: c => c.datasetIndex === 0 ? `  Mực nước: ${Number(c.raw).toFixed(1)}%` : null,
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: "'JetBrains Mono', monospace" }, maxTicksLimit: 8, maxRotation: 0 },
          border: { display: false },
        },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: "'JetBrains Mono', monospace" }, callback: v => `${v}%`, stepSize: 25 },
          border: { display: false },
        },
      },
    },
  });
}

// ============================================================
//  UPDATE UI
// ============================================================
function getLevelColor(v) {
  const c = DISPLAY_CONFIG;
  if (v >= c.LEVEL_CRITICAL_HIGH || v <= c.LEVEL_CRITICAL_LOW) return 'danger';
  if (v >= c.LEVEL_WARNING_HIGH || v <= c.LEVEL_WARNING_LOW) return 'warning';
  return 'normal';
}

function updateUI({ level, pumpIn, pumpOut, timestamp }) {
  state.prevLevel = state.waterLevel;
  state.waterLevel = level;
  state.pumpIn = pumpIn;
  state.pumpOut = pumpOut;
  state.lastUpdate = timestamp || new Date();

  const status = getLevelColor(level);

  // === Tank water fill ===
  const tankWater = document.getElementById('tankWater');
  if (tankWater) {
    tankWater.style.height = `${level}%`;
    if (status === 'danger') {
      tankWater.style.background = 'linear-gradient(180deg, #f87171, rgba(248,113,113,0.4))';
    } else if (status === 'warning') {
      tankWater.style.background = 'linear-gradient(180deg, #fbbf24, rgba(251,191,36,0.4))';
    } else {
      tankWater.style.background = 'linear-gradient(180deg, #2dd4bf, rgba(45,212,191,0.4))';
    }
  }

  // === Gauge percent text ===
  const gp = document.getElementById('gaugePercent');
  if (gp) gp.textContent = `${level.toFixed(1)}%`;

  // === Logo water ===
  const logoWater = document.getElementById('logoWater');
  if (logoWater) logoWater.style.height = `${Math.max(10, level * 0.7)}%`;

  // === Device badge ===
  const devBadge = document.getElementById('deviceDot');
  if (devBadge) {
    if (status === 'danger') {
      devBadge.textContent = 'NGUY HIỂM';
      devBadge.className = 'panel-badge danger';
    } else if (status === 'warning') {
      devBadge.textContent = 'CẢNH BÁO';
      devBadge.className = 'panel-badge warning';
    } else {
      devBadge.textContent = 'ONLINE';
      devBadge.className = 'panel-badge';
    }
  }

  // === Alert glow on tank panel ===
  const gaugeCard = document.getElementById('gaugeCard');
  if (gaugeCard) {
    if (status === 'danger') gaugeCard.classList.add('alert-danger');
    else gaugeCard.classList.remove('alert-danger');
  }

  // === Level bar ===
  const bar = document.getElementById('levelBar');
  if (bar) {
    bar.style.width = `${level}%`;
    if (status === 'danger') {
      bar.style.background = 'linear-gradient(90deg, #991b1b, #f87171)';
    } else if (status === 'warning') {
      bar.style.background = 'linear-gradient(90deg, #92400e, #fbbf24)';
    } else {
      bar.style.background = 'linear-gradient(90deg, #2dd4bf, #67e8f9)';
    }
  }

  // === KPI values ===
  setText('valLevel', `${level.toFixed(1)}%`);
  setText('valVolume', `${Math.round(level / 100 * DISPLAY_CONFIG.TANK_CAPACITY_LITERS).toLocaleString()} L`);
  setText('valTime', formatTime(state.lastUpdate));

  // === Trend arrow ===
  const trend = document.getElementById('levelTrend');
  if (trend) {
    if (level > state.prevLevel + 0.5) {
      trend.className = 'kpi-trend up';
    } else if (level < state.prevLevel - 0.5) {
      trend.className = 'kpi-trend down';
    }
  }

  // === Status text ===
  let alertMsg = 'Bình thường';
  if (level >= DISPLAY_CONFIG.LEVEL_CRITICAL_HIGH) alertMsg = 'Nguy cơ tràn!';
  else if (level >= DISPLAY_CONFIG.LEVEL_WARNING_HIGH) alertMsg = 'Mực nước cao';
  else if (level <= DISPLAY_CONFIG.LEVEL_CRITICAL_LOW) alertMsg = 'Nguy cơ cạn!';
  else if (level <= DISPLAY_CONFIG.LEVEL_WARNING_LOW) alertMsg = 'Mực nước thấp';

  const valStatus = document.getElementById('valStatus');
  if (valStatus) {
    valStatus.textContent = alertMsg;
    valStatus.style.color = status === 'danger' ? '#f87171' : status === 'warning' ? '#fbbf24' : '#4ade80';
  }

  setText('valAlert', alertMsg);
  const vaEl = document.getElementById('valAlert');
  if (vaEl) vaEl.style.color = status === 'danger' ? '#f87171' : status === 'warning' ? '#fbbf24' : '#94a3b8';

  // === Alert dot on bell icon ===
  const alertDot = document.getElementById('alertDot');
  if (alertDot) {
    alertDot.className = status !== 'normal' ? 'alert-dot show' : 'alert-dot';
  }

  // === Pipes ===
  const pipeIn = document.getElementById('pipeIn');
  const pipeOut = document.getElementById('pipeOut');
  if (pipeIn) pipeIn.className = `pipe pipe-in${pumpIn ? ' active' : ''}`;
  if (pipeOut) pipeOut.className = `pipe pipe-out${pumpOut ? ' active' : ''}`;

  // === Pumps ===
  updatePump('pumpInBadge', 'pumpDot', pumpIn, 'pumpInItem');
  updatePump('pumpOutBadge', null, pumpOut, 'pumpOutItem');

  // === Pump control buttons state ===
  updatePumpButtons();

  // === Chart ===
  if (waterChart) {
    const label = formatTime(state.lastUpdate, true);
    if (state.chartLabels.length >= MAX_POINTS) {
      state.chartLabels.shift();
      state.chartData.shift();
    }
    state.chartLabels.push(label);
    state.chartData.push(parseFloat(level.toFixed(2)));
    waterChart.data.labels = state.chartLabels;
    waterChart.data.datasets[0].data = state.chartData;
    waterChart.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
    waterChart.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
    waterChart.update('none');
  }

  // === Update current time in topbar ===
  updateDateTime();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function updatePump(badgeId, dotId, isOn, itemId) {
  const badge = document.getElementById(badgeId);
  if (badge) {
    badge.textContent = isOn ? 'ĐANG CHẠY' : 'DỪNG';
    badge.className = `pump-badge ${isOn ? 'on' : 'off'}`;
  }

  if (dotId) {
    const dot = document.getElementById(dotId);
    if (dot) {
      if (isOn) {
        dot.textContent = 'HOẠT ĐỘNG';
        dot.className = 'panel-badge';
      } else {
        dot.textContent = 'CHỜ';
        dot.className = 'panel-badge warning';
      }
    }
  }

  if (itemId) {
    const item = document.getElementById(itemId);
    if (item) {
      if (isOn) item.classList.add('pump-active');
      else item.classList.remove('pump-active');
    }
  }
}

function updatePumpButtons() {
  const btnPumpIn = document.getElementById('btnPumpIn');
  const btnPumpOut = document.getElementById('btnPumpOut');

  if (btnPumpIn) {
    btnPumpIn.textContent = state.pumpIn ? '⏹ TẮT Bơm Vào' : '▶ BẬT Bơm Vào';
    btnPumpIn.className = `pump-control-btn ${state.pumpIn ? 'active' : ''}`;
    btnPumpIn.disabled = state.currentMode !== 'live';
  }
  if (btnPumpOut) {
    btnPumpOut.textContent = state.pumpOut ? '⏹ TẮT Bơm Ra' : '▶ BẬT Bơm Ra';
    btnPumpOut.className = `pump-control-btn ${state.pumpOut ? 'active' : ''}`;
    btnPumpOut.disabled = state.currentMode !== 'live';
  }
}

function formatTime(date, short = false) {
  if (!date) return '--:--:--';
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const dateStr = short ? '' : ` ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  return `${hh}:${mm}:${ss}${dateStr}`;
}

function updateDateTime() {
  const el = document.getElementById('currentDateTime');
  if (!el) return;
  const now = new Date();
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  el.textContent = `${days[now.getDay()]}, ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} • ${formatTime(now, true)}`;
}

// ============================================================
//  ALERT TOAST
// ============================================================
let lastAlertKey = '';

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function showToastIfNew(level) {
  const key = level >= DISPLAY_CONFIG.LEVEL_CRITICAL_HIGH ? 'overflow'
    : level <= DISPLAY_CONFIG.LEVEL_CRITICAL_LOW ? 'underflow'
      : level >= DISPLAY_CONFIG.LEVEL_WARNING_HIGH ? 'high'
        : level <= DISPLAY_CONFIG.LEVEL_WARNING_LOW ? 'low' : 'ok';

  if (key === lastAlertKey || key === 'ok') { lastAlertKey = key; return; }
  lastAlertKey = key;

  const msg = key === 'overflow' ? '⚠️ Cảnh báo: Mực nước gần tràn!'
    : key === 'underflow' ? '⚠️ Cảnh báo: Mực nước gần cạn!'
      : key === 'high' ? '📈 Mực nước đang tăng cao'
        : '📉 Mực nước đang giảm thấp';

  const type = key.includes('overflow') || key.includes('underflow') ? 'danger' : 'warning';
  showToast(msg, type);
}

// ============================================================
//  DEMO SIMULATION
// ============================================================
function demoData() {
  state.demoPhase += 0.04;
  const level = Math.min(100, Math.max(0, 50 + 32 * Math.sin(state.demoPhase * 0.5) + (Math.random() - 0.5) * 6));
  return { level, pumpIn: level < 40, pumpOut: level > 70, timestamp: new Date() };
}

// ============================================================
//  BACKEND API CALLS
// ============================================================
async function fetchLatest() {
  const result = await apiFetch('/api/latest');
  if (result && result.data) {
    return {
      level: result.data.water_level,
      pumpIn: result.data.pump_in,
      pumpOut: result.data.pump_out,
      timestamp: new Date(result.data.timestamp),
    };
  }
  return null;
}

async function fetchHistory() {
  const limit = MONGO_CONFIG.INITIAL_FETCH_LIMIT || 30;
  const result = await apiFetch(`/api/history?limit=${limit}`);
  if (result && result.data && result.data.length > 0) {
    result.data.forEach(doc => {
      const ts = new Date(doc.timestamp);
      state.chartLabels.push(formatTime(ts, true));
      state.chartData.push(parseFloat(doc.water_level.toFixed(2)));
    });
    if (waterChart) {
      waterChart.data.labels = state.chartLabels;
      waterChart.data.datasets[0].data = state.chartData;
      waterChart.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
      waterChart.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
      waterChart.update();
    }
    return true;
  }
  return false;
}

async function checkConnection() {
  const result = await apiFetch('/api/status');
  if (result && result.connected) {
    state.currentMode = 'live';
    setStatus('live');
    return true;
  }
  state.currentMode = 'demo';
  setStatus('demo');
  return false;
}

async function sendPumpCommand(pump, action) {
  if (state.currentMode !== 'live') {
    showToast('⚠️ Chế độ DEMO — không thể điều khiển bơm', 'warning');
    return;
  }

  const pumpName = pump === 'pump_in' ? 'Bơm Vào' : 'Bơm Ra';
  const actionText = action ? 'BẬT' : 'TẮT';

  showToast(`📤 Đang gửi lệnh ${actionText} ${pumpName}...`, 'info');

  const result = await apiFetch('/api/pump', {
    method: 'POST',
    body: JSON.stringify({ pump, action }),
  });

  if (result && result.success) {
    showToast(`✅ ${result.message}`, 'success');
  } else {
    showToast(`❌ Lỗi gửi lệnh: ${result?.error || 'Không kết nối được'}`, 'danger');
  }
}

// ============================================================
//  STATUS BADGE
// ============================================================
function setStatus(mode) {
  const el = document.getElementById('statusBadge');
  if (!el) return;
  const text = el.querySelector('.status-text');
  if (mode === 'live') {
    el.className = 'status-badge live';
    if (text) text.textContent = 'MONGODB';
  } else if (mode === 'demo') {
    el.className = 'status-badge demo';
    if (text) text.textContent = 'DEMO';
  } else {
    el.className = 'status-badge offline';
    if (text) text.textContent = 'OFFLINE';
  }
}

// ============================================================
//  POLL
// ============================================================
async function poll() {
  let data = null;

  if (state.currentMode === 'live') {
    data = await fetchLatest();
    if (data) {
      setStatus('live');
    } else {
      setStatus('offline');
    }
  }

  if (!data) {
    data = demoData();
    if (state.currentMode !== 'live') setStatus('demo');
  }

  updateUI(data);
  showToastIfNew(data.level);
}

// ============================================================
//  INIT
// ============================================================
async function init() {
  initParticles();
  initChart();
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Refresh button
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    poll().then(() => setTimeout(() => btn.classList.remove('spinning'), 600));
  });

  // Alert button
  const alertBtn = document.getElementById('alertBtn');
  if (alertBtn) alertBtn.addEventListener('click', () => {
    const lvl = state.waterLevel;
    const levelStatus = getLevelColor(lvl);
    const type = levelStatus === 'danger' ? 'danger' : levelStatus === 'warning' ? 'warning' : 'success';
    const msg = type === 'danger' ? `⚠️ Mực nước ${lvl.toFixed(1)}% — Cần xử lý ngay!`
      : type === 'warning' ? `⚠ Mực nước ${lvl.toFixed(1)}% — Cần chú ý`
        : `✅ Mực nước ${lvl.toFixed(1)}% — Hoạt động bình thường`;
    showToast(msg, type);
  });

  // Pump control buttons
  const btnPumpIn = document.getElementById('btnPumpIn');
  const btnPumpOut = document.getElementById('btnPumpOut');

  if (btnPumpIn) {
    btnPumpIn.addEventListener('click', () => {
      sendPumpCommand('pump_in', !state.pumpIn);
    });
  }
  if (btnPumpOut) {
    btnPumpOut.addEventListener('click', () => {
      sendPumpCommand('pump_out', !state.pumpOut);
    });
  }

  // Check backend connection & load history
  const isLive = await checkConnection();
  if (isLive) {
    await fetchHistory();
  } else {
    prefillDemoHistory();
  }

  poll();
  state.pollInterval = setInterval(poll, MONGO_CONFIG.POLL_INTERVAL_MS || 5000);
}

// Pre-fill demo chart history
function prefillDemoHistory() {
  const now = Date.now();
  const interval = (MONGO_CONFIG.POLL_INTERVAL_MS || 5000);
  const numPoints = 25;

  for (let i = numPoints; i >= 1; i--) {
    state.demoPhase += 0.04;
    const level = Math.min(100, Math.max(0,
      50 + 32 * Math.sin(state.demoPhase * 0.5) + (Math.random() - 0.5) * 6
    ));
    const ts = new Date(now - i * interval);
    state.chartLabels.push(formatTime(ts, true));
    state.chartData.push(parseFloat(level.toFixed(2)));
  }

  if (waterChart) {
    waterChart.data.labels = state.chartLabels;
    waterChart.data.datasets[0].data = state.chartData;
    waterChart.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
    waterChart.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
    waterChart.update();
  }
}

document.addEventListener('DOMContentLoaded', init);
