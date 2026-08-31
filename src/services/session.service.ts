import fs from 'fs';
import path from 'path';
import { UserSession, Subject, ChatMessageHistory } from '../models/types';

export class SessionService {
  private sessionsFile = path.join(process.cwd(), 'data', 'sessions.json');
  private sessions: Map<string, UserSession> = new Map();

  // Data Mapel
  public static readonly SUBJECTS: Subject[] = [
    { id: '1', code: 'MATH', name: 'Matematika', description: 'Aljabar, Geometri, Aritmatika', icon: '🧮' },
    { id: '2', code: 'PHYS', name: 'Fisika', description: 'Gaya, Energi, Hukum Newton', icon: '🧪' },
    { id: '3', code: 'ENG', name: 'Bahasa Inggris', description: 'Grammar, Vocabulary, Reading', icon: '🇬🇧' },
    { id: '4', code: 'HIST', name: 'Sejarah Indonesia', description: 'Kemerdekaan, Kerajaan, Sejarah Dunia', icon: '📜' },
    { id: '5', code: 'PAI', name: 'Pendidikan Agama Islam', description: 'Al-Qur\'an, Hadis, Aqidah, Akhlak, Fiqih, & Sejarah Islam (Buku Guru K10)', icon: '🕌' },
  ];

  constructor() {
    this.loadSessions();
  }

  /**
   * Memuat semua sesi yang tersimpan di data/sessions.json saat aplikasi booting
   */
  private loadSessions(): void {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        const content = fs.readFileSync(this.sessionsFile, 'utf-8');
        const parsed = JSON.parse(content) as Record<string, UserSession>;
        for (const [phone, session] of Object.entries(parsed)) {
          this.sessions.set(phone, session);
        }
        console.log(`💾 [SESSION STORE] Berhasil memuat ${this.sessions.size} sesi pengguna terimpan.`);
      }
    } catch (err) {
      console.error('❌ Gagal memuat sesi tersimpan:', err);
    }
  }

  /**
   * Menyimpan semua sesi pengguna secara permanen ke file JSON
   */
  private saveSessions(): void {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const obj: Record<string, UserSession> = {};
      for (const [phone, session] of this.sessions.entries()) {
        obj[phone] = session;
      }

      fs.writeFileSync(this.sessionsFile, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.error('❌ Gagal menyimpan sesi pengguna:', err);
    }
  }

  getSession(userPhone: string): UserSession {
    let session = this.sessions.get(userPhone);
    if (!session) {
      session = {
        userPhone,
        state: 'IDLE',
        currentQuestionIndex: 0,
        score: 0,
        userAnswers: [],
        chatHistory: [],
        lastActiveAt: new Date().toISOString(),
      };
      this.sessions.set(userPhone, session);
      this.saveSessions();
    }
    return session;
  }

  updateSession(session: UserSession): void {
    session.lastActiveAt = new Date().toISOString();
    this.sessions.set(session.userPhone, session);
    this.saveSessions();
  }

  resetSession(userPhone: string): void {
    const existing = this.sessions.get(userPhone);
    this.sessions.set(userPhone, {
      userPhone,
      state: 'IDLE',
      currentQuestionIndex: 0,
      score: 0,
      userAnswers: [],
      chatHistory: existing?.chatHistory || [], // Pertahankan histori chat meski menu di-reset
      lastActiveAt: new Date().toISOString(),
    });
    this.saveSessions();
  }

  /**
   * Menambahkan riwayat chat (User & Bot) ke memori sesi pengguna
   */
  appendChatHistory(userPhone: string, userMsg: string, botReply: string): void {
    const session = this.getSession(userPhone);
    if (!session.chatHistory) {
      session.chatHistory = [];
    }

    session.chatHistory.push({ role: 'user', parts: userMsg });
    session.chatHistory.push({ role: 'model', parts: botReply });

    // Pangkas riwayat chat agar menyimpan maksimal 20 pesan terakhir (efisiensi memori)
    if (session.chatHistory.length > 20) {
      session.chatHistory = session.chatHistory.slice(session.chatHistory.length - 20);
    }

    this.updateSession(session);
  }

  getSubjectById(id: string): Subject | undefined {
    return SessionService.SUBJECTS.find((s) => s.id === id);
  }
}
