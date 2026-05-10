/* global MQTT_CONFIG, DISPLAY_CONFIG, Chart, mqtt */
'use strict';

// ============================================================
//  AUTH MODULE (localStorage-based) — with Admin/User roles
// ============================================================
const Auth = {
  STORAGE_KEY: 'aquamonitor_users',
  SESSION_KEY: 'aquamonitor_session',
  DEFAULT_ADMIN: {
    id: 'admin_root',
    name: 'Administrator',
    username: 'admin',
    password: 'Admin@123',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
  },

  // Seed default admin if not exists (auto-migrate old email-based data)
  seedAdmin() {
    const users = this.getUsers();
    // Migration: if users have 'email' but no 'username', clear old data
    if (users.length > 0 && users[0].email && !users[0].username) {
      localStorage.removeItem(this.STORAGE_KEY);
    }
    const current = this.getUsers();
    if (!current.find(u => u.role === 'admin')) {
      current.unshift({ ...this.DEFAULT_ADMIN });
      this.saveUsers(current);
    }
  },

  // Get all registered users
  getUsers() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || [];
    } catch { return []; }
  },

  // Save users array
  saveUsers(users) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
  },

  // Register a new user (always role 'user')
  register(name, username, password) {
    const users = this.getUsers();
    const usernameLower = username.toLowerCase().trim();

    if (users.find(u => u.username === usernameLower)) {
      return { ok: false, error: 'T\u00ean \u0111\u0103ng nh\u1eadp \u0111\u00e3 t\u1ed3n t\u1ea1i' };
    }

    users.push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: name.trim(),
      username: usernameLower,
      password: password,
      role: 'user',
      createdAt: new Date().toISOString(),
    });

    this.saveUsers(users);
    return { ok: true };
  },

  // Login
  login(username, password) {
    const users = this.getUsers();
    const usernameLower = username.toLowerCase().trim();
    const user = users.find(u => u.username === usernameLower);

    if (!user) {
      return { ok: false, error: 'T\u00ean \u0111\u0103ng nh\u1eadp kh\u00f4ng t\u1ed3n t\u1ea1i' };
    }
    if (user.password !== password) {
      return { ok: false, error: 'M\u1eadt kh\u1ea9u kh\u00f4ng ch\u00ednh x\u00e1c' };
    }

    // Save session with role
    sessionStorage.setItem(this.SESSION_KEY, JSON.stringify({
      id: user.id, name: user.name, username: user.username, role: user.role || 'user'
    }));

    return { ok: true, user };
  },

  // Logout
  logout() {
    sessionStorage.removeItem(this.SESSION_KEY);
  },

  // Check if logged in
  isLoggedIn() {
    return !!sessionStorage.getItem(this.SESSION_KEY);
  },

  // Get current user info
  getCurrentUser() {
    try {
      return JSON.parse(sessionStorage.getItem(this.SESSION_KEY));
    } catch { return null; }
  },

  // Check if current user is admin
  isAdmin() {
    const user = this.getCurrentUser();
    return user && user.role === 'admin';
  },

  // Admin: get all users (excluding passwords)
  getAllUsers() {
    return this.getUsers().map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role || 'user',
      createdAt: u.createdAt,
    }));
  },

  // Admin: kick (delete) a user by id
  kickUser(userId) {
    const users = this.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return { ok: false, error: 'User kh\u00f4ng t\u1ed3n t\u1ea1i' };
    if (target.role === 'admin') return { ok: false, error: 'Kh\u00f4ng th\u1ec3 x\u00f3a t\u00e0i kho\u1ea3n Admin' };
    const filtered = users.filter(u => u.id !== userId);
    this.saveUsers(filtered);
    return { ok: true, name: target.name };
  }
};

