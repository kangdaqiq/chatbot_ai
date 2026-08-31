import fs from 'fs';
import path from 'path';
import {
  StudentGamificationProfile,
  QuizHistoryRecord,
  BadgeInfo,
  LeaderboardRow,
} from '../models/types';

export class GamificationService {
  private dataDir = path.join(process.cwd(), 'data');
  private gamificationFile = path.join(this.dataDir, 'gamification.json');
  private quizResultsFile = path.join(this.dataDir, 'quiz_results.json');

  private profiles: Map<string, StudentGamificationProfile> = new Map();
  private quizHistory: QuizHistoryRecord[] = [];

  // Definisi Badge / Medali yang bisa didapatkan siswa
  public static readonly AVAILABLE_BADGES: BadgeInfo[] = [
    {
      id: 'first_quiz',
      name: 'Langkah Pertama',
      description: 'Menyelesaikan kuis pertama dengan sukses',
      icon: '🎯',
    },
    {
      id: 'perfect_100',
      name: 'Nilai Sempurna',
      description: 'Meraih skor sempurna 100 pada kuis',
      icon: '💯',
    },
    {
      id: 'streak_3',
      name: 'Rajin Belajar',
      description: 'Menyelesaikan kuis 3 hari berturut-turut',
      icon: '🔥',
    },
    {
      id: 'streak_7',
      name: 'Juara Konsisten',
      description: 'Menyelesaikan kuis 7 hari berturut-turut',
      icon: '⚡',
    },
    {
      id: 'quiz_master_5',
      name: 'Kolektor Kuis',
      description: 'Menyelesaikan total 5 kuis pembelajaran',
      icon: '🌟',
    },
    {
      id: 'quiz_master_10',
      name: 'Master Kuis',
      description: 'Menyelesaikan total 10 kuis pembelajaran',
      icon: '👑',
    },
    {
      id: 'high_scholar',
      name: 'Cendekiawan Sejati',
      description: 'Rata-rata nilai di atas 90 setelah minimal 3 kuis',
      icon: '🎓',
    },
    {
      id: 'active_questioner',
      name: 'Penanya Kritis',
      description: 'Aktif bertanya dan mendiskusikan materi pelajaran secara mendalam',
      icon: '💡',
    },
    {
      id: 'deep_thinker',
      name: 'Pemikir Hebat',
      description: 'Menunjukkan penalaran kritis dan memecahkan bimbingan soal secara mandiri',
      icon: '🧠',
    },
    {
      id: 'study_enthusiast',
      name: 'Siswa Teladan',
      description: 'Mengumpulkan lebih dari 100 XP dari interaksi belajar aktif',
      icon: '🏆',
    },
  ];

  constructor() {
    this.initDataDir();
    this.loadData();
  }

