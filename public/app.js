let ws = null;
let currentTab = 'tab-overview';
let cachedLeaderboard = [];
let cachedQuizHistory = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initWebSocket();
  fetchDashboardData();
  fetchLeaderboardData();
  fetchSubjects();
  fetchUsers();
  fetchMaterials();
});

// TAB MANAGEMENT
function initTabs() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(tabId);

  if (activeBtn && activeContent) {
    activeBtn.classList.add('active');
    activeContent.classList.add('active');
    currentTab = tabId;

    // Update Header Titles
    const titleMap = {
      'tab-overview': { title: 'Dashboard & WhatsApp Scan', sub: 'Pantau status koneksi WhatsApp dan statistik sistem' },
      'tab-leaderboard': { title: 'Papan Peringkat & Rekap Nilai Siswa', sub: 'Pantau perolehan XP, level siswa, dan ekspor rekapitulasi nilai kuis' },
      'tab-subjects': { title: 'Kelola Mata Pelajaran', sub: 'Tambah atau hapus daftar pelajaran yang tersedia untuk siswa' },
      'tab-users': { title: 'Nomor Guru & Siswa', sub: 'Daftar pengguna terintegrasi yang memiliki akses khusus' },
      'tab-materials': { title: 'Upload Buku Guru / Modul PDF', sub: 'Unggah file PDF/Teks rujukan kurikulum pembelajaran' },
      'tab-simulator': { title: 'Live Chat Simulator', sub: 'Uji coba percakapan AI Tutor secara real-time dari web browser' },
    };
    if (titleMap[tabId]) {
      document.getElementById('pageTitle').innerText = titleMap[tabId].title;
      document.getElementById('pageSubtitle').innerText = titleMap[tabId].sub;
    }

    if (tabId === 'tab-leaderboard') {
      fetchLeaderboardData();
    }
  }
}

// WEBSOCKET REAL-TIME CONNECTION
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    appendLog('[SYSTEM] WebSocket terhubung ke server');
  };

  ws.onmessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.data);
      if (type === 'status') {
        updateWaStatusUI(payload.status, payload.qrDataUrl, payload.connectedPhone);
      } else if (type === 'qr') {
        updateWaStatusUI('SCAN_QR', payload.qrDataUrl);
      } else if (type === 'log') {
        appendLog(`[${payload.timestamp}] ${payload.message}`);
      } else if (type === 'update') {
        fetchDashboardData();
        fetchSubjects();
        fetchUsers();
        fetchMaterials();
      } else if (type === 'leaderboard_update') {
        fetchDashboardData();
        fetchLeaderboardData();
        appendLog('🏆 [LEADERBOARD] Nilai kuis baru masuk! Papan peringkat diperbarui.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onclose = () => {
    appendLog('[SYSTEM] WebSocket terputus. Mencoba reconnect...');
    setTimeout(initWebSocket, 3000);
  };
}

// UPDATE WA STATUS UI & QR CODE
function updateWaStatusUI(status, qrDataUrl, connectedPhone) {
  const sidebarBadge = document.getElementById('sidebarWaStatus');
  const mainBadge = document.getElementById('waStatusBadge');
  const qrContainer = document.getElementById('qrContainer');
  const qrInstructions = document.getElementById('qrInstructions');
  const waActions = document.getElementById('waConnectedActions');

  sidebarBadge.className = `wa-status-badge ${status.toLowerCase()}`;
  const statusLabels = {
    CONNECTED: 'WhatsApp Terhubung',
    SCAN_QR: 'Silakan Scan QR',
    DISCONNECTED: 'Terputus',
  };
  sidebarBadge.querySelector('.status-label').innerText = statusLabels[status] || status;

  mainBadge.className = `badge ${status}`;
  mainBadge.innerText = status;

  if (status === 'CONNECTED') {
    const phoneDisplay = connectedPhone ? `<p style="font-size: 14px; font-weight: 700; color: white; margin-top: 4px;">📱 Nomor Terhubung: +${connectedPhone}</p>` : '';
    qrContainer.innerHTML = `
      <div style="text-align: center; color: var(--emerald);">
        <i class="fa-solid fa-circle-check" style="font-size: 64px; margin-bottom: 12px;"></i>
        <h4 style="margin-bottom: 6px;">WhatsApp Aktif & Terhubung!</h4>
        ${phoneDisplay}
        <p style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">Bot AI Tutor siap membalas pesan teks & foto dari siswa secara otomatis.</p>
      </div>
    `;
    if (qrInstructions) qrInstructions.style.display = 'none';
    if (waActions) waActions.style.display = 'block';
  } else if (status === 'SCAN_QR' && qrDataUrl) {
    qrContainer.innerHTML = `<img src="${qrDataUrl}" alt="WhatsApp QR Code" />`;
    if (qrInstructions) qrInstructions.style.display = 'block';
    if (waActions) waActions.style.display = 'none';
  } else {
    qrContainer.innerHTML = `
      <div class="qr-placeholder">
        <i class="fa-solid fa-qrcode"></i>
        <p>Menunggu server atau QR Code...</p>
      </div>
    `;
    if (qrInstructions) qrInstructions.style.display = 'none';
    if (waActions) waActions.style.display = 'none';
  }
}

