import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  Storage,
  uploadBytes,
} from '@angular/fire/storage';
import { DocumentData } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/collections';
import { AuthService } from '../auth/auth.service';
import { Expense, ExpenseCategoryTotal, ExpenseWriteData } from '../models';
import { nextDayBangkok, roundMoney, startOfDayBangkok } from '../utils/datetime.util';
import { canCreateJobExpense } from '../utils/expense.util';
import { omitUndefined } from '../utils/form.util';
import { ExpenseCategoryService } from './expense-category.service';
import { JobService } from './job.service';

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export interface ExpenseFilterTotals {
  total: number;
  material: number;
  fuel: number;
  machine: number;
  other: number;
}

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly authService = inject(AuthService);
  private readonly categoryService = inject(ExpenseCategoryService);
  private readonly jobService = inject(JobService);
  private readonly expensesRef = collection(this.firestore, COLLECTIONS.expenses);

  async getExpenses(): Promise<Expense[]> {
    const snapshot = await getDocs(this.expensesRef);
    return this.sortByDate(snapshot.docs.map((item) => this.mapExpense({ id: item.id, ...item.data() })));
  }

  async getExpenseById(id: string): Promise<Expense | null> {
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.expenses, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapExpense({ id: snapshot.id, ...snapshot.data() });
  }

  async getExpensesByJob(jobId: string): Promise<Expense[]> {
    const snapshot = await getDocs(query(this.expensesRef, where('jobId', '==', jobId)));
    return this.sortByDate(snapshot.docs.map((item) => this.mapExpense({ id: item.id, ...item.data() })));
  }

  async getExpensesByDateRange(startDate: Date, endDate: Date): Promise<Expense[]> {
    const snapshot = await getDocs(
      query(
        this.expensesRef,
        where('expenseDate', '>=', Timestamp.fromDate(startOfDayBangkok(startDate))),
        where('expenseDate', '<', Timestamp.fromDate(nextDayBangkok(endDate))),
      ),
    );
    return this.sortByDate(snapshot.docs.map((item) => this.mapExpense({ id: item.id, ...item.data() })));
  }

  async getExpensesByJobAndDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Expense[]> {
    const snapshot = await getDocs(
      query(
        this.expensesRef,
        where('jobId', '==', jobId),
        where('expenseDate', '>=', Timestamp.fromDate(startOfDayBangkok(startDate))),
        where('expenseDate', '<', Timestamp.fromDate(nextDayBangkok(endDate))),
      ),
    );
    return this.sortByDate(snapshot.docs.map((item) => this.mapExpense({ id: item.id, ...item.data() })));
  }

  async createExpense(data: ExpenseWriteData, receipt?: File): Promise<string> {
    this.validate(data);
    await this.assertJobAllowsCreate(data.jobId);
    if (receipt) {
      this.validateReceipt(receipt);
    }
    const expenseRef = doc(this.expensesRef);
    await setDoc(expenseRef, this.toPayload(data, expenseRef.id, true));
    if (receipt) {
      try {
        await this.uploadReceipt(expenseRef.id, data.jobId, receipt);
      } catch (error) {
        console.error('Expense created but receipt upload failed', error);
        throw new UploadFailedError(expenseRef.id);
      }
    }
    return expenseRef.id;
  }

  async updateExpense(id: string, data: ExpenseWriteData, receipt?: File): Promise<void> {
    this.validate(data);
    if (receipt) {
      this.validateReceipt(receipt);
    }
    const current = await this.getExpenseById(id);
    await updateDoc(
      doc(this.firestore, COLLECTIONS.expenses, id),
      this.toPayload(data, id, false) as DocumentData,
    );
    if (receipt) {
      try {
        await this.uploadReceipt(id, data.jobId, receipt, current?.receiptStoragePath);
      } catch (error) {
        console.error('Expense updated but receipt upload failed', error);
        throw new UploadFailedError(id);
      }
    }
  }

  async deleteExpense(id: string): Promise<void> {
    const current = await this.getExpenseById(id);
    await deleteDoc(doc(this.firestore, COLLECTIONS.expenses, id));
    if (current?.receiptStoragePath) {
      await this.safeDeleteFile(current.receiptStoragePath);
    }
  }

  async removeReceipt(id: string): Promise<void> {
    const current = await this.getExpenseById(id);
    if (!current?.receiptStoragePath && !current?.receiptUrl) {
      return;
    }
    if (current.receiptStoragePath) {
      await this.safeDeleteFile(current.receiptStoragePath);
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.expenses, id), {
      receiptUrl: deleteField(),
      receiptStoragePath: deleteField(),
      receiptFileName: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  async getExpenseTotalByJob(jobId: string): Promise<number> {
    const rows = await this.getExpensesByJob(jobId);
    return roundMoney(rows.reduce((sum, item) => sum + item.amount, 0));
  }

  async getExpenseSummaryByCategory(jobId: string): Promise<ExpenseCategoryTotal[]> {
    const rows = await this.getExpensesByJob(jobId);
    return this.summarizeByCategory(rows);
  }

  summarizeByCategory(rows: Expense[]): ExpenseCategoryTotal[] {
    const map = new Map<string, ExpenseCategoryTotal>();
    for (const row of rows) {
      const category = this.categoryService.getById(row.categoryId);
      const current = map.get(row.categoryId) ?? {
        categoryId: row.categoryId,
        categoryCode: category?.code ?? '',
        categoryName: row.categoryNameSnapshot,
        amount: 0,
      };
      current.amount = roundMoney(current.amount + row.amount);
      map.set(row.categoryId, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  summarizeFilterTotals(rows: Expense[]): ExpenseFilterTotals {
    const result: ExpenseFilterTotals = {
      total: 0,
      material: 0,
      fuel: 0,
      machine: 0,
      other: 0,
    };
    for (const row of rows) {
      result.total += row.amount;
      const code = this.categoryService.getById(row.categoryId)?.code ?? '';
      if (code === 'MAT') {
        result.material += row.amount;
      } else if (code === 'FUEL') {
        result.fuel += row.amount;
      } else if (code === 'MACHINE' || code === 'RENT') {
        result.machine += row.amount;
      } else {
        result.other += row.amount;
      }
    }
    return {
      total: roundMoney(result.total),
      material: roundMoney(result.material),
      fuel: roundMoney(result.fuel),
      machine: roundMoney(result.machine),
      other: roundMoney(result.other),
    };
  }

  validateReceipt(file: File): void {
    if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
      throw new Error('INVALID_FILE_TYPE');
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      throw new Error('FILE_TOO_LARGE');
    }
  }

  isImageReceipt(contentTypeOrName?: string): boolean {
    const value = (contentTypeOrName ?? '').toLowerCase();
    return (
      value.includes('jpeg') ||
      value.includes('jpg') ||
      value.includes('png') ||
      value.includes('webp')
    );
  }

  private async uploadReceipt(
    expenseId: string,
    jobId: string,
    file: File,
    previousPath?: string,
  ): Promise<void> {
    const extension = this.extension(file);
    const storagePath = `jobs/${jobId}/expenses/${expenseId}/receipt-${Date.now()}.${extension}`;
    const storageRef = ref(this.storage, storagePath);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(this.firestore, COLLECTIONS.expenses, expenseId), {
      receiptUrl: url,
      receiptStoragePath: storagePath,
      receiptFileName: file.name,
      updatedAt: serverTimestamp(),
    });
    if (previousPath && previousPath !== storagePath) {
      await this.safeDeleteFile(previousPath);
    }
  }

  private async safeDeleteFile(storagePath: string): Promise<void> {
    try {
      await deleteObject(ref(this.storage, storagePath));
    } catch (error) {
      console.error('Failed to delete receipt file', error);
    }
  }

  private extension(file: File): string {
    if (file.type === 'application/pdf') {
      return 'pdf';
    }
    if (file.type === 'image/png') {
      return 'png';
    }
    if (file.type === 'image/webp') {
      return 'webp';
    }
    return 'jpg';
  }

  private async assertJobAllowsCreate(jobId: string): Promise<void> {
    const job = await this.jobService.getJobById(jobId);
    if (!job || !canCreateJobExpense(job.status)) {
      throw new Error('JOB_LOCKED');
    }
  }

  private validate(data: ExpenseWriteData): void {
    if (!data.jobId || !data.description.trim() || !data.categoryId) {
      throw new Error('INVALID_EXPENSE');
    }
    if (!(data.amount > 0)) {
      throw new Error('INVALID_AMOUNT');
    }
    if (data.quantity !== undefined && data.quantity <= 0) {
      throw new Error('INVALID_QUANTITY');
    }
    if (data.unitPrice !== undefined && data.unitPrice < 0) {
      throw new Error('INVALID_UNIT_PRICE');
    }
  }

  private toPayload(data: ExpenseWriteData, id: string, isCreate: boolean): Record<string, unknown> {
    const actor = this.authService.currentUser()?.uid;
    const payload = omitUndefined({
      expenseId: id,
      jobId: data.jobId,
      expenseDate: Timestamp.fromDate(startOfDayBangkok(data.expenseDate)),
      categoryId: data.categoryId,
      categoryNameSnapshot: data.categoryNameSnapshot.trim(),
      description: data.description.trim(),
      quantity: data.quantity,
      unit: data.unit?.trim(),
      unitPrice: data.unitPrice,
      amount: roundMoney(data.amount),
      vendor: data.vendor?.trim(),
      documentNo: data.documentNo?.trim(),
      paymentMethod: data.paymentMethod,
      note: data.note?.trim(),
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
      payload['createdBy'] = actor;
    }
    return payload;
  }

  private sortByDate(rows: Expense[]): Expense[] {
    return [...rows].sort((a, b) => b.expenseDate.toMillis() - a.expenseDate.toMillis());
  }

  private mapExpense(row: DocumentData): Expense {
    return {
      id: String(row['id'] ?? row['expenseId'] ?? ''),
      expenseId: String(row['expenseId'] ?? row['id'] ?? ''),
      jobId: String(row['jobId'] ?? ''),
      expenseDate:
        row['expenseDate'] instanceof Timestamp ? row['expenseDate'] : Timestamp.fromDate(new Date()),
      categoryId: String(row['categoryId'] ?? row['category'] ?? ''),
      categoryNameSnapshot: String(row['categoryNameSnapshot'] ?? ''),
      description: String(row['description'] ?? ''),
      quantity: typeof row['quantity'] === 'number' ? row['quantity'] : undefined,
      unit: row['unit'] ? String(row['unit']) : undefined,
      unitPrice: typeof row['unitPrice'] === 'number' ? row['unitPrice'] : undefined,
      amount: Number(row['amount'] ?? 0),
      vendor: row['vendor'] ? String(row['vendor']) : undefined,
      documentNo: row['documentNo'] ? String(row['documentNo']) : undefined,
      receiptUrl:
        row['receiptUrl'] || row['receiptImage']
          ? String(row['receiptUrl'] ?? row['receiptImage'])
          : undefined,
      receiptStoragePath: row['receiptStoragePath'] ? String(row['receiptStoragePath']) : undefined,
      receiptFileName: row['receiptFileName'] ? String(row['receiptFileName']) : undefined,
      paymentMethod: row['paymentMethod'] ? String(row['paymentMethod']) : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      updatedBy: row['updatedBy'] ? String(row['updatedBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }
}

export class UploadFailedError extends Error {
  readonly expenseId: string;

  constructor(expenseId: string) {
    super('UPLOAD_FAILED');
    this.name = 'UploadFailedError';
    this.expenseId = expenseId;
  }
}

export function mapExpenseError(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case 'UPLOAD_FAILED':
        return 'บันทึกข้อมูลแล้ว แต่แนบไฟล์ไม่สำเร็จ';
      case 'INVALID_FILE_TYPE':
        return 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF';
      case 'FILE_TOO_LARGE':
        return 'ขนาดไฟล์ต้องไม่เกิน 10 MB';
      case 'INVALID_AMOUNT':
        return 'ยอดเงินต้องมากกว่า 0';
      case 'INVALID_QUANTITY':
        return 'จำนวนต้องมากกว่า 0';
      case 'DUPLICATE_CATEGORY':
        return 'รหัสหมวดนี้มีอยู่ในระบบแล้ว';
      case 'JOB_LOCKED':
        return 'ไม่สามารถเพิ่มค่าใช้จ่ายในงานที่ปิดหรือยกเลิกแล้ว';
      default:
        break;
    }
  }
  console.error('Expense operation failed', error);
  return 'ไม่สามารถบันทึกค่าใช้จ่ายได้';
}