// ============================================================
//  AUTH UI CONTROLLER
// ============================================================
function initAuth() {
  const overlay = document.getElementById('authOverlay');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const showRegisterLink = document.getElementById('showRegister');
  const showLoginLink = document.getElementById('showLogin');

  if (!overlay) return;

  // Switch forms
  showRegisterLink?.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
    clearAllErrors();
  });

  showLoginLink?.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
    clearAllErrors();
  });

  // Password visibility toggles
  document.querySelectorAll('.auth-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        // Update icon opacity
        btn.style.color = input.type === 'text' ? 'var(--teal)' : '';
      }
    });
  });

  // Login form submit
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    let hasError = false;

    if (!username || username.trim().length < 2) {
      showFieldError('loginUsernameField', 'loginUsernameError', 'Vui l\u00f2ng nh\u1eadp t\u00ean \u0111\u0103ng nh\u1eadp');
      hasError = true;
    }
    if (!password) {
      showFieldError('loginPasswordField', 'loginPasswordError', 'Vui l\u00f2ng nh\u1eadp m\u1eadt kh\u1ea9u');
      hasError = true;
    }
    if (hasError) return;

    const result = Auth.login(username, password);
    if (!result.ok) {
      if (result.error.includes('T\u00ean')) {
        showFieldError('loginUsernameField', 'loginUsernameError', result.error);
      } else {
        showFieldError('loginPasswordField', 'loginPasswordError', result.error);
      }
      return;
    }

    onLoginSuccess();
  });

  // Register form submit
  registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearAllErrors();

    const name = document.getElementById('regName').value;
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    let hasError = false;

    if (!name || name.trim().length < 2) {
      showFieldError('regNameField', 'regNameError', 'T\u00ean ph\u1ea3i c\u00f3 \u00edt nh\u1ea5t 2 k\u00fd t\u1ef1');
      hasError = true;
    }
    if (!username || username.trim().length < 3) {
      showFieldError('regUsernameField', 'regUsernameError', 'T\u00ean \u0111\u0103ng nh\u1eadp ph\u1ea3i c\u00f3 \u00edt nh\u1ea5t 3 k\u00fd t\u1ef1');
      hasError = true;
    } else if (/\s/.test(username) || /[^a-zA-Z0-9._-]/.test(username)) {
      showFieldError('regUsernameField', 'regUsernameError', 'Ch\u1ec9 d\u00f9ng ch\u1eef c\u00e1i, s\u1ed1, d\u1ea5u ch\u1ea5m, g\u1ea1ch d\u01b0\u1edbi');
      hasError = true;
    }
    // Password: 1 uppercase, 3 digits, 1 special char
    const pwdErrors = validatePassword(password);
    if (pwdErrors) {
      showFieldError('regPasswordField', 'regPasswordError', pwdErrors);
      hasError = true;
    }
    if (password !== confirm) {
      showFieldError('regConfirmField', 'regConfirmError', 'M\u1eadt kh\u1ea9u x\u00e1c nh\u1eadn kh\u00f4ng kh\u1edbp');
      hasError = true;
    }
    if (hasError) return;

    const result = Auth.register(name, username, password);
    if (!result.ok) {
      showFieldError('regUsernameField', 'regUsernameError', result.error);
      return;
    }

    showAuthToast('\u2705 \u0110\u0103ng k\u00fd th\u00e0nh c\u00f4ng! H\u00e3y \u0111\u0103ng nh\u1eadp.', 'success');
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
    document.getElementById('loginUsername').value = username;
    clearAllErrors();
  });

  // Logout button
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    Auth.logout();
    onLogout();
  });
}

function showFieldError(fieldId, errorId, message) {
  const field = document.getElementById(fieldId);
  const error = document.getElementById(errorId);
  if (field) {
    field.classList.add('shake');
    setTimeout(() => field.classList.remove('shake'), 500);
  }
  if (error) {
    error.textContent = message;
    error.classList.add('show');
  }
}

function clearAllErrors() {
  document.querySelectorAll('.auth-error').forEach(el => {
    el.textContent = '';
    el.classList.remove('show');
  });
  document.querySelectorAll('.auth-field').forEach(el => {
    el.classList.remove('shake');
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(pw) {
  if (!pw || pw.length < 6) return 'M\u1eadt kh\u1ea9u ph\u1ea3i c\u00f3 \u00edt nh\u1ea5t 6 k\u00fd t\u1ef1';
  if (!/[A-Z]/.test(pw)) return 'C\u1ea7n \u00edt nh\u1ea5t 1 ch\u1eef in hoa (A-Z)';
  if ((pw.match(/[0-9]/g) || []).length < 3) return 'C\u1ea7n \u00edt nh\u1ea5t 3 k\u00fd t\u1ef1 s\u1ed1 (0-9)';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw)) return 'C\u1ea7n \u00edt nh\u1ea5t 1 k\u00fd t\u1ef1 \u0111\u1eb7c bi\u1ec7t (!@#$...)';
  return null;
}

function showAuthToast(msg, type) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type || 'success'}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function onLoginSuccess() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.add('hidden');
  updateUserUI();
  updateAdminVisibility();
}

function onLogout() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.remove('hidden');
  // Reset forms
  document.getElementById('loginForm')?.reset();
  document.getElementById('registerForm')?.reset();
  // Show login form
  document.getElementById('loginForm')?.classList.add('active');
  document.getElementById('registerForm')?.classList.remove('active');
  clearAllErrors();
  // Hide user UI
  const sidebarUser = document.getElementById('sidebarUser');
  if (sidebarUser) sidebarUser.style.display = 'none';
  const greeting = document.getElementById('topbarGreeting');
  if (greeting) greeting.textContent = '';
  // Hide admin nav
  updateAdminVisibility();
}

