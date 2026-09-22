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

export function normalizeAssignedJobIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
}

export interface AppUser {
  uid: string;
  email: string;
  username?: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  assignedJobIds: string[];
  photoUrl?: string;
  isActive: boolean;
  createdAt?: FirestoreTimestamp;
  updatedAt?: FirestoreTimestamp;
}

export interface UserWriteData {
  username: string;
  displayName: string;
  role: UserRole;
  employeeId?: string;
  assignedJobIds: string[];
  isActive: boolean;
  password?: string;
}