// LOGOUT / PUTUSKAN SAMBUNGAN WHATSAPP
async function logoutWhatsApp() {
  if (!confirm('Apakah Anda yakin ingin memutuskan (logout) WhatsApp dan mengganti nomor? Sesi lama akan dihapus dan QR Code baru akan dibuat.')) {
    return;
  }

  const btn = document.getElementById('btnLogoutWa');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memutuskan Sesi WhatsApp...';
  }

  try {
    const res = await fetch('/api/wa/logout', { method: 'POST' });
    const data = await res.json();
    appendLog('🚪 [LOGOUT] Sesi WhatsApp diputuskan. Membuat QR Code baru...');
  } catch (err) {
    console.error('Error logging out WhatsApp:', err);
    alert('Gagal logout WhatsApp.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-arrow-right-from-bracket"></i> Putuskan / Ganti Nomor WhatsApp';
    }
  }
}

// LOGS MANAGEMENT
function appendLog(msg) {
  const logStream = document.getElementById('logStream');
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerText = msg;
  logStream.appendChild(div);
  logStream.scrollTop = logStream.scrollHeight;
}

function clearLogs() {
  document.getElementById('logStream').innerHTML = '<div class="log-entry system">[SYSTEM] Log dibersihkan.</div>';
}

// REST API CALLS

// 1. Fetch Dashboard Stats
async function fetchDashboardData() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    document.getElementById('statSubjects').innerText = data.stats.totalSubjects;
    document.getElementById('statUsers').innerText = data.stats.totalUsers;
    document.getElementById('statMaterials').innerText = data.stats.totalMaterials;
    if (document.getElementById('statChunks')) {
      document.getElementById('statChunks').innerText = `(${data.stats.totalChunks || 0} Chunks RAG)`;
    }
    if (document.getElementById('statQuizzes')) {
      document.getElementById('statQuizzes').innerText = data.stats.totalQuizzesTaken || 0;
    }
    updateWaStatusUI(data.status, data.qrDataUrl, data.connectedPhone);
  } catch (err) {
    console.error(err);
  }
}

// 2. LEADERBOARD & GAMIFICATION FUNCTIONS
async function fetchLeaderboardData() {
  try {
    const [resLeaderboard, resHistory] = await Promise.all([
      fetch('/api/leaderboard'),
      fetch('/api/quiz-results'),
    ]);

    cachedLeaderboard = await resLeaderboard.json();
    cachedQuizHistory = await resHistory.json();

    renderPodium(cachedLeaderboard);
    renderLeaderboardTable(cachedLeaderboard);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
  }
}