function updateUserUI() {
  const user = Auth.getCurrentUser();
  if (!user) return;

  // Sidebar user profile
  const sidebarUser = document.getElementById('sidebarUser');
  const avatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const roleBadge = document.getElementById('userRoleBadge');

  if (sidebarUser) sidebarUser.style.display = 'flex';
  if (avatar) {
    avatar.textContent = user.name.charAt(0).toUpperCase();
    if (user.role === 'admin') {
      avatar.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)';
    } else {
      avatar.style.background = '';
    }
  }
  if (userName) userName.textContent = user.name;
  if (userEmail) userEmail.textContent = '@' + user.username;
  if (roleBadge) {
    roleBadge.textContent = user.role === 'admin' ? 'ADMIN' : 'USER';
    roleBadge.className = `sidebar-role-badge ${user.role === 'admin' ? 'admin' : 'user'}`;
  }

  // Topbar greeting
  const greeting = document.getElementById('topbarGreeting');
  if (greeting) {
    const hour = new Date().getHours();
    let greetText = 'Xin ch\u00e0o';
    if (hour < 12) greetText = 'Ch\u00e0o bu\u1ed5i s\u00e1ng';
    else if (hour < 18) greetText = 'Ch\u00e0o bu\u1ed5i chi\u1ec1u';
    else greetText = 'Ch\u00e0o bu\u1ed5i t\u1ed1i';
    const roleTag = user.role === 'admin' ? ' \u{1F451}' : ' \u{1F44B}';
    greeting.textContent = `${greetText}, ${user.name}${roleTag}`;
  }
}

// ============================================================
//  ADMIN: Show/hide admin nav + render admin page
// ============================================================
function updateAdminVisibility() {
  const adminNav = document.getElementById('navAdmin');
  const isAdmin = Auth.isAdmin();
  if (adminNav) {
    adminNav.style.display = isAdmin ? 'flex' : 'none';
  }
}

