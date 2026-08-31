import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import fileUpload from 'express-fileupload';
import { WebSocketServer, WebSocket } from 'ws';
import { WhatsAppClient } from './bot/waClient';
import { DataStore } from './web/dataStore';
import { CurriculumService } from './services/curriculum.service';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const port = process.env.PORT || 3000;

// Initialize Core Services
const dataStore = new DataStore();
const curriculumService = new CurriculumService();
const waClient = new WhatsAppClient();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } })); // Support up to 50MB PDF uploads
app.use(express.static(path.join(process.cwd(), 'public')));

// Broadcast to all WebSocket Clients
function broadcast(type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Forward WhatsApp Events to Web Clients
waClient.on('status', (data) => broadcast('status', data));
waClient.on('qr', (data) => broadcast('qr', data));
waClient.on('log', (data) => broadcast('log', data));

// REST API ENDPOINTS

// 1. System Status & Stats
app.get('/api/status', (req, res) => {
  const materialsDir = path.join(process.cwd(), 'data', 'curriculum');
  let materialsCount = 0;
  if (fs.existsSync(materialsDir)) {
    materialsCount = fs.readdirSync(materialsDir).length;
  }

  const gamification = waClient.getRouter().getGamificationService();
  const leaderboard = gamification.getLeaderboard();
  const quizHistory = gamification.getQuizHistory();

  res.json({
    status: waClient.status,
    qrDataUrl: waClient.currentQrUrl,
    connectedPhone: waClient.connectedPhone,
    stats: {
      totalSubjects: dataStore.getSubjects().length,
      totalUsers: dataStore.getUsers().length,
      totalMaterials: materialsCount,
      totalChunks: curriculumService.getTotalChunksCount(),
      totalQuizzesTaken: quizHistory.length,
      topStudent: leaderboard.length > 0 ? leaderboard[0].userName : '-',
    },
  });
});

// WhatsApp Logout & Reset QR Code Endpoint
app.post('/api/wa/logout', async (req, res) => {
  try {
    await waClient.logout();
    broadcast('update', { message: 'WhatsApp telah logout' });
    res.json({ success: true, message: 'WhatsApp berhasil logout. QR Code baru sedang digenerate...' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Gagal logout WhatsApp' });
  }
});

// 2. Subjects Management (Tambah & Hapus Mapel)
app.get('/api/subjects', (req, res) => {
  res.json(dataStore.getSubjects());
});

app.post('/api/subjects', (req, res) => {
  const { name, code, description, icon } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: 'Nama mapel dan kode wajib diisi.' });
  }
  const newSubject = dataStore.addSubject({
    name,
    code,
    description: description || '',
    icon: icon || '📚',
  });
  broadcast('update', { message: 'Mata pelajaran berhasil ditambahkan' });
  res.json({ success: true, subject: newSubject });
});

app.delete('/api/subjects/:id', (req, res) => {
  const success = dataStore.deleteSubject(req.params.id);
  if (success) {
    broadcast('update', { message: 'Mata pelajaran dihapus' });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Mata pelajaran tidak ditemukan' });
  }
});

// 3. User Management (Tambah Nomor Guru & Siswa)
app.get('/api/users', (req, res) => {
  res.json(dataStore.getUsers());
});

app.post('/api/users', (req, res) => {
  const { name, phoneNumber, role, className } = req.body;
  if (!name || !phoneNumber || !role) {
    return res.status(400).json({ error: 'Nama, Nomor Telepon, dan Role wajib diisi.' });
  }
  const newUser = dataStore.addUser({
    name,
    phoneNumber: phoneNumber.replace(/[^0-9]/g, ''),
    role,
    className: className || '',
  });
  broadcast('update', { message: 'Pengguna baru berhasil terdaftar' });
  res.json({ success: true, user: newUser });
});

app.delete('/api/users/:id', (req, res) => {
  const success = dataStore.deleteUser(req.params.id);
  if (success) {
    broadcast('update', { message: 'Pengguna dihapus' });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  }
});