  private initDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.gamificationFile)) {
        const content = fs.readFileSync(this.gamificationFile, 'utf-8');
        const list = JSON.parse(content) as StudentGamificationProfile[];
        this.profiles.clear();
        for (const p of list) {
          this.profiles.set(p.userPhone, p);
        }
      }
    } catch (err) {
      console.error('❌ Gagal memuat data gamifikasi:', err);
    }

    try {
      if (fs.existsSync(this.quizResultsFile)) {
        const content = fs.readFileSync(this.quizResultsFile, 'utf-8');
        this.quizHistory = JSON.parse(content) as QuizHistoryRecord[];
      }
    } catch (err) {
      console.error('❌ Gagal memuat data riwayat kuis:', err);
    }
  }

  private saveData(): void {
    try {
      const profileList = Array.from(this.profiles.values());
      fs.writeFileSync(this.gamificationFile, JSON.stringify(profileList, null, 2), 'utf-8');
      fs.writeFileSync(this.quizResultsFile, JSON.stringify(this.quizHistory, null, 2), 'utf-8');
    } catch (err) {
      console.error('❌ Gagal menyimpan data gamifikasi:', err);
    }
  }

  /**
   * Menghitung Level dan Gelar berdasarkan total XP
   */
  public static calculateLevel(xp: number): { level: number; title: string; nextLevelXp: number; currentLevelMinXp: number } {
    const levels = [
      { minXp: 0, level: 1, title: 'Siswa Pemula 🐣' },
      { minXp: 100, level: 2, title: 'Penuntut Ilmu 📖' },
      { minXp: 250, level: 3, title: 'Siswa Aktif 🚀' },
      { minXp: 500, level: 4, title: 'Cendekiawan Muda 🧠' },
      { minXp: 900, level: 5, title: 'Master Kuis 🌟' },
      { minXp: 1400, level: 6, title: 'Juara Kelas 🏆' },
      { minXp: 2000, level: 7, title: 'Legenda Sains & Ilmu 👑' },
      { minXp: 3000, level: 8, title: 'Grandmaster Akademi 🌌' },
    ];

    let current = levels[0];
    let nextMin = levels[1].minXp;

    for (let i = 0; i < levels.length; i++) {
      if (xp >= levels[i].minXp) {
        current = levels[i];
        nextMin = levels[i + 1] ? levels[i + 1].minXp : current.minXp + 1500;
      } else {
        break;
      }
    }

    return {
      level: current.level,
      title: current.title,
      currentLevelMinXp: current.minXp,
      nextLevelXp: nextMin,
    };
  }

  /**
   * Mengambil atau membuat profil baru untuk pengguna
   */
  public getOrCreateProfile(userPhone: string, userName: string = 'Siswa', className: string = ''): StudentGamificationProfile {
    let profile = this.profiles.get(userPhone);
    if (!profile) {
      profile = {
        userPhone,
        userName,
        className,
        totalXp: 0,
        level: 1,
        levelTitle: 'Siswa Pemula 🐣',
        quizzesCompleted: 0,
        averageScore: 0,
        highestScore: 0,
        currentStreak: 0,
        badges: [],
        updatedAt: new Date().toISOString(),
      };
      this.profiles.set(userPhone, profile);
      this.saveData();
    } else {
      if (userName && profile.userName !== userName && userName !== 'Siswa') {
        profile.userName = userName;
      }
      if (className && !profile.className) {
        profile.className = className;
      }
    }
    return profile;
  }

  /**
   * Mencatat hasil kuis dan mengupdate XP, streak, level, serta badge
   */
  public recordQuizAttempt(params: {
    userPhone: string;
    userName: string;
    className?: string;
    subjectId: string;
    subjectName: string;
    score: number;
    totalQuestions: number;
    userAnswers?: Array<{ questionId: number; userChoice: string; isCorrect: boolean }>;
  }): {
    xpEarned: number;
    streakBonus: number;
    profile: StudentGamificationProfile;
    levelUp: boolean;
    oldLevel: number;
    newLevel: number;
    newBadges: BadgeInfo[];
    rank: number;
  } {
    const { userPhone, userName, className, subjectId, subjectName, score, totalQuestions, userAnswers } = params;

    const profile = this.getOrCreateProfile(userPhone, userName, className || '');
    const oldLevel = profile.level;

    // 1. Hitung Streak Harian
    const today = new Date().toISOString().split('T')[0];
    let streakBonus = 0;
    if (profile.lastQuizDate) {
      const lastDate = profile.lastQuizDate.split('T')[0];
      const diffDays = Math.round((new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 3600 * 24));

      if (diffDays === 1) {
        profile.currentStreak += 1;
      } else if (diffDays > 1) {
        profile.currentStreak = 1;
      }
      // Jika diffDays === 0 (hari yang sama), streak tidak berubah
    } else {
      profile.currentStreak = 1;
    }
    profile.lastQuizDate = new Date().toISOString();

    // Bonus streak (jika streak >= 3 hari, dapat bonus 25 XP)
    if (profile.currentStreak >= 3) {
      streakBonus = 25;
    }

    // 2. Hitung Perolehan XP:
    // Base XP: 30 + (skor * 0.7) -> Skor 100 = 100 XP, Skor 67 = 77 XP
    const baseQuizXp = Math.round(30 + (score * 0.7));
    const xpEarned = baseQuizXp + streakBonus;

    profile.totalXp += xpEarned;
    profile.quizzesCompleted += 1;

    // Update Skor Statistik
    const currentTotalScore = (profile.averageScore * (profile.quizzesCompleted - 1)) + score;
    profile.averageScore = Math.round(currentTotalScore / profile.quizzesCompleted);
    if (score > profile.highestScore) {
      profile.highestScore = score;
    }

    // 3. Cek Level Baru
    const levelInfo = GamificationService.calculateLevel(profile.totalXp);
    const levelUp = levelInfo.level > oldLevel;
    profile.level = levelInfo.level;
    profile.levelTitle = levelInfo.title;

    // 4. Evaluasi Badges Baru
    const newBadges: BadgeInfo[] = [];
    const existingBadgeIds = new Set(profile.badges.map((b) => b.id));

    // Badge: First Quiz
    if (!existingBadgeIds.has('first_quiz') && profile.quizzesCompleted >= 1) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'first_quiz')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: Perfect 100
    if (!existingBadgeIds.has('perfect_100') && score === 100) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'perfect_100')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: Streak 3 Hari
    if (!existingBadgeIds.has('streak_3') && profile.currentStreak >= 3) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'streak_3')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: Streak 7 Hari
    if (!existingBadgeIds.has('streak_7') && profile.currentStreak >= 7) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'streak_7')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: 5 Kuis
    if (!existingBadgeIds.has('quiz_master_5') && profile.quizzesCompleted >= 5) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'quiz_master_5')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: 10 Kuis
    if (!existingBadgeIds.has('quiz_master_10') && profile.quizzesCompleted >= 10) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'quiz_master_10')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    // Badge: Cendekiawan Sejati (Rata-rata >= 90 & minimal 3 kuis)
    if (!existingBadgeIds.has('high_scholar') && profile.quizzesCompleted >= 3 && profile.averageScore >= 90) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'high_scholar')!;
      profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
      newBadges.push(b);
    }

    profile.updatedAt = new Date().toISOString();

    // 5. Simpan Riwayat Kuis
    const historyRecord: QuizHistoryRecord = {
      id: `quiz_rec_${Date.now()}`,
      userPhone,
      userName: profile.userName,
      subjectId,
      subjectName,
      score,
      totalQuestions,
      xpEarned,
      completedAt: new Date().toISOString(),
      userAnswers,
    };
    this.quizHistory.unshift(historyRecord);

    // Batasi histori hingga 1000 record terakhir
    if (this.quizHistory.length > 1000) {
      this.quizHistory = this.quizHistory.slice(0, 1000);
    }

    this.saveData();

    // 6. Hitung Rank saat ini
    const rank = this.getUserRank(userPhone);

    return {
      xpEarned,
      streakBonus,
      profile,
      levelUp,
      oldLevel,
      newLevel: profile.level,
      newBadges,
      rank,
    };
  }

  /**
   * Memberikan poin XP untuk interaksi belajar berkualitas (bukan sekadar main-main)
   */
  public recordInteractionReward(params: {
    userPhone: string;
    userName?: string;
    className?: string;
    xpEarned: number;
    reason: string;
    subjectName: string;
  }): {
    xpEarned: number;
    profile: StudentGamificationProfile;
    levelUp: boolean;
    oldLevel: number;
    newLevel: number;
    newBadges: BadgeInfo[];
    rank: number;
  } {
    const { userPhone, userName, className, xpEarned, reason, subjectName } = params;
    const profile = this.getOrCreateProfile(userPhone, userName || 'Siswa', className || '');
    const oldLevel = profile.level;

    profile.interactionXp = (profile.interactionXp || 0) + xpEarned;
    profile.activeLearningCount = (profile.activeLearningCount || 0) + 1;
    profile.totalXp += xpEarned;
    profile.lastInteractionDate = new Date().toISOString();
    profile.updatedAt = new Date().toISOString();

    // Evaluasi kenaikan level
    const levelInfo = GamificationService.calculateLevel(profile.totalXp);
    const levelUp = levelInfo.level > oldLevel;
    profile.level = levelInfo.level;
    profile.levelTitle = levelInfo.title;

    // Evaluasi Medali Baru terkait interaksi
    const newBadges: BadgeInfo[] = [];
    const existingBadgeIds = new Set(profile.badges.map((b) => b.id));

    if (!existingBadgeIds.has('active_questioner') && (profile.activeLearningCount || 0) >= 3) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'active_questioner');
      if (b) {
        profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
        newBadges.push(b);
      }
    }

    if (!existingBadgeIds.has('deep_thinker') && xpEarned >= 10) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'deep_thinker');
      if (b) {
        profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
        newBadges.push(b);
      }
    }

    if (!existingBadgeIds.has('study_enthusiast') && (profile.interactionXp || 0) >= 100) {
      const b = GamificationService.AVAILABLE_BADGES.find((x) => x.id === 'study_enthusiast');
      if (b) {
        profile.badges.push({ ...b, unlockedAt: new Date().toISOString() });
        newBadges.push(b);
      }
    }

    this.saveData();
    const rank = this.getUserRank(userPhone);

    return {
      xpEarned,
      profile,
      levelUp,
      oldLevel,
      newLevel: profile.level,
      newBadges,
      rank,
    };
  }

  /**
   * Mendapatkan Papan Peringkat (Leaderboard) terurut dari XP tertinggi
   */
  public getLeaderboard(limit = 100): LeaderboardRow[] {
    const list = Array.from(this.profiles.values());
    list.sort((a, b) => {
      if (b.totalXp !== a.totalXp) {
        return b.totalXp - a.totalXp;
      }
      return b.averageScore - a.averageScore;
    });

    return list.slice(0, limit).map((p, idx) => ({
      ...p,
      rank: idx + 1,
    }));
  }

  /**
   * Mendapatkan Rank spesifik untuk satu pengguna
   */
  public getUserRank(userPhone: string): number {
    const leaderboard = this.getLeaderboard();
    const found = leaderboard.find((r) => r.userPhone === userPhone);
    return found ? found.rank : leaderboard.length + 1;
  }

  /**
   * Mendapatkan profil lengkap pengguna beserta detail ranking & progress bar
   */
  public getUserProfile(userPhone: string): { profile: StudentGamificationProfile; rank: number; levelInfo: any } | null {
    const profile = this.profiles.get(userPhone);
    if (!profile) return null;

    const rank = this.getUserRank(userPhone);
    const levelInfo = GamificationService.calculateLevel(profile.totalXp);

    return { profile, rank, levelInfo };
  }

  /**
   * Mendapatkan riwayat pengerjaan kuis
   */
  public getQuizHistory(limit = 100): QuizHistoryRecord[] {
    return this.quizHistory.slice(0, limit);
  }

  /**
   * Menghasilkan teks CSV rekapitulasi nilai dan XP siswa untuk diunduh Guru
   */
  public exportResultsToCSV(): string {
    const leaderboard = this.getLeaderboard();
    const headers = [
      'Peringkat',
      'Nama Siswa',
      'Nomor WhatsApp',
      'Kelas',
      'Level',
      'Gelar',
      'Total XP',
      'Jumlah Kuis Selesai',
      'Rata-rata Nilai',
      'Nilai Tertinggi',
      'Streak Hari Ini',
      'Daftar Medali/Badges',
      'Terakhir Aktif',
    ];

    const rows = leaderboard.map((row) => {
      const badgesStr = row.badges.map((b) => `${b.icon} ${b.name}`).join(' | ');
      const cleanPhone = `'${row.userPhone}`;
      const lastActive = row.lastQuizDate ? new Date(row.lastQuizDate).toLocaleString('id-ID') : '-';

      return [
        row.rank,
        `"${row.userName.replace(/"/g, '""')}"`,
        cleanPhone,
        `"${(row.className || '-').replace(/"/g, '""')}"`,
        row.level,
        `"${row.levelTitle.replace(/"/g, '""')}"`,
        row.totalXp,
        row.quizzesCompleted,
        row.averageScore,
        row.highestScore,
        `${row.currentStreak} Hari`,
        `"${badgesStr.replace(/"/g, '""')}"`,
        `"${lastActive}"`,
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Reset data leaderboard (Opsional untuk testing/semester baru)
   */
  public resetLeaderboard(): void {
    this.profiles.clear();
    this.quizHistory = [];
    this.saveData();
  }
}