function renderAdminPage() {
  const tbody = document.getElementById('adminUserTableBody');
  const countEl = document.getElementById('adminUserCount');
  if (!tbody) return;

  const users = Auth.getAllUsers();
  if (countEl) countEl.textContent = `${users.length} t\u00e0i kho\u1ea3n`;

  tbody.innerHTML = users.map((u, i) => {
    const roleClass = u.role === 'admin' ? 'role-admin' : 'role-user';
    const roleText = u.role === 'admin' ? 'Admin' : 'User';
    const date = u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '--';
    const canKick = u.role !== 'admin';

    return `<tr class="${u.role === 'admin' ? 'admin-row' : ''}">
      <td>${i + 1}</td>
      <td>
        <div class="admin-user-cell">
          <div class="admin-user-avatar ${u.role === 'admin' ? 'avatar-admin' : ''}">${u.name.charAt(0).toUpperCase()}</div>
          <div class="admin-user-detail">
            <span class="admin-user-name">${u.name}</span>
            <span class="admin-user-email-cell">@${u.username}</span>
          </div>
        </div>
      </td>
      <td><span class="admin-role-tag ${roleClass}">${roleText}</span></td>
      <td>${date}</td>
      <td>
        ${canKick
        ? `<button class="admin-kick-btn" onclick="handleKickUser('${u.id}', '${u.name.replace(/'/g, "\\'")}')">\n              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>\n              <span>X\u00f3a</span>\n            </button>`
        : `<span class="admin-protected">\u{1F512} B\u1EA3o v\u1EC7</span>`
      }
      </td>
    </tr>`;
  }).join('');
}

function handleKickUser(userId, userName) {
  if (!confirm(`B\u1EA1n c\u00f3 ch\u1EAFc mu\u1ED1n x\u00f3a t\u00e0i kho\u1EA3n "${userName}"?`)) return;
  const result = Auth.kickUser(userId);
  if (result.ok) {
    showAuthToast(`\u274C \u0110\u00e3 x\u00f3a t\u00e0i kho\u1EA3n: ${result.name}`, 'warning');
    renderAdminPage();
  } else {
    showAuthToast(`\u26A0\uFE0F ${result.error}`, 'danger');
  }
}

// ============================================================
//  PARTICLE ANIMATION (replaces bubble canvas)
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

  // Draw lines between close particles
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
  waterLiters: 0,
  prevLevel: 0,
  pump: false,
  lastUpdate: null,
  chartData: [],
  chartLabels: [],
  pollInterval: null,
  selectedDate: null,
};

const MAX_POINTS = 30;

// ============================================================
//  LOCAL HISTORY (Lưu nội bộ vào trình duyệt)
// ============================================================
const LocalHistory = {
  KEY: 'aquamonitor_history_log',
  MAX_RECORDS: 240,
  get() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch { return []; }
  },
  add(entry) {
    const logs = this.get();
    logs.push(entry);
    if (logs.length > this.MAX_RECORDS) logs.shift();
    localStorage.setItem(this.KEY, JSON.stringify(logs));
    return logs;
  },
  setAll(logs) {
    localStorage.setItem(this.KEY, JSON.stringify(logs));
  }
};

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

function updateUI({ level, pump, timestamp }) {
  // level = mực nước tính bằng lít từ ESP8266
  const liters = level;
  const percent = Math.min(100, Math.max(0, (liters / DISPLAY_CONFIG.TANK_CAPACITY_LITERS) * 100));

  state.prevLevel = state.waterLevel;
  state.waterLevel = percent;
  state.waterLiters = liters;
  state.pump = pump;
  state.lastUpdate = timestamp || new Date();

  const status = getLevelColor(percent);

  // === Tank water fill ===
  const tankWater = document.getElementById('tankWater');
  if (tankWater) {
    tankWater.style.height = `${percent}%`;
    if (status === 'danger') {
      tankWater.style.background = 'linear-gradient(180deg, #f87171, rgba(248,113,113,0.4))';
    } else if (status === 'warning') {
      tankWater.style.background = 'linear-gradient(180deg, #fbbf24, rgba(251,191,36,0.4))';
    } else {
      tankWater.style.background = 'linear-gradient(180deg, #2dd4bf, rgba(45,212,191,0.4))';
    }
  }

  // === Gauge text (Liters) ===
  const gp = document.getElementById('gaugePercent');
  if (gp) {
    gp.textContent = `${parseFloat(liters.toFixed(2))} L`;
  }

  // === Logo water ===
  const logoWater = document.getElementById('logoWater');
  if (logoWater) logoWater.style.height = `${Math.max(10, percent * 0.7)}%`;

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
    bar.style.width = `${percent}%`;
    if (status === 'danger') {
      bar.style.background = 'linear-gradient(90deg, #991b1b, #f87171)';
    } else if (status === 'warning') {
      bar.style.background = 'linear-gradient(90deg, #92400e, #fbbf24)';
    } else {
      bar.style.background = 'linear-gradient(90deg, #2dd4bf, #67e8f9)';
    }
  }

  // === KPI values ===
  setText('valLevel', `${percent.toFixed(1)}%`);
  setText('valVolume', `${parseFloat(liters.toFixed(2))} L`);
  setText('valTime', formatTime(state.lastUpdate));

  // === Trend arrow ===
  const trend = document.getElementById('levelTrend');
  if (trend) {
    if (percent > state.prevLevel + 0.5) {
      trend.className = 'kpi-trend up';
    } else if (percent < state.prevLevel - 0.5) {
      trend.className = 'kpi-trend down';
    }
  }

  // === Status text ===
  let alertMsg = 'Bình thường';
  if (percent >= DISPLAY_CONFIG.LEVEL_CRITICAL_HIGH) alertMsg = 'Nguy cơ tràn!';
  else if (percent >= DISPLAY_CONFIG.LEVEL_WARNING_HIGH) alertMsg = 'Mực nước cao';
  else if (percent <= DISPLAY_CONFIG.LEVEL_CRITICAL_LOW) alertMsg = 'Nguy cơ cạn!';
  else if (percent <= DISPLAY_CONFIG.LEVEL_WARNING_LOW) alertMsg = 'Mực nước thấp';

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
  if (pipeIn) pipeIn.className = `pipe pipe-in${pump ? ' active' : ''}`;
  if (pipeOut) pipeOut.className = `pipe pipe-out${pump ? ' active' : ''}`;

  // === Pump ===
  updatePump('pumpInBadge', 'pumpDot', pump, 'pumpInItem');

  // === Chart ===
  if (waterChart) {
    const label = formatTime(state.lastUpdate, true);
    if (state.chartLabels.length >= MAX_POINTS) {
      state.chartLabels.shift();
      state.chartData.shift();
    }
    state.chartLabels.push(label);
    state.chartData.push(parseFloat(percent.toFixed(2)));
    waterChart.data.labels = state.chartLabels;
    waterChart.data.datasets[0].data = state.chartData;
    waterChart.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
    waterChart.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
    waterChart.update('none');
  }

  // === Large Chart (Charts page) ===
  updateLargeChart();

  // === Stats (Charts page) ===
  updateStats(percent);

  // === Alert log (Alerts page) ===
  addAlertToLog(percent);

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

  // Pump card active animation
  if (itemId) {
    const item = document.getElementById(itemId);
    if (item) {
      if (isOn) item.classList.add('pump-active');
      else item.classList.remove('pump-active');
    }
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
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4000);
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
    if (text) text.textContent = 'MQTT';
  } else if (mode === 'demo') {
    el.className = 'status-badge demo';
    if (text) text.textContent = 'DEMO';
  } else {
    el.className = 'status-badge offline';
    if (text) text.textContent = 'OFFLINE';
  }
}

// ============================================================
//  MQTT CONNECTION
// ============================================================
let mqttClient = null;
let mqttConnected = false;

function connectMQTT() {
  if (typeof mqtt === 'undefined') {
    console.warn('mqtt.js chưa load');
    return;
  }

  const cfg = MQTT_CONFIG;
  const url = `${cfg.PROTOCOL}://${cfg.HOST}:${cfg.PORT}/mqtt`;

  mqttClient = mqtt.connect(url, {
    clientId: cfg.CLIENT_ID,
    keepalive: 60,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
  });

  mqttClient.on('connect', () => {
    mqttConnected = true;
    setStatus('live');
    console.log(`✅ MQTT kết nối thành công: ${url}`);
    mqttClient.subscribe(cfg.TOPIC_SENSOR, { qos: 0 });
    mqttClient.subscribe(cfg.TOPIC_PUMP_STATUS, { qos: 0 });
  });

  mqttClient.on('message', (topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString());
      if (topic === cfg.TOPIC_SENSOR) {
        // ESP gửi: { "water": <lít>, "pump": "ON"/"OFF" }
        const data = {
          level: parseFloat(msg.water) || 0,
          pump: (msg.pump === "ON"),
          timestamp: new Date(),
        };
        updateUI(data);
        showToastIfNew(data.level);
      }
    } catch (e) {
      console.warn('MQTT parse lỗi:', e);
    }
  });

  mqttClient.on('offline', () => {
    mqttConnected = false;
    setStatus('offline');
    console.warn('MQTT offline, đang thử kết nối lại...');
  });

  mqttClient.on('error', (err) => {
    mqttConnected = false;
    console.error('MQTT lỗi:', err.message);
    setStatus('offline');
  });
}

