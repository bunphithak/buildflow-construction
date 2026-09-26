import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';
import { AttendanceStatus, isWorkedAttendanceStatus } from './attendance.model';

export type WorkStoppagePeriod = 'FULL' | 'MORNING' | 'AFTERNOON';
export type WorkStoppageScope = 'JOB' | 'ALL';
export type WorkStoppageReason = 'RAIN' | 'SAFETY' | 'ORDER' | 'OTHER';

export const WORK_STOPPAGE_PERIOD_LABELS: Record<WorkStoppagePeriod, string> = {
  FULL: 'ทั้งวัน',
  MORNING: 'ช่วงเช้า',
  AFTERNOON: 'ช่วงบ่าย',
};

export const WORK_STOPPAGE_REASON_LABELS: Record<WorkStoppageReason, string> = {
  RAIN: 'ฝนตก',
  SAFETY: 'ความปลอดภัย',
  ORDER: 'คำสั่งผู้บริหาร',
  OTHER: 'อื่นๆ',
};

export const WORK_STOPPAGE_REASONS: readonly WorkStoppageReason[] = [
  'RAIN',
  'SAFETY',
  'ORDER',
  'OTHER',
];

export interface WorkStoppage extends Partial<Auditable> {
  id: string;
  workDate: Timestamp;
  scope: WorkStoppageScope;
  jobIds: string[];
  period: WorkStoppagePeriod;
  reason: WorkStoppageReason;
  reasonNote?: string;
  note: string;
  createdBy?: string;
}

export interface WorkStoppageWriteData {
  workDate: Date;
  scope: WorkStoppageScope;
  jobIds: string[];
  period: WorkStoppagePeriod;
  reason: WorkStoppageReason;
  reasonNote?: string;
}

export function workStoppageNote(reason: WorkStoppageReason, reasonNote?: string): string {
  const extra = reasonNote?.trim();
  if (reason === 'OTHER' && extra) {
    return extra;
  }
  return WORK_STOPPAGE_REASON_LABELS[reason];
}

export function displayAttendanceNote(note?: string): string {
  const value = note?.trim();
  if (!value) {
    return '-';
  }
  return value.replace(/^สั่งหยุด\s*·\s*/, '') || '-';
}

export function workStoppageConfirmMessage(input: {
  period: WorkStoppagePeriod;
  scope: WorkStoppageScope;
  reason: WorkStoppageReason;
  reasonNote?: string;
  jobCount: number;
  jobLabel?: string;
}): string {
  const period = WORK_STOPPAGE_PERIOD_LABELS[input.period];
  const where =
    input.scope === 'ALL'
      ? `ทุกไซต์งานที่เปิดอยู่ (${input.jobCount} ไซต์)`
      : input.jobLabel ?? 'ไซต์นี้';
  const reason = workStoppageNote(input.reason, input.reasonNote);
  return `จะสั่งหยุด${period}ที่${where}\nสาเหตุ: ${reason}\n\nพนักงานรายวันจะไม่นับช่วงนี้ ต้องการสั่งหยุดหรือไม่?`;
}

export function workStoppageBanner(item: WorkStoppage, jobId?: string): string | null {
  if (item.scope === 'JOB' && jobId && !item.jobIds.includes(jobId)) {
    return null;
  }
  const period = WORK_STOPPAGE_PERIOD_LABELS[item.period];
  const scope = item.scope === 'ALL' ? 'ทุกไซต์งาน' : 'ไซต์นี้';
  return `สั่งหยุด${period} · ${scope} · ${item.note.replace(/^สั่งหยุด · /, '')}`;
}

export function nextStoppageStatus(
  existing: AttendanceStatus | undefined,
  period: WorkStoppagePeriod,
  overwriteWorked: boolean,
): AttendanceStatus | null {
  if (existing === 'LEAVE') {
    return null;
  }
  const worked = existing ? isWorkedAttendanceStatus(existing) : false;
  if (worked && !overwriteWorked) {
    if (period === 'AFTERNOON' && (existing === 'PRESENT' || existing === 'HALF_DAY')) {
      return 'HALF_DAY_MORNING';
    }
    if (period === 'MORNING' && (existing === 'PRESENT' || existing === 'HALF_DAY')) {
      return 'HALF_DAY_AFTERNOON';
    }
    return null;
  }
  if (worked && overwriteWorked) {
    return 'SITE_CLOSED';
  }
  if (period === 'MORNING') {
    return 'SITE_CLOSED_MORNING';
  }
  if (period === 'AFTERNOON') {
    return 'SITE_CLOSED_AFTERNOON';
  }
  return 'SITE_CLOSED';
}
