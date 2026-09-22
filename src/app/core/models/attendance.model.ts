import { Timestamp } from '@angular/fire/firestore';
import { EmploymentType } from './employee.model';
import { Auditable } from './common.model';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'HALF_DAY'
  | 'HALF_DAY_MORNING'
  | 'HALF_DAY_AFTERNOON';

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'มาทำงาน',
  ABSENT: 'ขาดงาน',
  LEAVE: 'ลางาน',
  HOLIDAY: 'วันหยุด',
  HALF_DAY: 'ครึ่งวัน',
  HALF_DAY_MORNING: 'ครึ่งวันเช้า',
  HALF_DAY_AFTERNOON: 'ครึ่งวันบ่าย',
};

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  'PRESENT',
  'HALF_DAY_MORNING',
  'HALF_DAY_AFTERNOON',
  'HALF_DAY',
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
];

export const ATTENDANCE_ENTRY_STATUSES: readonly AttendanceStatus[] = [
  'PRESENT',
  'HALF_DAY_MORNING',
  'HALF_DAY_AFTERNOON',
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
];

export function isHalfDayStatus(status: AttendanceStatus): boolean {
  return (
    status === 'HALF_DAY' ||
    status === 'HALF_DAY_MORNING' ||
    status === 'HALF_DAY_AFTERNOON'
  );
}

export function isWorkedAttendanceStatus(status: AttendanceStatus): boolean {
  return status === 'PRESENT' || isHalfDayStatus(status);
}

export function needsAttendanceClock(status: AttendanceStatus): boolean {
  return isWorkedAttendanceStatus(status);
}

export function attendanceEntryStatuses(current?: AttendanceStatus): AttendanceStatus[] {
  if (current === 'HALF_DAY') {
    return [...ATTENDANCE_ENTRY_STATUSES, 'HALF_DAY'];
  }
  return [...ATTENDANCE_ENTRY_STATUSES];
}

export function clockTimesForStatus(
  status: AttendanceStatus,
  defaults: { clockIn: string; clockOut: string; breakMinutes: number },
): { clockIn: string; clockOut: string; breakMinutes: number } | undefined {
  if (status === 'HALF_DAY_MORNING') {
    return { clockIn: defaults.clockIn, clockOut: '12:00', breakMinutes: 0 };
  }
  if (status === 'HALF_DAY_AFTERNOON') {
    return { clockIn: '13:00', clockOut: defaults.clockOut, breakMinutes: 0 };
  }
  if (status === 'PRESENT') {
    return {
      clockIn: defaults.clockIn,
      clockOut: defaults.clockOut,
      breakMinutes: defaults.breakMinutes,
    };
  }
  return undefined;
}

export function otherJobAttendanceState(others: { status: AttendanceStatus }[]): {
  locked: boolean;
  suggestedStatus?: AttendanceStatus;
} {
  if (others.length === 0) {
    return { locked: false };
  }
  const statuses = others.map((item) => item.status);
  if (
    statuses.some(
      (status) =>
        status === 'PRESENT' ||
        status === 'ABSENT' ||
        status === 'LEAVE' ||
        status === 'HOLIDAY' ||
        status === 'HALF_DAY',
    )
  ) {
    return { locked: true };
  }
  const hasMorning = statuses.includes('HALF_DAY_MORNING');
  const hasAfternoon = statuses.includes('HALF_DAY_AFTERNOON');
  if (hasMorning && hasAfternoon) {
    return { locked: true };
  }
  if (hasMorning) {
    return { locked: false, suggestedStatus: 'HALF_DAY_AFTERNOON' };
  }
  if (hasAfternoon) {
    return { locked: false, suggestedStatus: 'HALF_DAY_MORNING' };
  }
  return { locked: true };
}

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
