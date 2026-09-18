import { Timestamp } from '@angular/fire/firestore';
import { EmploymentType } from './employee.model';
import { Auditable } from './common.model';

export interface PayrollPeriod {
  year: number;
  month: number;
}

export type PayrollStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'CANCELLED';
export type AdvanceStatus = 'PENDING' | 'DEDUCTED' | 'CANCELLED';
export type PayrollAdjustmentType = 'INCOME' | 'DEDUCTION';

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  DRAFT: 'แบบร่าง',
  CALCULATED: 'คำนวณแล้ว',
  APPROVED: 'อนุมัติแล้ว',
  PAID: 'จ่ายแล้ว',
  CANCELLED: 'ยกเลิก',
};

export const PAYROLL_STATUSES: readonly PayrollStatus[] = [
  'DRAFT',
  'CALCULATED',
  'APPROVED',
  'PAID',
  'CANCELLED',
];

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  PENDING: 'รอหัก',
  DEDUCTED: 'หักแล้ว',
  CANCELLED: 'ยกเลิก',
};

export const INCOME_CATEGORIES: readonly string[] = [
  'โบนัส',
  'ค่าเดินทาง',
  'ค่าอาหาร',
  'ค่าตำแหน่ง',
  'ค่าโทรศัพท์',
  'เงินเพิ่ม',
  'อื่นๆ',
];

export const DEDUCTION_CATEGORIES: readonly string[] = [
  'เงินเบิก',
  'ขาดงาน',
  'หักอุปกรณ์',
  'หักค่าเสียหาย',
  'หักอื่นๆ',
];

export interface Payroll extends Partial<Auditable> {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  periodStart?: Timestamp;
  periodEnd?: Timestamp;
  payDate?: Timestamp;
  periodKey?: string;
  employmentTypeSnapshot: EmploymentType;
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
  totalWorkDays: number;
  totalHalfDays: number;
  totalAbsentDays: number;
  totalLeaveDays: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  basePay: number;
  overtimePay: number;
  additionalIncome: number;
  bonus: number;
  totalIncome: number;
  advanceDeduction: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
  status: PayrollStatus;
  selectedAdvanceIds: string[];
  note?: string;
  calculatedAt?: Timestamp;
  approvedAt?: Timestamp;
  paidAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
}

export interface PayrollAdjustment extends Partial<Auditable> {
  id: string;
  payrollId: string;
  employeeId: string;
  type: PayrollAdjustmentType;
  category: string;
  description: string;
  amount: number;
  createdBy?: string;
}

export interface EmployeeAdvance extends Partial<Auditable> {
  id: string;
  employeeId: string;
  advanceDate: Timestamp;
  amount: number;
  description?: string;
  status: AdvanceStatus;
  payrollId?: string;
  deductedAt?: Timestamp;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface EmployeeAdvanceWriteData {
  employeeId: string;
  advanceDate: Date;
  amount: number;
  description?: string;
  note?: string;
}

export interface PayrollAdjustmentWriteData {
  payrollId: string;
  employeeId: string;
  type: PayrollAdjustmentType;
  category: string;
  description: string;
  amount: number;
}

export interface Payslip {
  payrollId: string;
  employeeId: string;
  year: number;
  month: number;
}

export interface CompanySettings {
  companyName: string;
  address?: string;
  phone?: string;
  taxId?: string;
  logoUrl?: string;
  monthlyAbsenceDeductionEnabled: boolean;
}

export interface PayrollTotals {
  additionalIncome: number;
  bonus: number;
  totalIncome: number;
  advanceDeduction: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
}

export interface PayrollAttendanceSummary {
  totalWorkDays: number;
  totalHalfDays: number;
  totalAbsentDays: number;
  totalLeaveDays: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  basePay: number;
  overtimePay: number;
}
