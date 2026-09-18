import { Timestamp } from '@angular/fire/firestore';
import { EmploymentType } from './employee.model';
import { Auditable } from './common.model';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'HALF_DAY';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'มาทำงาน',
  ABSENT: 'ขาดงาน',
  LEAVE: 'ลางาน',
  HOLIDAY: 'วันหยุด',
  HALF_DAY: 'ครึ่งวัน',
};

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
  'HALF_DAY',
];

export interface Attendance extends Partial<Auditable> {
  id: string;
  attendanceId: string;
  employeeId: string;
  jobId: string;
  workDate: Timestamp;
  clockIn?: Timestamp;
  clockOut?: Timestamp;
  breakMinutes: number;
  normalHours: number;
  overtimeHours: number;
  status: AttendanceStatus;
  employmentTypeSnapshot: EmploymentType;
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
  regularLaborCost: number;
  overtimeCost: number;
  totalLaborCost: number;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface AttendanceWriteData {
  employeeId: string;
  jobId: string;
  workDate: Date;
  clockIn?: Date;
  clockOut?: Date;
  breakMinutes: number;
  overtimeHours: number;
  status: AttendanceStatus;
  employmentTypeSnapshot: EmploymentType;
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
  note?: string;
}

export interface AttendanceLaborRow {
  employeeId: string;
  employeeName: string;
  employmentType: EmploymentType;
  recordCount: number;
  presentDays: number;
  normalHours: number;
  overtimeHours: number;
  regularLaborCost: number;
  overtimeCost: number;
  totalLaborCost: number;
}

export interface AttendanceSettings {
  defaultClockIn: string;
  defaultClockOut: string;
  defaultBreakMinutes: number;
  monthlyWorkingDays: number;
  paidHolidayEnabled: boolean;
}
