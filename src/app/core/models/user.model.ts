import { FirestoreTimestamp } from './common.model';

export type UserRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'MANAGER', 'EMPLOYEE'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  MANAGER: 'ผู้จัดการ',
  EMPLOYEE: 'พนักงาน',
};

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  photoUrl?: string;
  isActive: boolean;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}
