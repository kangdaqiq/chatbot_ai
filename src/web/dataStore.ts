import fs from 'fs';
import path from 'path';
import { Subject, User } from '../models/types';
import { SessionService } from '../services/session.service';

export class DataStore {
  private dataDir = path.join(process.cwd(), 'data');
  private usersFile = path.join(this.dataDir, 'users.json');
  private subjectsFile = path.join(this.dataDir, 'subjects.json');

  constructor() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    this.initDefaultFiles();
  }

  private initDefaultFiles() {
    if (!fs.existsSync(this.usersFile)) {
      const defaultUsers: User[] = [
        {
          id: 'usr_1',
          name: 'Pak Ahmad (Guru PAI)',
          phoneNumber: '6281234567890',
          role: 'TEACHER',
          className: 'Guru PAI Kelas 10',
          createdAt: new Date(),
        },
        {
          id: 'usr_2',
          name: 'Budi Santoso',
          phoneNumber: '6289876543210',
          role: 'STUDENT',
          className: 'X IPA 1',
          createdAt: new Date(),
        },
      ];
      fs.writeFileSync(this.usersFile, JSON.stringify(defaultUsers, null, 2), 'utf-8');
    }

    if (!fs.existsSync(this.subjectsFile)) {
      fs.writeFileSync(this.subjectsFile, JSON.stringify(SessionService.SUBJECTS, null, 2), 'utf-8');
    } else {
      // Sync SessionService.SUBJECTS with saved subjects
      try {
        const savedSubjects = JSON.parse(fs.readFileSync(this.subjectsFile, 'utf-8')) as Subject[];
        if (Array.isArray(savedSubjects) && savedSubjects.length > 0) {
          SessionService.SUBJECTS.length = 0;
          SessionService.SUBJECTS.push(...savedSubjects);
        }
      } catch (err) {
        console.error('Error loading saved subjects:', err);
      }
    }
  }

  // Users Management
  public getUsers(): User[] {
    try {
      const content = fs.readFileSync(this.usersFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  public isUserRegistered(phoneNumber: string): boolean {
    const users = this.getUsers();
    if (!users || users.length === 0) return true;

    // Jika pengirim menggunakan WhatsApp LID (e.g. 241012257595503@lid)
    if (phoneNumber.endsWith('@lid') || phoneNumber.length > 13) {
      const cleanLid = phoneNumber.replace(/[^0-9]/g, '');
      const isExplicitLid = users.some((u) => u.phoneNumber.includes(cleanLid) || u.phoneNumber.includes(phoneNumber));
      if (isExplicitLid) return true;
      // Otomatis izinkan akun WhatsApp Multi-Device (LID) yang terhubung
      return true;
    }

    const cleanIncoming = phoneNumber.replace(/[^0-9]/g, '');
    if (!cleanIncoming) return false;

    return users.some((u) => {
      const cleanUser = u.phoneNumber.replace(/[^0-9]/g, '');
      if (cleanIncoming === cleanUser) return true;
      if (cleanIncoming.startsWith('62') && cleanUser.startsWith('0')) {
        return cleanIncoming.substring(2) === cleanUser.substring(1);
      }
      if (cleanIncoming.startsWith('0') && cleanUser.startsWith('62')) {
        return cleanIncoming.substring(1) === cleanUser.substring(2);
      }
      return false;
    });
  }

  public addUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...user,
      id: `usr_${Date.now()}`,
      createdAt: new Date(),
    };
    users.push(newUser);
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
    return newUser;
  }

  public deleteUser(id: string): boolean {
    let users = this.getUsers();
    const initialLen = users.length;
    users = users.filter((u) => u.id !== id);
    if (users.length !== initialLen) {
      fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf-8');
      return true;
    }
    return false;
  }

  // Subjects Management
  public getSubjects(): Subject[] {
    return SessionService.SUBJECTS;
  }

  public addSubject(subject: Omit<Subject, 'id'>): Subject {
    const newSubject: Subject = {
      ...subject,
      id: `${SessionService.SUBJECTS.length + 1}`,
    };
    SessionService.SUBJECTS.push(newSubject);
    fs.writeFileSync(this.subjectsFile, JSON.stringify(SessionService.SUBJECTS, null, 2), 'utf-8');
    return newSubject;
  }

  public deleteSubject(id: string): boolean {
    const index = SessionService.SUBJECTS.findIndex((s) => s.id === id);
    if (index !== -1) {
      SessionService.SUBJECTS.splice(index, 1);
      fs.writeFileSync(this.subjectsFile, JSON.stringify(SessionService.SUBJECTS, null, 2), 'utf-8');
      return true;
    }
    return false;
  }
}
