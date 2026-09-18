import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';

export type ExpenseCategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface ExpenseCategory extends Partial<Auditable> {
  id: string;
  code: string;
  name: string;
  status: ExpenseCategoryStatus;
  sortOrder: number;
}

export interface ExpenseCategorySeed {
  code: string;
  name: string;
  sortOrder: number;
}

export const DEFAULT_EXPENSE_CATEGORY_SEEDS: readonly ExpenseCategorySeed[] = [
  { code: 'MAT', name: 'ค่าวัสดุก่อสร้าง', sortOrder: 10 },
  { code: 'SUB', name: 'ค่าแรงผู้รับเหมาช่วง', sortOrder: 20 },
  { code: 'FUEL', name: 'ค่าน้ำมัน', sortOrder: 30 },
  { code: 'MACHINE', name: 'ค่าเครื่องจักร', sortOrder: 40 },
  { code: 'RENT', name: 'ค่าเช่าเครื่องจักร/อุปกรณ์', sortOrder: 50 },
  { code: 'TRANSPORT', name: 'ค่าขนส่ง', sortOrder: 60 },
  { code: 'VEHICLE', name: 'ค่ารถ', sortOrder: 70 },
  { code: 'FOOD', name: 'ค่าอาหาร', sortOrder: 80 },
  { code: 'TOOLS', name: 'ค่าเครื่องมือ', sortOrder: 90 },
  { code: 'SAFETY', name: 'ค่า Safety', sortOrder: 100 },
  { code: 'TRAVEL', name: 'ค่าเดินทาง', sortOrder: 110 },
  { code: 'OTHER', name: 'ค่าใช้จ่ายอื่นๆ', sortOrder: 120 },
];

export const EXPENSE_UNITS: readonly string[] = [
  'ชิ้น',
  'เส้น',
  'แผ่น',
  'ถุง',
  'ก้อน',
  'คิว',
  'ตร.ม.',
  'เมตร',
  'เที่ยว',
  'วัน',
  'ชั่วโมง',
  'งาน',
  'ชุด',
  'ถัง',
  'ลิตร',
  'กิโลกรัม',
];

export const PAYMENT_METHODS: readonly string[] = [
  'เงินสด',
  'โอน',
  'บัตร',
  'เครดิตร้านค้า',
  'อื่นๆ',
];

export interface Expense extends Partial<Auditable> {
  id: string;
  expenseId: string;
  jobId: string;
  expenseDate: Timestamp;
  categoryId: string;
  categoryNameSnapshot: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount: number;
  vendor?: string;
  documentNo?: string;
  receiptUrl?: string;
  receiptStoragePath?: string;
  receiptFileName?: string;
  paymentMethod?: string;
  note?: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface ExpenseWriteData {
  jobId: string;
  expenseDate: Date;
  categoryId: string;
  categoryNameSnapshot: string;
  description: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  amount: number;
  vendor?: string;
  documentNo?: string;
  paymentMethod?: string;
  note?: string;
}

export interface ExpenseCategoryTotal {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  amount: number;
}
