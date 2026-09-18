import { FirestoreTimestamp } from './common.model';

export type UserRole = 'ADMIN' | 'MANAGER';

export const USER_ROLES: readonly UserRole[] = ['ADMIN', 'MANAGER'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  MANAGER: 'ผู้จัดการ',
};

export const ROLE_MENUS: Record<UserRole, readonly string[]> = {
  ADMIN: [
    'Dashboard',
    'พนักงาน',
    'ลงเวลาทำงาน (เลือกวันได้)',
    'งานก่อสร้าง',
    'ค่าใช้จ่าย',
    'Payroll',
    'สลิปเงินเดือน',
    'รายงาน',
    'ผู้ใช้',
    'ตั้งค่า',
  ],
  MANAGER: ['ลงเวลาทำงาน (วันนี้)', 'ค่าใช้จ่าย'],
};

export function normalizeUserRole(role: unknown): UserRole {
  return role === 'ADMIN' ? 'ADMIN' : 'MANAGER';
}

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

export interface UserWriteData {
  email: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  isActive: boolean;
  password?: string;
}