// Giữ hàm poll() để tương thích với nút Refresh
async function poll() {
  // Demo mode đã bị xoá
}

// ============================================================
//  SOCKET.IO — nhận dữ liệu thực từ app.js (Node server)
// ============================================================
function connectSocketIO() {
  // Chỉ chạy khi thư viện socket.io.js đã được load
  if (typeof io === 'undefined') {
    console.warn('Socket.io chưa load — bỏ qua kết nối server.');
    return;
  }

  const socket = io(); // Tự kết nối về http://localhost:3000
  window._socket = socket;

  socket.on('connect', () => {
    console.log('✅ Socket.io đã kết nối với app.js!');
    if (mqttClient) {
      try { mqttClient.end(true); } catch (_) { }
      mqttClient = null;
    }
    setStatus('live');
  });

  // Nhận dữ liệu từ app.js: { level (lít), pump (bool), timestamp }
  socket.on('sensor_data', (data) => {
    updateUI(data);           // 💧 mực nước (lít) → hiển thị trên web
    showToastIfNew(data.level);
  });

  // Nhận lịch sử khi vừa kết nối
  socket.on('history', (historyData) => {
    if (!historyData || historyData.length === 0) return;
    console.log(`📜 Đã nhận ${historyData.length} bản ghi lịch sử`);

    // Xóa dữ liệu demo cũ
    state.chartLabels.length = 0;
    state.chartData.length = 0;
    statsTracker.max = 0;
    statsTracker.min = 100;
    statsTracker.sum = 0;
    statsTracker.count = 0;

    // Nạp từng bản ghi lịch sử vào biểu đồ (giới hạn MAX_POINTS gần nhất)
    const recent = historyData.slice(-MAX_POINTS);
    recent.forEach(entry => {
      const ts = entry.timestamp ? new Date(entry.timestamp) : new Date();
      state.chartLabels.push(formatTime(ts, true));
      state.chartData.push(parseFloat(Number(entry.level).toFixed(2)));

      // Cập nhật thống kê
      statsTracker.max = Math.max(statsTracker.max, entry.level);
      statsTracker.min = Math.min(statsTracker.min, entry.level);
      statsTracker.sum += entry.level;
      statsTracker.count++;
    });

    // Cập nhật biểu đồ nhỏ (Tổng quan)
    if (waterChart) {
      waterChart.data.labels = state.chartLabels;
      waterChart.data.datasets[0].data = state.chartData;
      waterChart.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
      waterChart.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
      waterChart.update();
    }

    // Cập nhật biểu đồ lớn (trang Biểu đồ)
    updateLargeChart();

    // Cập nhật thống kê
    if (statsTracker.count > 0) {
      const last = historyData[historyData.length - 1];
      const cap = DISPLAY_CONFIG.TANK_CAPACITY_LITERS;
      setText('statCurrent', `${(Number(last.level) / cap * 100).toFixed(1)}%`);
      setText('statMax', `${(statsTracker.max / cap * 100).toFixed(1)}%`);
      setText('statMin', `${(statsTracker.min / cap * 100).toFixed(1)}%`);
      setText('statAvg', `${(statsTracker.sum / statsTracker.count / cap * 100).toFixed(1)}%`);
    }

    // Cập nhật UI với dữ liệu cuối cùng
    const lastEntry = historyData[historyData.length - 1];
    if (lastEntry) {
      updateUI({
        level: lastEntry.level,
        pump: !!lastEntry.pump,
        timestamp: lastEntry.timestamp
      });
    }
  });

  // Nhận bảng lịch sử 1 giờ/lần khi vừa kết nối
  socket.on('history_log', (logData) => {
    if (!logData || logData.length === 0) return;
    console.log(`📋 Đã nhận ${logData.length} bản ghi lịch sử`);
    window._historyLog = logData;
    LocalHistory.setAll(logData); // Cache lại offline
    renderDayTabs();
  });

  // Nhận thêm bản ghi lịch sử mới mỗi giờ
  socket.on('history_log_entry', (entry) => {
    if (!window._historyLog) window._historyLog = [];
    window._historyLog.push(entry);
    LocalHistory.add(entry); // Cache thêm offline
    renderDayTabs();
  });

  // Nhận phản hồi khi nút vật lý trên ESP (D4) được bấm
  socket.on('pump_feedback', (data) => {
    console.log(`🔔 Nút vật lý bấm → Bơm: ${data.state ? 'BẬT' : 'TẮT'}`);
    state.pump = data.state;
    // Cập nhật UI bơm ngay lập tức
    updatePump('pumpInBadge', 'pumpDot', data.state, 'pumpInItem');
    // Hiển thị toast thông báo
    const container = document.getElementById('toastContainer');
    if (container) {
      const t = document.createElement('div');
      t.className = 'toast ' + (data.state ? 'success' : 'warning');
      t.textContent = `🔘 Nút vật lý: Bơm ${data.state ? 'BẬT' : 'TẮT'}`;
      container.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }
  });

  // Nhận lỗi khi gửi lệnh bơm thất bại (MQTT broker mất kết nối)
  socket.on('pump_cmd_error', (data) => {
    const container = document.getElementById('toastContainer');
    if (container) {
      const t = document.createElement('div');
      t.className = 'toast danger';
      t.textContent = `⚠️ Lỗi gửi lệnh: ${data.msg}`;
      container.appendChild(t);
      setTimeout(() => t.remove(), 4000);
    }
  });

  socket.on('disconnect', () => {
    console.warn('⚠️ Mất kết nối Socket.io');
    setStatus('offline');
  });

  socket.on('connect_error', (err) => {
    console.warn('Socket.io lỗi kết nối:', err.message);
    setStatus('offline');
  });
}

