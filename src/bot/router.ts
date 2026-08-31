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

    // 1. Jika sedang dalam proses Kuis
    if (session.state === 'QUIZ_IN_PROGRESS') {
      if (lowerText === 'batal' || lowerText === 'keluar' || lowerText === 'stop' || lowerText === 'selesai' || lowerText === 'menu') {
        session.state = 'TUTOR_QA';
        session.activeQuiz = undefined;
        this.sessionService.updateSession(session);
        return `✅ *Sesi kuis dihentikan.* Kamu kembali ke mode diskusi belajar dengan AI Tutor! 💡\nSilakan tanyakan materi apa pun yang ingin kamu pelajari.`;
      }
      return this.handleQuizInProgress(userPhone, cleanText);
    }

    // 2. Direct Shortcuts untuk Leaderboard & Profil
    if (lowerText === 'leaderboard' || lowerText === 'rank' || lowerText === 'peringkat') {
      return this.renderLeaderboard(userPhone);
    }

    if (lowerText === 'profil' || lowerText === 'profile' || lowerText === 'skor' || lowerText === 'nilai' || lowerText === 'xp') {
      return this.renderProfile(userPhone);
    }

    // 3. Shortcut Kuis Interaktif
    if (lowerText === 'kuis' || lowerText === 'quiz' || lowerText === 'mulai kuis' || lowerText === 'latihan soal') {
      const currentSubject = this.sessionService.getSubjectById(session.activeSubjectId || '1');
      const subjectName = currentSubject ? currentSubject.name : 'Umum';
      session.state = 'QUIZ_IN_PROGRESS';
      this.sessionService.updateSession(session);
      return await this.startQuizForSubject(userPhone, subjectName);
    }

    // 4. Shortcut Bantuan / Panduan Belajar
    if (lowerText === 'bantuan' || lowerText === 'help' || lowerText === 'panduan' || lowerText === 'petunjuk' || lowerText === 'menu') {
      let help = `🤖 *AI TUTOR BELAJAR PINTAR*\n\n`;
      help += `Silakan langsung kirim pertanyaan atau materi sekolah yang ingin kamu pelajari! AI Tutor siap membimbingmu langkah demi langkah 💡.\n\n`;
      help += `• 💬 *Tanya Belajar*: Ketik pertanyaanmu secara bebas (Matematika, IPA/Fisika, PAI, Bahasa Inggris, Sejarah, Informatika, dsb).\n`;
      help += `• 📸 *Foto Soal*: Kirim foto tugas/soal untuk dibahas konsep & cara penyelesaiannya bersama.\n`;
      help += `• 🎙️ *Voice Note*: Kirim rekaman suara jika ingin bertanya via audio.\n`;
      help += `• 📝 *Kuis*: Ketik *KUIS* untuk latihan soal berpikir kritis & menguji pemahaman.\n`;
      help += `• 🏆 *Leaderboard*: Ketik *LEADERBOARD* untuk cek peringkat keaktifan kelas.\n`;
      help += `• ⭐ *Profil*: Ketik *PROFIL* untuk melihat total XP, level, dan medali prestasimu.\n`;
      return help;
    }

    // 5. SEMUA PESAN LAINNYA LANGSUNG DIPROSES OLEH AI TUTOR (Direct Conversational Learning)
    session.state = 'TUTOR_QA';
    this.sessionService.updateSession(session);
    return this.handleTutorQA(userPhone, cleanText);
  }

  /**
   * Handler khusus untuk memproses pesan suara / Voice Note (PTT) yang dikirim siswa
   */
  async handleAudioMessage(userPhone: string, audioBase64: string, mimeType: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);

    const subject = this.sessionService.getSubjectById(session.activeSubjectId || '');
    const subjectName = subject ? subject.name : 'Umum';

    // Panggil Gemini Multimodal Audio untuk mendengarkan dan menjawab suara siswa
    const rawExplanation = await this.gemini.explainAudioConcept(subjectName, audioBase64, mimeType, session.chatHistory);
    const { text: cleanExplanation, xpEarned, reason } = GeminiService.parseInteractionEvaluation(rawExplanation);

    // Simpan ke riwayat percakapan
    this.sessionService.appendChatHistory(userPhone, '[Voice Note Siswa]', cleanExplanation);

    let finalResponse = cleanExplanation;
    if (xpEarned > 0) {
      const reward = this.gamification.recordInteractionReward({
        userPhone,
        xpEarned,
        reason: reason || 'Diskusi aktif via voice note',
        subjectName,
      });
      finalResponse += `\n\n✨ _+${xpEarned} XP Belajar Aktif (${reason || 'Voice Note Edukatif'})_`;
      if (reward.levelUp) {
        finalResponse += `\n🎊 *Selamat! Kamu naik ke Level ${reward.newLevel}: ${reward.profile.levelTitle}!*`;
      }
      if (reward.newBadges.length > 0) {
        finalResponse += `\n🎖️ *Medali Baru Terbuka: ${reward.newBadges[0].icon} ${reward.newBadges[0].name}!*`;
      }
    }

    return finalResponse;
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
    const rawExplanation = await this.gemini.explainImageConcept(subjectName, imageBase64, mimeType, caption);
    const { text: cleanExplanation, xpEarned, reason } = GeminiService.parseInteractionEvaluation(rawExplanation);

    let finalResponse = cleanExplanation;
    if (xpEarned > 0) {
      const reward = this.gamification.recordInteractionReward({
        userPhone,
        xpEarned,
        reason: reason || 'Membahas soal tugas dari foto',
        subjectName,
      });
      finalResponse += `\n\n✨ _+${xpEarned} XP Belajar Aktif (${reason || 'Bedah Foto Soal'})_`;
      if (reward.levelUp) {
        finalResponse += `\n🎊 *Selamat! Kamu naik ke Level ${reward.newLevel}: ${reward.profile.levelTitle}!*`;
      }
      if (reward.newBadges.length > 0) {
        finalResponse += `\n🎖️ *Medali Baru Terbuka: ${reward.newBadges[0].icon} ${reward.newBadges[0].name}!*`;
      }
    }

    return finalResponse;
  }

  private findSubjectByQuery(query: string) {
    const q = query.toLowerCase().trim();
    if (!q) return undefined;

    // 1. Cek langsung via ID (misal: "1", "2", "5")
    const byId = this.sessionService.getSubjectById(q);
    if (byId) return byId;

    // 2. Cek kecocokan nama, kode, atau kata kunci umum
    return SessionService.SUBJECTS.find((s) => {
      const sName = s.name.toLowerCase();
      const sCode = s.code.toLowerCase();

      // Cocok langsung kode atau nama
      if (q === sCode || q === sName) return true;

      // Pencocokan kata kunci per mapel
      if (sCode === 'pai' && (/\b(pai|agama|islam|fiqih|akhlak|aqidah|hadis|hadits|qur'?an)\b/i.test(q))) return true;
      if (sCode === 'math' && (/\b(matematika|mtk|math|aljabar|geometri|kalkulus|hitung)\b/i.test(q))) return true;
      if (sCode === 'phys' && (/\b(fisika|physics|ipa|sains|newton|gaya|energi)\b/i.test(q))) return true;
      if (sCode === 'eng' && (/\b(inggris|english|b\.inggris|bahasa inggris|grammar|tenses|vocab)\b/i.test(q))) return true;
      if (sCode === 'hist' && (/\b(sejarah|history|kemerdekaan|kerajaan|pahlawan)\b/i.test(q))) return true;
      if (sCode === 'inf' && (/\b(informatika|komputer|coding|koding|pemrograman|it)\b/i.test(q))) return true;

      return q.includes(sName) || q.includes(sCode);
    });
  }

  private async handleSubjectSelection(userPhone: string, text: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);
    const subject = this.findSubjectByQuery(text);

    if (!subject) {
      return `❌ Mata pelajaran tidak ditemukan. Silakan ketik angka mapel yang sesuai (1 - ${SessionService.SUBJECTS.length}) atau nama pelajarannya:`;
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
    session.chatHistory = []; // Mulai percakapan baru untuk mapel ini
    this.sessionService.updateSession(session);

    let res = `🎉 *Kamu telah memilih Mapel: ${subject.icon} ${subject.name}*\n\n`;
    res += `Sekarang kamu ada di mode *Tutor AI Interaktif (Panduan Belajar)* 💡.\n`;
    res += `Kirimkan pertanyaan, foto soal, atau voice note seputar ${subject.name}.\n`;
    res += `_AI Tutor akan memandu langkah demi langkah dan membantumu memahami materi secara mandiri!_\n\n`;
    res += `💡 _Ketik *KUIS* kapan saja untuk uji kemampuan & kumpulkan XP!_`;
    return res;
  }

  private async handleTutorQA(userPhone: string, text: string): Promise<string> {
    const session = this.sessionService.getSession(userPhone);
    const cleanLower = text.toLowerCase().trim();

    if (cleanLower === 'kuis') {
      const currentSubject = this.sessionService.getSubjectById(session.activeSubjectId || '1');
      const subjectName = currentSubject ? currentSubject.name : 'Umum';
      session.state = 'QUIZ_IN_PROGRESS';
      this.sessionService.updateSession(session);
      return await this.startQuizForSubject(userPhone, subjectName);
    }

    // Cek jika siswa ingin berganti mata pelajaran secara langsung
    const detectedSubject = this.findSubjectByQuery(text);
    const isIntentToSwitch = /\b(mau belajar|ganti|pindah|belajar|pelajaran|mapel|buka)\b/i.test(cleanLower) ||
      (detectedSubject && cleanLower === detectedSubject.code.toLowerCase()) ||
      (detectedSubject && cleanLower === detectedSubject.name.toLowerCase());

    if (detectedSubject && detectedSubject.id !== session.activeSubjectId && isIntentToSwitch) {
      session.activeSubjectId = detectedSubject.id;
      session.chatHistory = []; // Reset riwayat chat agar tidak terkontaminasi mapel lama
      this.sessionService.updateSession(session);

      // Jika hanya deklarasi pindah mapel tanpa soal spesifik
      const pureSubjectDeclaration = cleanLower.replace(/\b(aku|saya|mau|pengen|ingin|belajar|pelajaran|mapel|ganti|ke|pindah|ya|dong)\b/gi, '').trim();
      if (pureSubjectDeclaration.length < 15) {
        let res = `🎉 *Beralih ke Mata Pelajaran: ${detectedSubject.icon} ${detectedSubject.name}*\n\n`;
        res += `Siap! Sekarang kita fokus belajar *${detectedSubject.name}* 💡.\n`;
        res += `Apa materi, bab, atau pertanyaan yang ingin kamu bahas hari ini?`;
        return res;
      }
    }

    const currentSubject = this.sessionService.getSubjectById(session.activeSubjectId || '1');
    const subjectName = currentSubject ? currentSubject.name : 'Umum';

    // Ambil konteks potongan kurikulum sekolah yang relevan menggunakan RAG Engine
    const curriculumContext = this.curriculumService.getRelevantContext(subjectName, text);
    const history = session.chatHistory || [];

    // Tanya AI Gemini untuk menjelaskan materi dengan riwayat percakapan
    const rawExplanation = await this.gemini.explainConcept(subjectName, text, curriculumContext, history);
    const { text: cleanExplanation, xpEarned, reason } = GeminiService.parseInteractionEvaluation(rawExplanation);

    // Simpan riwayat percakapan ke memori permanen (tanpa tag metadata)
    this.sessionService.appendChatHistory(userPhone, text, cleanExplanation);

    let finalResponse = cleanExplanation;
    if (xpEarned > 0) {
      const reward = this.gamification.recordInteractionReward({
        userPhone,
        xpEarned,
        reason: reason || 'Belajar aktif & bernalar',
        subjectName,
      });
      finalResponse += `\n\n✨ _+${xpEarned} XP Belajar Aktif (${reason || 'Interaksi Berkualitas'})_`;
      if (reward.levelUp) {
        finalResponse += `\n🎊 *Selamat! Kamu naik ke Level ${reward.newLevel}: ${reward.profile.levelTitle}!*`;
      }
      if (reward.newBadges.length > 0) {
        finalResponse += `\n🎖️ *Medali Baru Terbuka: ${reward.newBadges[0].icon} ${reward.newBadges[0].name}!*`;
      }
    }

    return finalResponse;
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
      session.state = 'TUTOR_QA';
      session.activeQuiz = undefined;
      this.sessionService.updateSession(session);
      return `Sesi kuis telah berakhir. Kamu kembali ke mode diskusi belajar dengan AI Tutor! 💡 Silakan tanyakan materi apa pun yang ingin kamu pelajari.`;
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

      session.state = 'TUTOR_QA';
      session.activeQuiz = undefined;
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

      summary += `\n` + (finalScore >= 70 ? `🌟 *Luar biasa! Pertahankan proses belajarmu!*` : `💪 *Bagus sekali! Tetap semangat eksplorasi materi bersama AI Tutor!*`);
      summary += `\n\n💡 _Silakan langsung tanyakan materi apa pun ke AI Tutor atau ketik *LEADERBOARD* untuk cek ranking._`;
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
