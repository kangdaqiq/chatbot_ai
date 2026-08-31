import { GeminiService } from '../services/gemini.service';
import { SessionService } from '../services/session.service';
import { CurriculumService } from '../services/curriculum.service';
import { GamificationService } from '../services/gamification.service';
import { AudioService } from '../services/audio.service';
import { DataStore } from '../web/dataStore';
import { Quiz, QuizQuestion, UserSession } from '../models/types';

export class MessageRouter {
  private gemini: GeminiService;
  private sessionService: SessionService;
  private curriculumService: CurriculumService;
  private gamification: GamificationService;
  private audioService: AudioService;
  private dataStore: DataStore;

  constructor() {
    this.gemini = new GeminiService();
    this.sessionService = new SessionService();
    this.curriculumService = new CurriculumService();
    this.gamification = new GamificationService();
    this.audioService = new AudioService();
    this.dataStore = new DataStore();
  }

  public getGamificationService(): GamificationService {
    return this.gamification;
  }

  public getAudioService(): AudioService {
    return this.audioService;
  }

  /**
   * Main Handler untuk memproses setiap pesan masuk dari WhatsApp
   */
  async handleMessage(userPhone: string, text: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);
    const cleanText = text.trim();
    const lowerText = cleanText.toLowerCase();

    // Command global untuk kembali ke menu utama kapan saja
    if (lowerText === 'menu' || lowerText === 'batal' || lowerText === 'keluar' || lowerText === 'home') {
      this.sessionService.resetSession(userPhone);
      return this.renderMainMenu();
    }

    // Direct Shortcuts untuk Leaderboard & Profil kapan saja
    if (lowerText === 'leaderboard' || lowerText === 'rank' || lowerText === 'peringkat') {
      return this.renderLeaderboard(userPhone);
    }

    if (lowerText === 'profil' || lowerText === 'profile' || lowerText === 'skor' || lowerText === 'nilai' || lowerText === 'xp') {
      return this.renderProfile(userPhone);
    }