// 4. Materials & PDF Uploader (Upload Materi PDF / Text / JSON)
app.get('/api/materials', (req, res) => {
  const materialsDir = path.join(process.cwd(), 'data', 'curriculum');
  if (!fs.existsSync(materialsDir)) {
    return res.json([]);
  }
  const files = fs.readdirSync(materialsDir).map((filename) => {
    const filePath = path.join(materialsDir, filename);
    const stats = fs.statSync(filePath);
    return {
      filename,
      sizeBytes: stats.size,
      sizeMb: (stats.size / (1024 * 1024)).toFixed(2),
      modifiedAt: stats.mtime,
    };
  });
  res.json(files);
});

app.post('/api/upload-material', async (req: any, res: any) => {
  if (!req.files || !req.files.pdfFile) {
    return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
  }

  const uploadedFile = req.files.pdfFile;
  const materialsDir = path.join(process.cwd(), 'data', 'curriculum');
  if (!fs.existsSync(materialsDir)) {
    fs.mkdirSync(materialsDir, { recursive: true });
  }

  const destPath = path.join(materialsDir, uploadedFile.name);
  await uploadedFile.mv(destPath);

  // Reload Curriculum Index & Rebuild RAG
  await curriculumService.loadMaterials(true);

  broadcast('update', { message: `File ${uploadedFile.name} berhasil diunggah & diindeks RAG` });
  res.json({ success: true, filename: uploadedFile.name });
});

app.delete('/api/materials/:filename', async (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(process.cwd(), 'data', 'curriculum', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    await curriculumService.loadMaterials(true);
    broadcast('update', { message: `File ${filename} dihapus` });
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File tidak ditemukan' });
  }
});

// 4b. RAG Semantic Search Test Endpoint
app.get('/api/search-curriculum', (req, res) => {
  const query = (req.query.q as string) || '';
  const subject = (req.query.subject as string) || 'Umum';
  const hits = curriculumService.searchRelevantChunks(subject, query, 5);
  res.json({ query, subject, resultsCount: hits.length, hits });
});

// 5. Leaderboard & Gamification APIs
app.get('/api/leaderboard', (req, res) => {
  const gamification = waClient.getRouter().getGamificationService();
  res.json(gamification.getLeaderboard());
});

app.get('/api/quiz-results', (req, res) => {
  const gamification = waClient.getRouter().getGamificationService();
  res.json(gamification.getQuizHistory());
});

app.get('/api/export-scores-csv', (req, res) => {
  const gamification = waClient.getRouter().getGamificationService();
  const csvData = gamification.exportResultsToCSV();
  const filename = `rekap_nilai_siswa_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvData);
});

app.post('/api/reset-leaderboard', (req, res) => {
  const gamification = waClient.getRouter().getGamificationService();
  gamification.resetLeaderboard();
  broadcast('leaderboard_update', { message: 'Data Leaderboard telah di-reset' });
  res.json({ success: true });
});

// 6. Interactive Chat Simulation API
app.post('/api/chat-simulate', async (req, res) => {
  const { userPhone, message } = req.body;
  const phone = userPhone || '6281234567890';
  try {
    const result = await waClient.getRouter().handleMessage(phone, message || 'Halo');
    const replyText = typeof result === 'string' ? result : result.text;
    // Jika respon memuat kuis selesai / skor, broadcast update ke dashboard
    if (replyText.includes('KUIS SELESAI') || replyText.includes('Peringkat Kelas')) {
      broadcast('leaderboard_update', { message: 'Hasil kuis baru masuk' });
    }
    res.json({ success: true, reply: replyText });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Error processing message' });
  }
});

// WebSocket Connection Event
wss.on('connection', (ws) => {
  ws.send(
    JSON.stringify({
      type: 'status',
      payload: {
        status: waClient.status,
        qrDataUrl: waClient.currentQrUrl,
      },
    })
  );
});

// Start Server & Start WhatsApp Client
server.listen(port, () => {
  console.log('====================================================');
  console.log(`🌐 WEB DASHBOARD AKTIF DI: http://localhost:${port}`);
  console.log('====================================================');
  waClient.start();
});