// ============================================================
//  NAVIGATION
// ============================================================
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pageViews = document.querySelectorAll('.page-view');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.getAttribute('data-page');

      // Update active nav
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Show/hide pages
      pageViews.forEach(p => p.classList.remove('active'));
      const targetPage = document.getElementById(`page-${target}`);
      if (targetPage) targetPage.classList.add('active');

      // Update page title
      const titles = { overview: 'Hệ Thống Giám Sát', charts: 'Biểu Đồ Chi Tiết', alerts: 'Nhật Ký Cảnh Báo', settings: 'Cài Đặt', admin: 'Quản Lý Tài Khoản' };
      const titleEl = document.querySelector('.page-title');
      if (titleEl) titleEl.textContent = titles[target] || 'AquaMonitor';

      // Init large chart when opening charts page
      if (target === 'charts' && !waterChartLarge) initLargeChart();

      // Update settings info
      if (target === 'settings') updateSettingsInfo();

      // Render admin page
      if (target === 'admin') renderAdminPage();
    });
  });
}

// ============================================================
//  LARGE CHART (Charts page)
// ============================================================
let waterChartLarge = null;

function initLargeChart() {
  const canvas = document.getElementById('waterChartLarge');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  waterChartLarge = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [...state.chartLabels],
      datasets: [
        {
          label: 'Mực nước (%)',
          data: [...state.chartData],
          borderColor: '#2dd4bf',
          backgroundColor: (scriptCtx) => {
            const { ctx: c, chartArea } = scriptCtx.chart;
            if (!chartArea) return 'rgba(45,212,191,0.1)';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(45,212,191,0.3)');
            g.addColorStop(1, 'rgba(45,212,191,0.01)');
            return g;
          },
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: '#2dd4bf',
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Ngưỡng tràn (90%)',
          data: Array(state.chartLabels.length).fill(90),
          borderColor: 'rgba(248,113,113,0.5)',
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Ngưỡng cạn (10%)',
          data: Array(state.chartLabels.length).fill(10),
          borderColor: 'rgba(251,191,36,0.5)',
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
          ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: "'JetBrains Mono', monospace" }, maxTicksLimit: 12, maxRotation: 0 },
          border: { display: false },
        },
        y: {
          min: 0, max: 100,
          grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false },
          ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: "'JetBrains Mono', monospace" }, callback: v => `${v}%`, stepSize: 10 },
          border: { display: false },
        },
      },
    },
  });
}

function updateLargeChart() {
  if (!waterChartLarge) return;
  waterChartLarge.data.labels = [...state.chartLabels];
  waterChartLarge.data.datasets[0].data = [...state.chartData];
  waterChartLarge.data.datasets[1].data = Array(state.chartLabels.length).fill(90);
  waterChartLarge.data.datasets[2].data = Array(state.chartLabels.length).fill(10);
  waterChartLarge.update('none');
}

// ============================================================
//  STATS TRACKING (Charts page)
// ============================================================
const statsTracker = { max: 0, min: 100, sum: 0, count: 0 };

function updateStats(level) {
  statsTracker.max = Math.max(statsTracker.max, level);
  statsTracker.min = Math.min(statsTracker.min, level);
  statsTracker.sum += level;
  statsTracker.count++;

  setText('statCurrent', `${level.toFixed(1)}%`);
  setText('statMax', `${statsTracker.max.toFixed(1)}%`);
  setText('statMin', `${statsTracker.min.toFixed(1)}%`);
  setText('statAvg', `${(statsTracker.sum / statsTracker.count).toFixed(1)}%`);
}

// ============================================================
//  ALERT LOG (Alerts page)
// ============================================================
const alertHistory = [];
const MAX_ALERTS = 50;