function renderPodium(list) {
  const container = document.getElementById('podiumContainer');
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="podium-loading">
        <i class="fa-solid fa-trophy" style="font-size: 24px; color: #fbbf24;"></i>
        <span>Belum ada siswa yang menyelesaikan kuis. Mulai kuis di WhatsApp untuk melihat Juara 1, 2, dan 3!</span>
      </div>
    `;
    return;
  }

  const p1 = list[0] || null;
  const p2 = list[1] || null;
  const p3 = list[2] || null;

  let html = '';

  // Juara 2 (Silver)
  if (p2) {
    html += `
      <div class="podium-step rank-2">
        <div class="podium-avatar">${p2.userName.charAt(0).toUpperCase()}</div>
        <div class="podium-name" title="${p2.userName}">${p2.userName}</div>
        <div class="podium-class">${p2.className || 'Siswa'}</div>
        <div class="podium-xp-tag">⚡ ${p2.totalXp} XP</div>
        <div style="font-size: 11px; color: var(--text-muted);">Skor Rata-rata: <b>${p2.averageScore}</b></div>
        <div class="podium-badge-rank">🥈 #2</div>
      </div>
    `;
  }

  // Juara 1 (Gold)
  if (p1) {
    html += `
      <div class="podium-step rank-1">
        <div class="podium-crown">👑</div>
        <div class="podium-avatar">${p1.userName.charAt(0).toUpperCase()}</div>
        <div class="podium-name" title="${p1.userName}">${p1.userName}</div>
        <div class="podium-class">${p1.className || 'Siswa'}</div>
        <div class="podium-xp-tag">⚡ ${p1.totalXp} XP</div>
        <div style="font-size: 11px; color: #fde68a;">Skor Rata-rata: <b>${p1.averageScore}</b></div>
        <div class="podium-badge-rank">🥇 #1</div>
      </div>
    `;
  }

  // Juara 3 (Bronze)
  if (p3) {
    html += `
      <div class="podium-step rank-3">
        <div class="podium-avatar">${p3.userName.charAt(0).toUpperCase()}</div>
        <div class="podium-name" title="${p3.userName}">${p3.userName}</div>
        <div class="podium-class">${p3.className || 'Siswa'}</div>
        <div class="podium-xp-tag">⚡ ${p3.totalXp} XP</div>
        <div style="font-size: 11px; color: var(--text-muted);">Skor Rata-rata: <b>${p3.averageScore}</b></div>
        <div class="podium-badge-rank">🥉 #3</div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderLeaderboardTable(list) {
  const tbody = document.getElementById('leaderboardTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">
          Belum ada riwayat kuis tersimpan.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list
    .map((row) => {
      let rankClass = 'normal';
      let rankDisplay = `#${row.rank}`;
      if (row.rank === 1) { rankClass = 'top-1'; rankDisplay = '🥇 1'; }
      else if (row.rank === 2) { rankClass = 'top-2'; rankDisplay = '🥈 2'; }
      else if (row.rank === 3) { rankClass = 'top-3'; rankDisplay = '🥉 3'; }

      const badgesHtml = row.badges && row.badges.length > 0
        ? row.badges.map((b) => `<span class="badge-item" title="${b.name}: ${b.description}">${b.icon}</span>`).join(' ')
        : '<span style="color: var(--text-muted); font-size: 11px;">-</span>';

      return `
        <tr>
          <td>
            <span class="rank-badge ${rankClass}">${rankDisplay}</span>
          </td>
          <td>
            <div class="user-cell">
              <div class="user-cell-avatar">${row.userName.charAt(0).toUpperCase()}</div>
              <div class="user-cell-info">
                <h4>${row.userName}</h4>
                <span>+${row.userPhone.replace(/[^0-9]/g, '')}</span>
              </div>
            </div>
          </td>
          <td><b>${row.className || '-'}</b></td>
          <td>
            <span class="level-tag">
              <i class="fa-solid fa-star" style="color: #fbbf24;"></i> Lv.${row.level} (${row.levelTitle.split(' ')[0]})
            </span>
          </td>
          <td>
            <span style="font-weight: 700; color: #fbbf24;">⚡ ${row.totalXp} XP</span>
          </td>
          <td><b>${row.quizzesCompleted}</b> Kuis</td>
          <td>
            <span style="font-weight: 700; color: ${row.averageScore >= 70 ? 'var(--emerald)' : 'var(--amber)'};">
              ${row.averageScore} / 100
            </span>
          </td>
          <td>
            <span class="streak-tag">🔥 ${row.currentStreak} Hari</span>
          </td>
          <td>
            <div class="badges-row">${badgesHtml}</div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function filterLeaderboardTable() {
  const query = document.getElementById('leaderboardSearch').value.toLowerCase();
  const filtered = cachedLeaderboard.filter((r) => {
    return (
      r.userName.toLowerCase().includes(query) ||
      (r.className && r.className.toLowerCase().includes(query)) ||
      r.userPhone.includes(query)
    );
  });
  renderLeaderboardTable(filtered);
}

// 3. Fetch & Render Subjects
async function fetchSubjects() {
  try {
    const res = await fetch('/api/subjects');
    const subjects = await res.json();
    const grid = document.getElementById('subjectsGrid');

    grid.innerHTML = subjects
      .map(
        (sub) => `
      <div class="subject-card">
        <button class="delete-btn" onclick="deleteSubject('${sub.id}')"><i class="fa-solid fa-trash"></i></button>
        <div class="subject-icon">${sub.icon}</div>
        <h3>${sub.name}</h3>
        <span class="subject-code">${sub.code}</span>
        <p>${sub.description || 'Tidak ada deskripsi'}</p>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleAddSubject(e) {
  e.preventDefault();
  const name = document.getElementById('subjectName').value;
  const code = document.getElementById('subjectCode').value;
  const icon = document.getElementById('subjectIcon').value;
  const description = document.getElementById('subjectDesc').value;

  try {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, icon, description }),
    });
    if (res.ok) {
      closeModal('modalAddSubject');
      fetchSubjects();
      fetchDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteSubject(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus mata pelajaran ini?')) return;
  try {
    const res = await fetch(`/api/subjects/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchSubjects();
      fetchDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

// 4. Fetch & Render Users
async function fetchUsers() {
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    const tbody = document.getElementById('usersTableBody');

    tbody.innerHTML = users
      .map(
        (u) => `
      <tr>
        <td><b>${u.name}</b></td>
        <td><code>${u.phoneNumber}</code></td>
        <td><span class="role-tag ${u.role}">${u.role === 'TEACHER' ? 'GURU' : u.role === 'STUDENT' ? 'SISWA' : 'ADMIN'}</span></td>
        <td>${u.className || '-'}</td>
        <td>
          <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

async function handleAddUser(e) {
  e.preventDefault();
  const name = document.getElementById('userName').value;
  const phoneNumber = document.getElementById('userPhone').value;
  const role = document.getElementById('userRole').value;
  const className = document.getElementById('userClass').value;

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phoneNumber, role, className }),
    });
    if (res.ok) {
      closeModal('modalAddUser');
      fetchUsers();
      fetchDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteUser(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus pengguna ini?')) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchUsers();
      fetchDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

// 5. Fetch & Upload Materials
async function fetchMaterials() {
  try {
    const res = await fetch('/api/materials');
    const materials = await res.json();
    const list = document.getElementById('materialsList');

    if (materials.length === 0) {
      list.innerHTML = '<p style="padding: 24px; color: var(--text-muted); text-align: center;">Belum ada file materi PDF diunggah.</p>';
      return;
    }

    list.innerHTML = materials
      .map(
        (m) => `
      <div class="material-item">
        <div class="material-info">
          <i class="fa-solid fa-file-pdf material-icon"></i>
          <div>
            <div class="material-title">${m.filename}</div>
            <div class="material-meta">Ukuran: ${m.sizeMb} MB | Terakhir Diubah: ${new Date(m.modifiedAt).toLocaleDateString('id-ID')}</div>
          </div>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteMaterial('${m.filename}')"><i class="fa-solid fa-trash"></i></button>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error(err);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    document.getElementById('fileNameLabel').innerText = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    document.getElementById('fileSelectedInfo').style.display = 'flex';
  }
}

async function uploadMaterialFile(e) {
  e.preventDefault();
  const fileInput = document.getElementById('fileInput');
  if (!fileInput.files[0]) {
    alert('Silakan pilih file PDF terlebih dahulu.');
    return;
  }

  const formData = new FormData();
  formData.append('pdfFile', fileInput.files[0]);

  const btn = document.getElementById('btnSubmitUpload');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses & Mengunggah...';

  try {
    const res = await fetch('/api/upload-material', {
      method: 'POST',
      body: formData,
    });
    if (res.ok) {
      fileInput.value = '';
      document.getElementById('fileSelectedInfo').style.display = 'none';
      fetchMaterials();
      fetchDashboardData();
      alert('File materi PDF berhasil diunggah & diekstraksi oleh AI!');
    } else {
      alert('Gagal mengunggah file.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-upload"></i> Unggah Materi';
  }
}

async function deleteMaterial(filename) {
  if (!confirm(`Hapus file materi ${filename}?`)) return;
  try {
    const res = await fetch(`/api/materials/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    if (res.ok) {
      fetchMaterials();
      fetchDashboardData();
    }
  } catch (err) {
    console.error(err);
  }
}

// 6. SIMULATOR CHAT WIDGET
function handleChatKeyPress(e) {
  if (e.key === 'Enter') {
    sendSimulatedMessage();
  }
}

async function sendSimulatedMessage() {
  const input = document.getElementById('chatInput');
  const msgText = input.value.trim();
  if (!msgText) return;

  const chatBody = document.getElementById('chatSimulatorBody');

  // Append User Bubble
  const userBubble = document.createElement('div');
  userBubble.className = 'chat-message user';
  userBubble.innerText = msgText;
  chatBody.appendChild(userBubble);

  input.value = '';
  chatBody.scrollTop = chatBody.scrollHeight;

  // Thinking Bubble
  const botBubble = document.createElement('div');
  botBubble.className = 'chat-message bot';
  botBubble.innerHTML = '⏳ <i>Bot sedang memikirkan balasan...</i>';
  chatBody.appendChild(botBubble);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const res = await fetch('/api/chat-simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msgText }),
    });
    const data = await res.json();
    botBubble.innerHTML = data.reply.replace(/\n/g, '<br>');
  } catch (err) {
    botBubble.innerText = '❌ Gagal memproses balasan simulasi.';
  }
  chatBody.scrollTop = chatBody.scrollHeight;
}

// MODAL UTILITIES
function openModal(modalId) {
  document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// RAG SEMANTIC SEARCH TESTER
async function executeRagSearch() {
  const query = document.getElementById('ragSearchQuery').value.trim();
  const subject = document.getElementById('ragSearchSubject').value;
  if (!query) return;

  const btn = document.getElementById('btnRagSearch');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mencari...';

  const resultsDiv = document.getElementById('ragSearchResults');
  const resultsList = document.getElementById('ragResultsList');
  resultsDiv.style.display = 'block';
  resultsList.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Sedang memindai chunks buku pelajaran...</div>';

  try {
    const res = await fetch(`/api/search-curriculum?q=${encodeURIComponent(query)}&subject=${encodeURIComponent(subject)}`);
    const data = await res.json();

    if (!data.hits || data.hits.length === 0) {
      resultsList.innerHTML = `
        <div style="padding: 15px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; color: #fca5a5; font-size: 13px;">
          <i class="fa-solid fa-circle-exclamation"></i> Tidak ditemukan potongan materi yang cocok untuk kata kunci <b>"${query}"</b> pada mapel <b>${subject}</b>.
        </div>
      `;
    } else {
      resultsList.innerHTML = data.hits.map((hit, i) => `
        <div style="padding: 14px; background: #0f172a; border: 1px solid #334155; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: #38bdf8;">
              <i class="fa-solid fa-book-open"></i> #${i+1} ${hit.chunk.sourceFile}
            </span>
            <span style="font-size: 11px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 8px; border-radius: 4px;">
              Skor BM25: ${hit.score.toFixed(2)}
            </span>
          </div>
          <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; white-space: pre-wrap; margin: 0;">${hit.chunk.content}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    resultsList.innerHTML = '<div style="color: #ef4444; font-size: 13px;">Gagal melakukan pencarian RAG.</div>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Cari Rujukan';
  }
}
