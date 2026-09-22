import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Auth,
  authState,
  signInWithEmailAndPassword,
  signOut,
  User,
} from '@angular/fire/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { doc, docData, Firestore, getDoc, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { FirebaseError } from 'firebase/app';
import { filter, map, of, switchMap, take } from 'rxjs';
import { environment } from '../../../environments/environment';
import { COLLECTIONS } from '../constants/collections';
import { AppUser, UserRole, normalizeAssignedJobIds, normalizeUserRole } from '../models';
import { isEmailIdentifier, toAuthEmail } from '../utils/auth-login.util';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly functions = inject(Functions);

  readonly firebaseUser = signal<User | null>(null);
  readonly currentUser = signal<AppUser | null>(null);
  readonly initializing = signal(true);
  readonly authError = signal<string | null>(null);

  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly role = computed(() => this.currentUser()?.role ?? null);
  readonly displayName = computed(
    () => this.currentUser()?.displayName || this.firebaseUser()?.email || 'ผู้ใช้งาน',
  );

  readonly initialized$ = toObservable(this.initializing).pipe(
    filter((loading) => !loading),
    take(1),
    map(() => true),
  );

  constructor() {
    authState(this.auth)
      .pipe(
        switchMap((user) => {
          this.firebaseUser.set(user);
          if (!user) {
            return of(null);
          }
          const userRef = doc(this.firestore, COLLECTIONS.users, user.uid);
          return docData(userRef).pipe(map((profile) => this.mapUserProfile(profile, user)));
        }),
      )
      .subscribe({
        next: (profile) => {
          this.currentUser.set(profile);
          this.initializing.set(false);
        },
        error: () => {
          this.currentUser.set(null);
          this.authError.set('ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
          this.initializing.set(false);
        },
      });
  }

  async login(identifier: string, password: string): Promise<void> {
    this.authError.set(null);
    const raw = identifier.trim();
    const firstEmail = toAuthEmail(raw);
    try {
      await this.signInWithProfile(firstEmail, password);
      return;
    } catch (error) {
      if (!this.shouldLookupUsername(raw, error)) {
        throw new Error(this.mapLoginError(error));
      }
    }

    try {
      const authEmail = await this.lookupAuthEmail(raw);
      if (!authEmail || authEmail.toLowerCase() === firstEmail.toLowerCase()) {
        throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
      await this.signInWithProfile(authEmail, password);
    } catch (error) {
      throw new Error(this.mapLoginError(error));
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.currentUser.set(null);
    this.firebaseUser.set(null);
  }

  hasRole(roles: readonly UserRole[]): boolean {
    const role = this.role();
    return !!role && roles.includes(role);
  }

  canManageJob(jobId: string): boolean {
    if (!jobId) {
      return false;
    }
    if (this.hasRole(['ADMIN'])) {
      return true;
    }
    if (!this.hasRole(['MANAGER'])) {
      return false;
    }
    return (this.currentUser()?.assignedJobIds ?? []).includes(jobId);
  }

  filterManagedJobs<T extends { id: string }>(jobs: readonly T[]): T[] {
    if (this.hasRole(['ADMIN'])) {
      return [...jobs];
    }
    const allowed = new Set(this.currentUser()?.assignedJobIds ?? []);
    return jobs.filter((job) => allowed.has(job.id));
  }

  homePath(): string {
    return this.hasRole(['MANAGER']) ? '/attendance/today' : '/dashboard';
  }

  private async bootstrapFirstAdmin(user: User): Promise<AppUser | null> {
    if (!user.email || !environment.firstAdminEmails.includes(user.email)) {
      return null;
    }
    const payload = {
      email: user.email,
      displayName: user.displayName || user.email,
      role: 'ADMIN' as const,
      isActive: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(doc(this.firestore, COLLECTIONS.users, user.uid), payload);
    return this.mapUserProfile(payload, user);
  }

  private async loadUserProfile(user: User): Promise<AppUser | null> {
    const userRef = doc(this.firestore, COLLECTIONS.users, user.uid);
    const snapshot = await getDoc(userRef);
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapUserProfile(snapshot.data(), user);
  }

  private mapUserProfile(profile: unknown, firebaseUser: User | null): AppUser | null {
    if (!profile || typeof profile !== 'object' || !firebaseUser) {
      return null;
    }

    const data = profile as Partial<AppUser> & { role?: unknown };
    if (!data.email || data.role == null) {
      return null;
    }

    return {
      uid: firebaseUser.uid,
      email: data.email,
      username: data.username || undefined,
      contactEmail: data.contactEmail || undefined,
      displayName: data.displayName || firebaseUser.displayName || firebaseUser.email || '',
      role: normalizeUserRole(data.role),
      employeeId: data.employeeId,
      assignedJobIds: normalizeAssignedJobIds(data.assignedJobIds),
      photoUrl: data.photoUrl,
      isActive: data.isActive !== false,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  private async signInWithProfile(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    let profile = await this.loadUserProfile(credential.user);
    if (!profile) {
      profile = await this.bootstrapFirstAdmin(credential.user);
    }
    if (!profile) {
      await signOut(this.auth);
      throw new Error('NO_PROFILE');
    }
    if (!profile.isActive) {
      await signOut(this.auth);
      throw new Error('INACTIVE');
    }
    this.currentUser.set(profile);
  }

  private shouldLookupUsername(identifier: string, error: unknown): boolean {
    if (isEmailIdentifier(identifier)) {
      return false;
    }
    if (error instanceof Error && (error.message === 'NO_PROFILE' || error.message === 'INACTIVE')) {
      return false;
    }
    const code = error instanceof FirebaseError ? error.code : '';
    return (
      code === 'auth/invalid-credential' ||
      code === 'auth/user-not-found' ||
      code === 'auth/wrong-password' ||
      code === 'auth/invalid-email'
    );
  }

  private async lookupAuthEmail(username: string): Promise<string> {
    const callable = httpsCallable<{ username: string }, { email: string }>(
      this.functions,
      'lookupAuthEmail',
    );
    const result = await callable({ username });
    return String(result.data?.email ?? '').trim().toLowerCase();
  }

  private mapLoginError(error: unknown): string {
    if (error instanceof Error) {
      if (error.message === 'NO_PROFILE') {
        return 'ยังไม่มีสิทธิ์ในระบบ กรุณาติดต่อผู้ดูแลเพื่อสร้างข้อมูลผู้ใช้';
      }
      if (error.message === 'INACTIVE') {
        return 'บัญชีนี้ถูกระงับการใช้งาน';
      }
      if (error.message === 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง') {
        return error.message;
      }
    }

    const code = error instanceof FirebaseError ? error.code : '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
      case 'functions/not-found':
      case 'functions/invalid-argument':
        return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      case 'auth/too-many-requests':
        return 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง';
      case 'permission-denied':
        return 'ยังไม่ได้เผยแพร่กฎ Firestore กรุณา Publish rules ในแท็บ Rules';
      default:
        return 'ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบการตั้งค่า Firebase';
    }
  }
}
