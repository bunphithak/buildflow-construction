import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';
import { JobStatus } from './job.model';
import { PAYMENT_METHODS } from './expense.model';

export type RevenueType = 'CONTRACT' | 'VARIATION' | 'RETENTION' | 'OTHER';
export type RevenueStatus = 'PLANNED' | 'BILLED' | 'RECEIVED' | 'CANCELLED';

export const REVENUE_TYPE_LABELS: Record<RevenueType, string> = {
  CONTRACT: 'งวดตามสัญญา',
  VARIATION: 'งานเพิ่ม / ต่อเติม',
  RETENTION: 'เงินประกันผลงาน',
  OTHER: 'อื่นๆ / เงินเพิ่ม',
};

export const REVENUE_STATUS_LABELS: Record<RevenueStatus, string> = {
  PLANNED: 'ยังไม่ถึง',
  BILLED: 'วางบิลแล้ว',
  RECEIVED: 'รับแล้ว',
  CANCELLED: 'ยกเลิก',
};

export const REVENUE_TYPES: readonly RevenueType[] = [
  'CONTRACT',
  'VARIATION',
  'RETENTION',
  'OTHER',
];

export const REVENUE_STATUSES: readonly RevenueStatus[] = [
  'PLANNED',
  'BILLED',
  'RECEIVED',
  'CANCELLED',
];

export const REVENUE_PAYMENT_METHODS = PAYMENT_METHODS;

export interface Revenue extends Partial<Auditable> {
  id: string;
  revenueId: string;
  jobId: string;
  revenueDate: Timestamp;
  type: RevenueType;
  status: RevenueStatus;
  description: string;
  amount: number;
  paymentMethod?: string;
  documentNo?: string;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface RevenueWriteData {
  jobId: string;
  revenueDate: Date;
  type: RevenueType;
  status: RevenueStatus;
  description: string;
  amount: number;
  paymentMethod?: string;
  documentNo?: string;
  note?: string;
}

export interface RevenueTotals {
  variation: number;
  billed: number;
  received: number;
  outstanding: number;
  planned: number;
}

export function isActiveRevenue(item: Pick<Revenue, 'status'>): boolean {
  return item.status !== 'CANCELLED';
}

export function canCreateJobRevenue(status: JobStatus): boolean {
  return status !== 'CANCELLED';
}

export function isExtraRevenue(item: Pick<Revenue, 'type'>): boolean {
  return item.type === 'VARIATION' || item.type === 'OTHER';
}

export function summarizeRevenues(rows: Revenue[]): RevenueTotals {
  const totals: RevenueTotals = {
    variation: 0,
    billed: 0,
    received: 0,
    outstanding: 0,
    planned: 0,
  };
  for (const row of rows) {
    if (row.status === 'CANCELLED') {
      continue;
    }
    if (isExtraRevenue(row)) {
      totals.variation += row.amount;
    }
    if (row.status === 'RECEIVED') {
      totals.received += row.amount;
      totals.billed += row.amount;
    } else if (row.status === 'BILLED') {
      totals.billed += row.amount;
      totals.outstanding += row.amount;
    } else if (row.status === 'PLANNED') {
      totals.planned += row.amount;
    }
  }
  return totals;
}
