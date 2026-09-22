import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
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
import { DocumentData } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/collections';
import { AuthService } from '../auth/auth.service';
import { AdvanceStatus, EmployeeAdvance, EmployeeAdvanceWriteData } from '../models';
import { omitUndefined } from '../utils/form.util';
import { startOfDayBangkok } from '../utils/datetime.util';
import { BusyService } from './busy.service';

@Injectable({
  providedIn: 'root',
})
export class AdvanceService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly advancesRef = collection(this.firestore, COLLECTIONS.employeeAdvances);
  private readonly busy = inject(BusyService);

  constructor() {
    this.busy.guard(this, ['createAdvance', 'updateAdvance', 'cancelAdvance', 'deleteAdvance']);
  }

  async getAdvances(): Promise<EmployeeAdvance[]> {
    const snapshot = await getDocs(this.advancesRef);
    return this.sort(snapshot.docs.map((item) => this.mapAdvance({ id: item.id, ...item.data() })));
  }

  async getAdvanceById(id: string): Promise<EmployeeAdvance | null> {
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.employeeAdvances, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapAdvance({ id: snapshot.id, ...snapshot.data() });
  }

  async getAdvancesByEmployee(employeeId: string): Promise<EmployeeAdvance[]> {
    const snapshot = await getDocs(
      query(this.advancesRef, where('employeeId', '==', employeeId)),
    );
    return this.sort(snapshot.docs.map((item) => this.mapAdvance({ id: item.id, ...item.data() })));
  }

  async getPendingByEmployee(employeeId: string): Promise<EmployeeAdvance[]> {
    const snapshot = await getDocs(
      query(
        this.advancesRef,
        where('employeeId', '==', employeeId),
        where('status', '==', 'PENDING'),
      ),
    );
    return this.sort(snapshot.docs.map((item) => this.mapAdvance({ id: item.id, ...item.data() })));
  }

  async getPendingAdvances(): Promise<EmployeeAdvance[]> {
    const snapshot = await getDocs(query(this.advancesRef, where('status', '==', 'PENDING')));
    return this.sort(snapshot.docs.map((item) => this.mapAdvance({ id: item.id, ...item.data() })));
  }

  async createAdvance(data: EmployeeAdvanceWriteData): Promise<string> {
    if (!(data.amount > 0) || !data.employeeId) {
      throw new Error('INVALID_ADVANCE');
    }
    const ref = doc(this.advancesRef);
    const actor = this.authService.currentUser()?.uid;
    await setDoc(ref, omitUndefined({
      employeeId: data.employeeId,
      advanceDate: Timestamp.fromDate(startOfDayBangkok(data.advanceDate)),
      amount: data.amount,
      description: data.description?.trim(),
      note: data.note?.trim(),
      status: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: actor,
      updatedBy: actor,
    }));
    return ref.id;
  }

  async updateAdvance(id: string, data: EmployeeAdvanceWriteData): Promise<void> {
    const current = await this.getAdvanceById(id);
    if (!current || current.status !== 'PENDING') {
      throw new Error('ADVANCE_LOCKED');
    }
    if (!(data.amount > 0)) {
      throw new Error('INVALID_ADVANCE');
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.employeeAdvances, id), omitUndefined({
      employeeId: data.employeeId,
      advanceDate: Timestamp.fromDate(startOfDayBangkok(data.advanceDate)),
      amount: data.amount,
      description: data.description?.trim(),
      note: data.note?.trim(),
      updatedAt: serverTimestamp(),
      updatedBy: this.authService.currentUser()?.uid,
    }) as DocumentData);
  }

  async cancelAdvance(id: string): Promise<void> {
    const current = await this.getAdvanceById(id);
    if (!current || current.status === 'DEDUCTED') {
      throw new Error('ADVANCE_LOCKED');
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.employeeAdvances, id), {
      status: 'CANCELLED' satisfies AdvanceStatus,
      updatedAt: serverTimestamp(),
      updatedBy: this.authService.currentUser()?.uid,
    });
  }

  async deleteAdvance(id: string): Promise<void> {
    const current = await this.getAdvanceById(id);
    if (!current || current.status === 'DEDUCTED') {
      throw new Error('ADVANCE_LOCKED');
    }
    await deleteDoc(doc(this.firestore, COLLECTIONS.employeeAdvances, id));
  }

  private sort(rows: EmployeeAdvance[]): EmployeeAdvance[] {
    return [...rows].sort((a, b) => b.advanceDate.toMillis() - a.advanceDate.toMillis());
  }

  private mapAdvance(row: DocumentData): EmployeeAdvance {
    const status = row['status'];
    return {
      id: String(row['id'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      advanceDate:
        row['advanceDate'] instanceof Timestamp
          ? row['advanceDate']
          : Timestamp.fromDate(new Date()),
      amount: Number(row['amount'] ?? 0),
      description: row['description'] ? String(row['description']) : undefined,
      status: status === 'DEDUCTED' || status === 'CANCELLED' ? status : 'PENDING',
      payrollId: row['payrollId'] ? String(row['payrollId']) : undefined,
      sourcePayrollId: row['sourcePayrollId'] ? String(row['sourcePayrollId']) : undefined,
      deductedAt: row['deductedAt'] instanceof Timestamp ? row['deductedAt'] : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      updatedBy: row['updatedBy'] ? String(row['updatedBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }
}

export function mapAdvanceError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'INVALID_ADVANCE') {
      return 'กรุณากรอกพนักงานและจำนวนเงินที่มากกว่า 0';
    }
    if (error.message === 'ADVANCE_LOCKED') {
      return 'ไม่สามารถแก้เงินเบิกที่หักแล้วหรือถูกใช้ใน Payroll ที่อนุมัติแล้ว';
    }
  }
  console.error('Advance operation failed', error);
  return 'ไม่สามารถบันทึกเงินเบิกได้';
}
