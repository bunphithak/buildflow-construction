import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';

export type JobStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELLED';

export type JobAssignmentStatus = 'ACTIVE' | 'REMOVED';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'แบบร่าง',
  OPEN: 'เปิดงาน',
  IN_PROGRESS: 'กำลังดำเนินการ',
  COMPLETED: 'งานเสร็จ',
  CLOSED: 'ปิดงาน',
  CANCELLED: 'ยกเลิก',
};

export const JOB_ASSIGNMENT_STATUS_LABELS: Record<JobAssignmentStatus, string> = {
  ACTIVE: 'ทำงานอยู่',
  REMOVED: 'นำออกแล้ว',
};

export const JOB_STATUSES: readonly JobStatus[] = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
];

export interface Job extends Partial<Auditable> {
  id: string;
  jobId: string;
  jobCode: string;
  jobName: string;
  customerName: string;
  customerPhone?: string;
  location?: string;
  description?: string;
  contractValue: number;
  estimatedBudget?: number;
  startDate: Date | Timestamp | string;
  expectedEndDate?: Date | Timestamp | string;
  actualEndDate?: Date | Timestamp | string;
  status: JobStatus;
  supervisorId?: string;
  note?: string;
  assignedEmployeeIds: string[];
}

export interface JobWriteData {
  jobCode: string;
  jobName: string;
  customerName: string;
  customerPhone?: string;
  location?: string;
  description?: string;
  contractValue: number;
  estimatedBudget?: number;
  startDate: Date;
  expectedEndDate?: Date;
  status: JobStatus;
  supervisorId?: string;
  note?: string;
}

export interface JobEmployee extends Partial<Auditable> {
  id: string;
  jobId: string;
  employeeId: string;
  assignedDate: Date | Timestamp | string;
  removedDate?: Date | Timestamp | string;
  status: JobAssignmentStatus;
}