function addAlertToLog(level) {
  const key = level >= DISPLAY_CONFIG.LEVEL_CRITICAL_HIGH ? 'overflow'
    : level <= DISPLAY_CONFIG.LEVEL_CRITICAL_LOW ? 'underflow'
      : level >= DISPLAY_CONFIG.LEVEL_WARNING_HIGH ? 'high'
        : level <= DISPLAY_CONFIG.LEVEL_WARNING_LOW ? 'low' : 'ok';

  if (key === 'ok') return;

  const icons = { overflow: '🚨', underflow: '🚨', high: '⚠️', low: '⚠️' };
  const types = { overflow: 'danger', underflow: 'danger', high: 'warning', low: 'warning' };
  const msgs = {
    overflow: `Mực nước ${level.toFixed(1)}% — Nguy cơ tràn bồn!`,
    underflow: `Mực nước ${level.toFixed(1)}% — Nguy cơ cạn bồn!`,
    high: `Mực nước ${level.toFixed(1)}% — Đang tăng cao`,
    low: `Mực nước ${level.toFixed(1)}% — Đang giảm thấp`
  };

  const entry = {
    icon: icons[key], type: types[key], msg: msgs[key],
    time: new Date().toLocaleString('vi-VN')
  };

  alertHistory.unshift(entry);
  if (alertHistory.length > MAX_ALERTS) alertHistory.pop();
  renderAlertLog();
}

function renderAlertLog() {
  const log = document.getElementById('alertLog');
  if (!log) return;

  if (alertHistory.length === 0) {
    log.innerHTML = `<div class="alert-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      <p>Chưa có cảnh báo nào</p>
      <span>Hệ thống đang hoạt động bình thường</span>
    </div>`;
    return;
  }

  log.innerHTML = alertHistory.map(a => `
    <div class="alert-log-item ${a.type}">
      <span class="alert-log-icon">${a.icon}</span>
      <div class="alert-log-content">
        <div class="alert-log-msg">${a.msg}</div>
        <div class="alert-log-time">${a.time}</div>
      </div>
    </div>
  `).join('');
}

// ============================================================
//  SETTINGS INFO
// ============================================================
function updateSettingsInfo() {
  const cap = document.getElementById('settingsTankCap');
  if (cap) cap.textContent = `${DISPLAY_CONFIG.TANK_CAPACITY_LITERS?.toLocaleString() || '--'} L`;

  const conn = document.getElementById('settingsConnStatus');
  if (conn) {
    if (mqttConnected || (window._socket && window._socket.connected)) {
      conn.textContent = 'ĐÃ KẾT NỐI';
      conn.className = 'panel-badge';
    } else {
      conn.textContent = 'MẤT KẾT NỐI';
      conn.className = 'panel-badge danger';
    }
  }
}

// ============================================================
//  DAY TABS & HISTORY TABLE
// ============================================================
function renderDayTabs() {
  const container = document.getElementById('dayTabsContainer');
  const tabsDiv = document.getElementById('dayTabs');
  if (!container || !tabsDiv) return;

  const data = window._historyLog || [];
  if (data.length === 0) {
    container.style.display = 'none';
    renderHistoryTable();
    return;
  }

  const daysMap = new Map();
  data.forEach(entry => {
    const d = new Date(entry.timestamp);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const displayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!daysMap.has(dateStr)) daysMap.set(dateStr, displayStr);
  });

  const uniqueDates = Array.from(daysMap.keys()).sort();
  if (uniqueDates.length === 0) {
    container.style.display = 'none'; return;
  }

  container.style.display = 'block';

  if (!state.selectedDate || !uniqueDates.includes(state.selectedDate)) {
    state.selectedDate = uniqueDates[uniqueDates.length - 1];
  }

  tabsDiv.innerHTML = uniqueDates.map(dateStr => {
    const displayStr = daysMap.get(dateStr);
    const isActive = dateStr === state.selectedDate ? 'active' : '';
    return `<button class="day-tab ${isActive}" data-date="${dateStr}">${displayStr}</button>`;
  }).join('');

  tabsDiv.querySelectorAll('.day-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedDate = btn.getAttribute('data-date');
      renderDayTabs();
    });
  });

  renderHistoryTable();
}

