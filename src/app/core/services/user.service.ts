import { computed, inject, Injectable, signal } from '@angular/core';
import { Auth, sendPasswordResetEmail } from '@angular/fire/auth';
import {
  collection,
  collectionData,
  deleteField,
  doc,
  Firestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { FirebaseError, getApps, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { DocumentData } from 'firebase/firestore';
import { map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { COLLECTIONS } from '../constants/collections';
import { AppUser, UserWriteData, normalizeUserRole } from '../models';
import { omitUndefined } from '../utils/form.util';
import {
  isValidUsername,
  isUsernameAuthEmail,
  loginId,
  normalizeUsername,
  toAuthEmail,
} from '../utils/auth-login.util';

const SECONDARY_APP = 'user-admin';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);
  private readonly authService = inject(AuthService);
  private readonly usersRef = collection(this.firestore, COLLECTIONS.users);

  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly totalCount = computed(() => this.users().length);
  readonly adminCount = computed(() => this.users().filter((item) => item.role === 'ADMIN').length);
  readonly managerCount = computed(
    () => this.users().filter((item) => item.role === 'MANAGER').length,
  );
  readonly activeCount = computed(() => this.users().filter((item) => item.isActive).length);

  constructor() {
    collectionData(this.usersRef, { idField: 'uid' })
      .pipe(map((rows) => rows.map((row) => this.mapUser(row))))
      .subscribe({
        next: (users) => {
          this.users.set(users);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (error: unknown) => {
          console.error('Failed to load users', error);
          this.error.set('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
          this.loading.set(false);
        },
      });
  }

  getUserById(uid: string): AppUser | undefined {
    return this.users().find((item) => item.uid === uid);
  }

  async createUser(data: UserWriteData): Promise<string> {
    this.assertAdmin();
    const username = normalizeUsername(data.username);
    const email = toAuthEmail(username);
    const password = data.password?.trim() ?? '';
    if (!password || password.length < 6) {
      throw new Error('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
    }
    this.assertValidProfile(data, username);
    this.assertUniqueLogin(username, email);
    this.assertUniqueEmployee(data.employeeId);

    const secondaryAuth = this.secondaryAuth();
    try {
      const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      const uid = credential.user.uid;
      try {
        await setDoc(
          doc(this.firestore, COLLECTIONS.users, uid),
          omitUndefined({
            email,
            username,
            displayName: data.displayName.trim(),
            role: data.role,
            employeeId: data.employeeId,
            isActive: data.isActive,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        );
        return uid;
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? `${error.message} (สร้างบัญชีล็อกอินแล้ว แต่ยังบันทึกโปรไฟล์ไม่สำเร็จ)`
            : 'สร้างผู้ใช้ไม่สำเร็จ',
        );
      }
    } catch (error) {
      throw new Error(mapUserError(error));
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
    }
  }

  async updateUser(uid: string, data: UserWriteData): Promise<void> {
    this.assertAdmin();
    const current = this.getUserById(uid);
    if (!current) {
      throw new Error('ไม่พบผู้ใช้');
    }
    this.assertValidProfile(data);
    this.assertUniqueEmployee(data.employeeId, uid);
    this.assertLastAdminSafe(uid, data);

    const payload: Record<string, unknown> = omitUndefined({
      displayName: data.displayName.trim(),
      role: data.role,
      isActive: data.isActive,
      updatedAt: serverTimestamp(),
    });
    if (data.employeeId) {
      payload['employeeId'] = data.employeeId;
    } else {
      payload['employeeId'] = deleteField();
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.users, uid), payload as DocumentData);
  }

  canResetPassword(user: AppUser): boolean {
    return !isUsernameAuthEmail(user.email);
  }

  async sendResetPassword(email: string): Promise<void> {
    this.assertAdmin();
    if (isUsernameAuthEmail(email)) {
      throw new Error('บัญชีนี้เข้าด้วยชื่อผู้ใช้ ไม่มีอีเมลสำหรับรีเซ็ตรหัสผ่าน');
    }
    await sendPasswordResetEmail(this.auth, email);
  }

  private assertAdmin(): void {
    if (!this.authService.hasRole(['ADMIN'])) {
      throw new Error('เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการผู้ใช้ได้');
    }
  }

  private assertValidProfile(data: UserWriteData, username?: string): void {
    if (!data.displayName.trim()) {
      throw new Error('กรุณากรอกชื่อที่แสดง');
    }
    if (username !== undefined && !isValidUsername(username)) {
      throw new Error('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, จุด ขีดล่าง หรือขีดกลาง ยาว 3-32 ตัว');
    }
  }

  private assertUniqueLogin(username: string, email: string, excludeUid?: string): void {
    const exists = this.users().some(
      (item) =>
        item.uid !== excludeUid &&
        (loginId(item) === username || item.email.toLowerCase() === email),
    );
    if (exists) {
      throw new Error('ชื่อผู้ใช้นี้มีในระบบแล้ว');
    }
  }

  private assertUniqueEmployee(employeeId: string | undefined, excludeUid?: string): void {
    if (!employeeId) {
      return;
    }
    const exists = this.users().some(
      (item) => item.employeeId === employeeId && item.uid !== excludeUid,
    );
    if (exists) {
      throw new Error('พนักงานคนนี้มีบัญชีผู้ใช้แล้ว');
    }
  }

  private assertLastAdminSafe(uid: string, data: UserWriteData): void {
    const currentUid = this.authService.currentUser()?.uid;
    if (uid === currentUid && !data.isActive) {
      throw new Error('ไม่สามารถปิดใช้งานบัญชีของตัวเองได้');
    }
    const otherActiveAdmins = this.users().filter(
      (item) => item.role === 'ADMIN' && item.isActive && item.uid !== uid,
    );
    const remainsAdmin = data.role === 'ADMIN' && data.isActive;
    if (otherActiveAdmins.length === 0 && !remainsAdmin) {
      throw new Error('ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 คน');
    }
  }

  private secondaryAuth() {
    const existing = getApps().find((app) => app.name === SECONDARY_APP);
    const app = existing ?? initializeApp(environment.firebase, SECONDARY_APP);
    return getAuth(app);
  }

  private mapUser(row: DocumentData): AppUser {
    return {
      uid: String(row['uid'] ?? ''),
      email: String(row['email'] ?? ''),
      username: row['username'] ? String(row['username']) : undefined,
      displayName: String(row['displayName'] ?? row['username'] ?? row['email'] ?? ''),
      role: normalizeUserRole(row['role']),
      employeeId: row['employeeId'] ? String(row['employeeId']) : undefined,
      photoUrl: row['photoUrl'] ? String(row['photoUrl']) : undefined,
      isActive: row['isActive'] !== false,
    };
  }
}

export function mapUserError(error: unknown): string {
  if (error instanceof Error && !('code' in error)) {
    return error.message;
  }
  const code = error instanceof FirebaseError ? error.code : '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'ชื่อผู้ใช้นี้ถูกใช้แล้ว';
    case 'auth/invalid-email':
      return 'ชื่อผู้ใช้ไม่ถูกต้อง';
    case 'auth/weak-password':
      return 'รหัสผ่านง่ายเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร';
    case 'auth/operation-not-allowed':
      return 'ยังไม่ได้เปิด Email/Password ใน Firebase Authentication';
    default:
      return error instanceof Error ? error.message : 'ไม่สามารถบันทึกผู้ใช้ได้';
  }
}
