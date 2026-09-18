import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';

export type EmploymentType = 'MONTHLY' | 'DAILY';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  MONTHLY: 'รายเดือน',
  DAILY: 'รายวัน',
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้งาน',
};

export interface Employee extends Partial<Auditable> {
  id: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  address?: string;
  position: string;
  department?: string;
  startDate: Date | Timestamp | string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dailyRate?: number;
  monthlySalary?: number;
  overtimeRate?: number;
  bankName?: string;
  bankAccount?: string;
  profileImageUrl?: string;
  note?: string;
}

export interface EmployeeWriteData {
  employeeCode: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  address?: string;
  position: string;
  department?: string;
  startDate: Date;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dailyRate?: number;
  monthlySalary?: number;
  overtimeRate?: number;
  bankName?: string;
  bankAccount?: string;
  profileImageUrl?: string;
  note?: string;
}
