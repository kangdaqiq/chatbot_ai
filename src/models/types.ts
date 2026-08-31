export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

export type UserState = 
  | 'IDLE' 
  | 'SELECTING_SUBJECT' 
  | 'TUTOR_QA' 
  | 'QUIZ_IN_PROGRESS' 
  | 'TEACHER_MENU';

export interface User {
  id: string;
  phoneNumber: string;
  name: string;
  role: Role;
  className?: string;
  createdAt: Date;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
}

export interface Material {
  id: string;
  subjectId: string;
  title: string;
  content: string;
  pdfUrl?: string;
}

export interface QuizQuestion {
  id: number;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

export interface Quiz {
  id: string;
  subjectId: string;
  title: string;
  questions: QuizQuestion[];
}

export interface ChatMessageHistory {
  role: 'user' | 'model';
  parts: string;
}

export interface UserSession {
  userPhone: string;
  state: UserState;
  activeSubjectId?: string;
  activeQuiz?: Quiz;
  currentQuestionIndex: number;
  score: number;
  userAnswers: Array<{
    questionId: number;
    userChoice: string;
    isCorrect: boolean;
  }>;
  chatHistory?: ChatMessageHistory[];
  lastActiveAt?: string;
}

export interface QuizResult {
  userId: string;
  quizId: string;
  subjectId: string;
  score: number;
  totalQuestions: number;
  completedAt: Date;
}

export interface BadgeInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt?: string;
}

export interface QuizHistoryRecord {
  id: string;
  userPhone: string;
  userName: string;
  subjectId: string;
  subjectName: string;
  score: number;
  totalQuestions: number;
  xpEarned: number;
  completedAt: string;
  userAnswers?: Array<{
    questionId: number;
    userChoice: string;
    isCorrect: boolean;
  }>;
}

export interface StudentGamificationProfile {
  userPhone: string;
  userName: string;
  className?: string;
  totalXp: number;
  level: number;
  levelTitle: string;
  quizzesCompleted: number;
  averageScore: number;
  highestScore: number;
  currentStreak: number;
  lastQuizDate?: string;
  badges: BadgeInfo[];
  updatedAt: string;
}

export interface LeaderboardRow extends StudentGamificationProfile {
  rank: number;
}