function renderHistoryTable() {
  const tbody = document.getElementById('historyTableBody');
  const logCount = document.getElementById('logCount');

  let rawData = window._historyLog || [];
  let data = [];

  if (state.selectedDate && rawData.length > 0) {
    data = rawData.filter(entry => {
      const d = new Date(entry.timestamp);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateStr === state.selectedDate;
    });
  } else {
    data = rawData;
  }

  if (logCount) logCount.textContent = `${data.length} bản ghi hôm nay`;

  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = '<tr class="history-empty-row"><td colspan="6"><div class="alert-empty" style="padding:40px 20px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><p>Chưa có dữ liệu lịch sử cho ngày này</p><span>Bản ghi đầu tiên sẽ xuất hiện ở đây</span></div></td></tr>';
    return;
  }

  const reversed = [...data].reverse();
  tbody.innerHTML = reversed.map((entry, i) => {
    const ts = new Date(entry.timestamp);
    const timeStr = `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`;
    const level = Number(entry.level).toFixed(2);
    const cap = DISPLAY_CONFIG.TANK_CAPACITY_LITERS;
    const pct = Math.min(100, Math.max(0, (entry.level / cap) * 100));
    const pumpCls = entry.pump ? 'pump-on' : 'pump-off';

    let stCls = 'status-ok';
    let stTxt = 'Bình thường';
    if (pct >= 90 || pct <= 10) {
      stCls = 'status-danger';
      stTxt = pct >= 90 ? 'Nguy hiểm ↑' : 'Nguy hiểm ↓';
    } else if (pct >= 75 || pct <= 20) {
      stCls = 'status-warn';
      stTxt = pct >= 75 ? 'Cảnh báo ↑' : 'Cảnh báo ↓';
    }

    return `<tr>
      <td>${data.length - i}</td>
      <td>${timeStr}</td>
      <td>${level} L</td>
      <td class="${pumpCls}">${entry.pump ? 'BẬT' : 'TẮT'}</td>
      <td class="${stCls}">${stTxt}</td>
    </tr>`;
  }).join('');
}

// ============================================================
//  INIT
// ============================================================
function init() {
  // Seed default admin account
  Auth.seedAdmin();

  // Nạp dữ liệu lịch sử từ bộ nhớ trình duyệt
  let savedLogs = LocalHistory.get();
  window._historyLog = savedLogs;
  renderDayTabs();

  // Cứ mỗi 1 giờ ghi lại một bản ghi nếu chạy OFFLINE/DEMO mode
  setInterval(() => {
    if (!window._socket || !window._socket.connected) {
      if (state.lastUpdate) {
        const entry = {
          level: state.waterLiters,
          pump: state.pump,
          timestamp: new Date().toISOString()
        };
        window._historyLog = LocalHistory.add(entry);
        renderDayTabs();
      }
    }
  }, 3600 * 1000);

  // Auth check — block dashboard if not logged in
  initAuth();
  if (Auth.isLoggedIn()) {
    onLoginSuccess();
  }

  const tankMarkers = document.querySelector('.tank-markers');
  if (tankMarkers && typeof DISPLAY_CONFIG !== 'undefined' && DISPLAY_CONFIG.TANK_CAPACITY_LITERS) {
    const cap = DISPLAY_CONFIG.TANK_CAPACITY_LITERS;
    tankMarkers.innerHTML = `
      <span>${cap} L</span>
      <span>${parseFloat((cap * 0.75).toFixed(1))} L</span>
      <span>${parseFloat((cap * 0.5).toFixed(1))} L</span>
      <span>${parseFloat((cap * 0.25).toFixed(1))} L</span>
      <span>0 L</span>
    `;
  }

  initParticles();
  initChart();
  initNavigation();
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Refresh button
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    poll().then(() => setTimeout(() => btn.classList.remove('spinning'), 600));
  });

  // Alert button (topbar bell) - navigate to alerts page
  const alertBtn = document.getElementById('alertBtn');
  if (alertBtn) alertBtn.addEventListener('click', () => {
    const alertNav = document.querySelector('.nav-item[data-page="alerts"]');
    if (alertNav) alertNav.click();
  });

  // Theme Toggle (Settings page checkbox)
  const themeCheckbox = document.getElementById('themeCheckbox');
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (themeCheckbox) themeCheckbox.checked = true;
  }

  if (themeCheckbox) {
    themeCheckbox.addEventListener('change', () => {
      const next = themeCheckbox.checked ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }

  // Particle Toggle (Settings page)
  const particleCheckbox = document.getElementById('particleCheckbox');
  const savedParticle = localStorage.getItem('particles');
  if (savedParticle === 'off') {
    const pc = document.getElementById('particleCanvas');
    if (pc) pc.style.display = 'none';
    if (particleCheckbox) particleCheckbox.checked = false;
  }

  if (particleCheckbox) {
    particleCheckbox.addEventListener('change', () => {
      const pc = document.getElementById('particleCanvas');
      if (pc) pc.style.display = particleCheckbox.checked ? '' : 'none';
      localStorage.setItem('particles', particleCheckbox.checked ? 'on' : 'off');
    });
  }

  // Clear Alerts button
  const clearAlertsBtn = document.getElementById('clearAlertsBtn');
  if (clearAlertsBtn) clearAlertsBtn.addEventListener('click', () => {
    alertHistory.length = 0;
    renderAlertLog();
  });

  // Pump Control (click) — ESP chỉ có 1 bơm
  const pumpInItem = document.getElementById('pumpInItem');

  if (pumpInItem) {
    pumpInItem.addEventListener('click', () => {
      const newState = !state.pump;
      if (window._socket) {
        window._socket.emit('toggle_pump', { state: newState });
        state.pump = newState;
        updatePump('pumpInBadge', 'pumpDot', newState, 'pumpInItem');
      }
    });
  }

  connectSocketIO();
  connectMQTT();
}

document.addEventListener('DOMContentLoaded', init);