    // Handlers berdasarkan State User
    switch (session.state) {
      case 'IDLE':
        return this.handleIdleState(userPhone, cleanText);

      case 'SELECTING_SUBJECT':
        return this.handleSubjectSelection(userPhone, cleanText);

      case 'TUTOR_QA':
        return this.handleTutorQA(userPhone, cleanText);

      case 'QUIZ_IN_PROGRESS':
        return this.handleQuizInProgress(userPhone, cleanText);

      default:
        this.sessionService.resetSession(userPhone);
        return this.renderMainMenu();
    }
  }

  /**
   * Handler khusus untuk memproses pesan suara / Voice Note (PTT) yang dikirim siswa
   */
  async handleAudioMessage(userPhone: string, audioBase64: string, mimeType: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);

    const subject = this.sessionService.getSubjectById(session.activeSubjectId || '');
    const subjectName = subject ? subject.name : 'Umum';

    // Panggil Gemini Multimodal Audio untuk mendengarkan dan menjawab suara siswa
    const aiExplanation = await this.gemini.explainAudioConcept(subjectName, audioBase64, mimeType, session.chatHistory);

    // Simpan ke riwayat percakapan
    this.sessionService.appendChatHistory(userPhone, '[Voice Note Siswa]', aiExplanation);

    return aiExplanation;
  }

  /**
   * Handler khusus untuk memproses gambar/foto yang dikirim siswa
   */
  async handleImageMessage(userPhone: string, imageBase64: string, mimeType: string, caption?: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);

    // Ambil mata pelajaran aktif jika siswa sudah memilih, atau gunakan 'Umum'
    const subject = this.sessionService.getSubjectById(session.activeSubjectId || '');
    const subjectName = subject ? subject.name : 'Umum';

    // Panggil Gemini Multimodal (Vision)
    return await this.gemini.explainImageConcept(subjectName, imageBase64, mimeType, caption);
  }

  private renderMainMenu(): string {
    let menu = `🤖 *AI LEARNING BOT WHATSAPP*\n`;
    menu += `Selamat datang di Asisten Belajar Pintar!\n\n`;
    menu += `Silakan pilih menu di bawah ini:\n`;
    menu += `1️⃣ Pilih Mata Pelajaran (Belajar & Tanya AI)\n`;
    menu += `2️⃣ Mulai Kuis Interaktif (Dapatkan XP!)\n`;
    menu += `3️⃣ 🏆 Papan Peringkat & Profil Prestasi\n`;
    menu += `4️⃣ 📖 Petunjuk Penggunaan\n\n`;
    menu += `_Ketik angka 1, 2, 3, atau 4 untuk memilih:_`;
    return menu;
  }

  private handleIdleState(userPhone: string, text: string): string {
    const session = this.sessionService.getSession(userPhone);
    const cleanLower = text.toLowerCase();

    if (text === '1' || cleanLower.includes('belajar') || cleanLower.includes('mapel')) {
      session.state = 'SELECTING_SUBJECT';
      this.sessionService.updateSession(session);
      return this.renderSubjectMenu('pembelajaran & Tanya AI');
    }

    if (text === '2' || cleanLower.includes('kuis')) {
      session.state = 'SELECTING_SUBJECT';
      this.sessionService.updateSession(session);
      return this.renderSubjectMenu('kuis interaktif');
    }

    if (text === '3' || cleanLower.includes('leaderboard') || cleanLower.includes('peringkat') || cleanLower.includes('skor') || cleanLower.includes('profil')) {
      return this.renderLeaderboard(userPhone);
    }

    if (text === '4' || cleanLower.includes('bantuan') || cleanLower.includes('petunjuk')) {
      let help = `📖 *PETUNJUK PENGGUNAAN*\n\n`;
      help += `• *Tanya AI*: Pilih mapel lalu ketik pertanyaan (cth: "Jelaskan Hukum Newton 1").\n`;
      help += `• *Kuis*: Jawab soal pilihan ganda (A/B/C/D) untuk mengumpulkan XP & Medali.\n`;
      help += `• *Leaderboard*: Ketik *LEADERBOARD* untuk melihat posisi ranking kelasmu.\n`;
      help += `• *Profil*: Ketik *PROFIL* untuk melihat total XP, level, dan medali terkumpul.\n`;
      help += `• *Foto Soal*: Kirim foto tugas/soal untuk dibahas langkah demi langkah.\n`;
      help += `• *Navigasi*: Ketik *MENU* kapan saja untuk kembali ke tampilan awal.\n\n`;
      help += `Ketik *MENU* untuk mulai.`;
      return help;
    }

    return `Pilihan tidak dikenali.\n\n` + this.renderMainMenu();
  }

  private renderSubjectMenu(purpose: string): string {
    let text = `📚 *PILIH MATA PELAJARAN* (${purpose})\n\n`;
    SessionService.SUBJECTS.forEach((sub) => {
      text += `${sub.icon} *[${sub.id}]* ${sub.name} - _${sub.description}_\n`;
    });
    text += `\n_Ketik nomor angka mapel pilihanmu (cth: 1):_`;
    return text;
  }

  private async handleSubjectSelection(userPhone: string, text: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);
    const subject = this.sessionService.getSubjectById(text);

    if (!subject) {
      return `❌ Nomor mapel tidak valid. Silakan ketik angka mapel yang sesuai (1 - ${SessionService.SUBJECTS.length}):`;
    }

    session.activeSubjectId = subject.id;

    // Jika user berada di alur Kuis
    if (session.activeQuiz || text === '2') {
      session.state = 'QUIZ_IN_PROGRESS';
      this.sessionService.updateSession(session);
      return await this.startQuizForSubject(userPhone, subject.name);
    }

    // Default ke Mode Tutor Q&A
    session.state = 'TUTOR_QA';
    this.sessionService.updateSession(session);

    let res = `🎉 *Kamu telah memilih Mapel: ${subject.icon} ${subject.name}*\n\n`;
    res += `Sekarang kamu ada di mode *Tutor AI Interaktif (Panduan Belajar)* 💡.\n`;
    res += `Kirimkan pertanyaan, foto soal, atau voice note seputar ${subject.name}.\n`;
    res += `_AI Tutor akan memandu langkah demi langkah dan membantumu menemukan jawabannya sendiri secara mandiri!_\n\n`;
    res += `💡 _Ketik *KUIS* kapan saja untuk uji kemampuan & kumpulkan XP!_`;
    return res;
  }

  private async handleTutorQA(userPhone: string, text: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);
    const subject = this.sessionService.getSubjectById(session.activeSubjectId || '1');
    const subjectName = subject ? subject.name : 'Umum';

    if (text.toLowerCase() === 'kuis') {
      session.state = 'QUIZ_IN_PROGRESS';
      this.sessionService.updateSession(session);
      return await this.startQuizForSubject(userPhone, subjectName);
    }

    // Ambil konteks potongan kurikulum sekolah yang relevan menggunakan RAG Engine
    const curriculumContext = this.curriculumService.getRelevantContext(subjectName, text);
    const history = session.chatHistory || [];

    // Tanya AI Gemini untuk menjelaskan materi dengan riwayat percakapan
    const aiExplanation = await this.gemini.explainConcept(subjectName, text, curriculumContext, history);

    // Simpan riwayat percakapan ke memori permanen
    this.sessionService.appendChatHistory(userPhone, text, aiExplanation);
    return aiExplanation;
  }

  private async startQuizForSubject(userPhone: string, subjectName: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);

    // Minta AI Gemini generate 3 soal kuis otomatis
    const questions = await this.gemini.generateQuizQuestions(subjectName, 'Materi Umum', 3);

    // Fallback jika API key belum diisi / offline
    const quizQuestions: QuizQuestion[] = questions.length > 0 ? questions : [
      {
        id: 1,
        questionText: `Berapakah hasil dari 12 x 5?`,
        options: { A: '50', B: '60', C: '70', D: '80' },
        correctOption: 'B',
        explanation: '12 dikali 5 adalah 60.',
      },
      {
        id: 2,
        questionText: `Manakah yang merupakan bilangan prima?`,
        options: { A: '4', B: '9', C: '11', D: '15' },
        correctOption: 'C',
        explanation: '11 hanya bisa dibagi 1 dan dirinya sendiri.',
      }
    ];

    session.activeQuiz = {
      id: `quiz_${Date.now()}`,
      subjectId: session.activeSubjectId || '1',
      title: `Kuis ${subjectName}`,
      questions: quizQuestions,
    };
    session.currentQuestionIndex = 0;
    session.score = 0;
    session.userAnswers = [];
    this.sessionService.updateSession(session);

    return `📝 *MEMULAI KUIS: ${subjectName.toUpperCase()}*\n⚡ _Kumpulkan XP untuk naik level & bersaing di Leaderboard!_\n\n` + this.renderCurrentQuestion(session);
  }

  private handleQuizInProgress(userPhone: string, text: string): string {
    const session = this.sessionService.getSession(userPhone);
    const quiz = session.activeQuiz;

    if (!quiz || !quiz.questions[session.currentQuestionIndex]) {
      this.sessionService.resetSession(userPhone);
      return `Sesi kuis telah berakhir.\n\n` + this.renderMainMenu();
    }

    const currentQ = quiz.questions[session.currentQuestionIndex];
    const userChoice = text.trim().toUpperCase() as 'A' | 'B' | 'C' | 'D';

    if (!['A', 'B', 'C', 'D'].includes(userChoice)) {
      return `❌ Pilihan tidak valid. Ketik huruf *A*, *B*, *C*, atau *D* untuk menjawab:`;
    }

    const isCorrect = userChoice === currentQ.correctOption;
    if (isCorrect) {
      session.score += 100 / quiz.questions.length;
    }

    session.userAnswers.push({
      questionId: currentQ.id,
      userChoice,
      isCorrect,
    });

    let feedback = isCorrect 
      ? `✅ *JAWABANMU BENAR!* 🎉` 
      : `❌ *JAWABANMU KURANG TEPAT.* (Kamu pilih ${userChoice}, jawaban benar: *${currentQ.correctOption}*)`;

    feedback += `\n💡 *Pembahasan*: ${currentQ.explanation}\n`;
    feedback += `────────────────────────────────────\n`;

    session.currentQuestionIndex++;
    this.sessionService.updateSession(session);

    // Cek apakah kuis sudah selesai
    if (session.currentQuestionIndex >= quiz.questions.length) {
      const finalScore = Math.round(session.score);
      const subject = this.sessionService.getSubjectById(session.activeSubjectId || '1');
      const subjectName = subject ? subject.name : 'Umum';

      // Cari data nama user terdaftar
      const users = this.dataStore.getUsers();
      const matchedUser = users.find((u) => {
        const cleanIncoming = userPhone.replace(/[^0-9]/g, '');
        const cleanU = u.phoneNumber.replace(/[^0-9]/g, '');
        return cleanIncoming.includes(cleanU) || cleanU.includes(cleanIncoming);
      });

      const userName = matchedUser ? matchedUser.name : 'Siswa Berbakat';
      const className = matchedUser ? matchedUser.className : '';

      // Catat ke Gamification Engine
      const gamificationResult = this.gamification.recordQuizAttempt({
        userPhone,
        userName,
        className,
        subjectId: session.activeSubjectId || '1',
        subjectName,
        score: finalScore,
        totalQuestions: quiz.questions.length,
        userAnswers: session.userAnswers,
      });

      session.state = 'IDLE';
      this.sessionService.updateSession(session);

      let summary = feedback + `\n🏆 *KUIS SELESAI!*\n`;
      summary += `Nilai Akhir: *${finalScore} / 100*\n`;
      summary += `⚡ Perolehan XP: *+${gamificationResult.xpEarned} XP*`;
      if (gamificationResult.streakBonus > 0) {
        summary += ` _(Termasuk bonus streak +${gamificationResult.streakBonus} XP 🔥)_`;
      }
      summary += `\n`;

      if (gamificationResult.levelUp) {
        summary += `\n🎉 *LEVEL UP!* Selamat, kamu naik ke *Level ${gamificationResult.newLevel}* (${gamificationResult.profile.levelTitle})! 🚀\n`;
      } else {
        summary += `⭐ Level: *${gamificationResult.profile.levelTitle}* (Total: ${gamificationResult.profile.totalXp} XP)\n`;
      }

      summary += `🏅 Peringkat Kelas: *#${gamificationResult.rank}*\n`;
      summary += `🔥 Streak Belajar: *${gamificationResult.profile.currentStreak} Hari*\n`;

      if (gamificationResult.newBadges && gamificationResult.newBadges.length > 0) {
        summary += `\n🎖️ *MEDALI BARU DIRAIH!*:\n`;
        gamificationResult.newBadges.forEach((b) => {
          summary += `  ${b.icon} *${b.name}* - _${b.description}_\n`;
        });
      }

      summary += `\n` + (finalScore >= 70 ? `🌟 *Luar biasa! Pertahankan prestasi belajarmu!*` : `💪 *Bagus sekali! Pelajari lagi materinya untuk raih nilai 100!*`);
      summary += `\n\n💡 _Ketik *LEADERBOARD* untuk cek peringkat atau *MENU* untuk kembali._`;
      return summary;
    }

    // Tampilkan soal berikutnya
    return feedback + `\n` + this.renderCurrentQuestion(session);
  }

  private renderCurrentQuestion(session: UserSession): string {
    const quiz = session.activeQuiz!;
    const q = quiz.questions[session.currentQuestionIndex];
    const total = quiz.questions.length;

    let text = `❓ *Soal ${session.currentQuestionIndex + 1} dari ${total}*\n`;
    text += `*${q.questionText}*\n\n`;
    text += `A. ${q.options.A}\n`;
    text += `B. ${q.options.B}\n`;
    text += `C. ${q.options.C}\n`;
    text += `D. ${q.options.D}\n\n`;
    text += `_Ketik huruf pilihanmu (A / B / C / D):_`;
    return text;
  }

  /**
   * Menampilkan Papan Peringkat (Leaderboard) di WhatsApp
   */
  public renderLeaderboard(userPhone: string): string {
    const leaderboard = this.gamification.getLeaderboard(10);
    const userRank = this.gamification.getUserRank(userPhone);
    const userProfile = this.gamification.getOrCreateProfile(userPhone);

    let text = `🏆 *PAPAN PERINGKAT KELAS (LEADERBOARD)* 🏆\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (leaderboard.length === 0) {
      text += `_Belum ada data kuis. Jadilah yang pertama mengerjakan kuis!_\n`;
    } else {
      leaderboard.forEach((r) => {
        let medal = '▫️';
        if (r.rank === 1) medal = '🥇';
        else if (r.rank === 2) medal = '🥈';
        else if (r.rank === 3) medal = '🥉';
        else medal = `*#${r.rank}*`;

        text += `${medal} *${r.userName}* (${r.className || 'Siswa'})\n`;
        text += `   ⚡ *${r.totalXp} XP* | Level ${r.level} | Skor: ${r.averageScore} | ${r.quizzesCompleted} Kuis\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📍 *Posisi Kamu:*\n`;
    text += `🏅 Peringkat: *#${userRank}* dari ${leaderboard.length} siswa\n`;
    text += `⚡ Total XP: *${userProfile.totalXp} XP* (${userProfile.levelTitle})\n`;
    text += `🔥 Streak Belajar: *${userProfile.currentStreak} Hari*\n\n`;
    text += `💡 _Ketik *PROFIL* untuk melihat detail medali atau *KUIS* untuk tambah XP!_`;
    return text;
  }

  /**
   * Menampilkan Kartu Profil Prestasi & Badges Siswa di WhatsApp
   */
  public renderProfile(userPhone: string): string {
    const data = this.gamification.getUserProfile(userPhone);
    const profile = data ? data.profile : this.gamification.getOrCreateProfile(userPhone);
    const rank = data ? data.rank : this.gamification.getUserRank(userPhone);
    const levelInfo = GamificationService.calculateLevel(profile.totalXp);

    let text = `👤 *KARTU PROFIL PRESTASI SISWA*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📛 Nama: *${profile.userName}*\n`;
    if (profile.className) {
      text += `🏫 Kelas: *${profile.className}*\n`;
    }
    text += `🏆 Peringkat Kelas: *#${rank}*\n\n`;

    text += `📊 *Statistik Belajar:*\n`;
    text += `⭐ Level: *Level ${profile.level}* (${profile.levelTitle})\n`;
    text += `⚡ Total XP: *${profile.totalXp} XP* (Target: ${levelInfo.nextLevelXp} XP)\n`;
    text += `📝 Total Kuis Selesai: *${profile.quizzesCompleted} Kuis*\n`;
    text += `🎯 Rata-rata Nilai: *${profile.averageScore} / 100*\n`;
    text += `💯 Nilai Tertinggi: *${profile.highestScore} / 100*\n`;
    text += `🔥 Streak Belajar: *${profile.currentStreak} Hari*\n\n`;

    text += `🎖️ *Medali & Badges Terkumpul (${profile.badges.length}):*\n`;
    if (profile.badges.length === 0) {
      text += `_Belum ada medali. Selesaikan kuis pertamamu untuk meraih medali!_\n`;
    } else {
      profile.badges.forEach((b) => {
        text += `• ${b.icon} *${b.name}*: _${b.description}_\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Ketik *KUIS* untuk mengumpulkan lebih banyak XP!`;
    return text;
  }
}
