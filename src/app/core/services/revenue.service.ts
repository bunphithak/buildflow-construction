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
import { AuthService } from '../auth/auth.service';
import { COLLECTIONS } from '../constants/collections';
import {
  canCreateJobRevenue,
  Revenue,
  RevenueStatus,
  RevenueType,
  RevenueWriteData,
} from '../models';
import { nextDayBangkok, startOfDayBangkok } from '../utils/datetime.util';
import { omitUndefined } from '../utils/form.util';
import { BusyService } from './busy.service';
import { JobService } from './job.service';

@Injectable({
  providedIn: 'root',
})
export class RevenueService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly jobService = inject(JobService);
  private readonly busy = inject(BusyService);
  private readonly revenuesRef = collection(this.firestore, COLLECTIONS.revenues);

  constructor() {
    this.busy.guard(this, ['createRevenue', 'updateRevenue', 'deleteRevenue']);
  }

  async getRevenues(): Promise<Revenue[]> {
    const snapshot = await getDocs(this.revenuesRef);
    return this.sortByDate(snapshot.docs.map((item) => this.mapRevenue({ id: item.id, ...item.data() })));
  }

  async getRevenueById(id: string): Promise<Revenue | null> {
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.revenues, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapRevenue({ id: snapshot.id, ...snapshot.data() });
  }

  async getRevenuesByJob(jobId: string): Promise<Revenue[]> {
    const snapshot = await getDocs(query(this.revenuesRef, where('jobId', '==', jobId)));
    return this.sortByDate(snapshot.docs.map((item) => this.mapRevenue({ id: item.id, ...item.data() })));
  }

  async getRevenuesByDateRange(startDate: Date, endDate: Date): Promise<Revenue[]> {
    try {
      const snapshot = await getDocs(
        query(
          this.revenuesRef,
          where('revenueDate', '>=', Timestamp.fromDate(startOfDayBangkok(startDate))),
          where('revenueDate', '<', Timestamp.fromDate(nextDayBangkok(endDate))),
        ),
      );
      return this.sortByDate(snapshot.docs.map((item) => this.mapRevenue({ id: item.id, ...item.data() })));
    } catch (error) {
      console.warn('Revenue date-range query failed, filtering in memory', error);
      return this.filterByDateRange(await this.getRevenues(), startDate, endDate);
    }
  }

  async getRevenuesByJobAndDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Revenue[]> {
    try {
      const snapshot = await getDocs(
        query(
          this.revenuesRef,
          where('jobId', '==', jobId),
          where('revenueDate', '>=', Timestamp.fromDate(startOfDayBangkok(startDate))),
          where('revenueDate', '<', Timestamp.fromDate(nextDayBangkok(endDate))),
        ),
      );
      return this.sortByDate(snapshot.docs.map((item) => this.mapRevenue({ id: item.id, ...item.data() })));
    } catch (error) {
      console.warn('Revenue job date-range query failed, filtering in memory', error);
      return this.filterByDateRange(await this.getRevenuesByJob(jobId), startDate, endDate);
    }
  }

  async createRevenue(data: RevenueWriteData): Promise<string> {
    this.validate(data);
    await this.assertJobAllowsWrite(data.jobId, false);
    const ref = doc(this.revenuesRef);
    await setDoc(ref, this.toPayload(data, ref.id, true));
    return ref.id;
  }

  async updateRevenue(id: string, data: RevenueWriteData): Promise<void> {
    this.validate(data);
    await this.assertJobAllowsWrite(data.jobId, true);
    await updateDoc(
      doc(this.firestore, COLLECTIONS.revenues, id),
      this.toPayload(data, id, false) as DocumentData,
    );
  }

  async deleteRevenue(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, COLLECTIONS.revenues, id));
  }

  private validate(data: RevenueWriteData): void {
    if (!data.jobId) {
      throw new Error('กรุณาเลือก Job');
    }
    if (!data.description.trim()) {
      throw new Error('กรุณากรอกรายละเอียดงวด');
    }
    if (!(data.amount > 0)) {
      throw new Error('ยอดเงินต้องมากกว่า 0');
    }
  }

  private async assertJobAllowsWrite(jobId: string, isEdit: boolean): Promise<void> {
    const job = await this.jobService.getJobById(jobId);
    if (!job) {
      throw new Error('ไม่พบงานที่เลือก');
    }
    if (!isEdit && !canCreateJobRevenue(job.status)) {
      throw new Error('งานนี้ถูกยกเลิกแล้ว ไม่สามารถเพิ่มรายรับได้');
    }
  }

  private toPayload(
    data: RevenueWriteData,
    id: string,
    isCreate: boolean,
  ): Record<string, unknown> {
    const actor = this.authService.currentUser()?.uid;
    const payload = omitUndefined({
      revenueId: id,
      jobId: data.jobId,
      revenueDate: Timestamp.fromDate(startOfDayBangkok(data.revenueDate)),
      type: data.type,
      status: data.status,
      description: data.description.trim(),
      amount: Number(data.amount),
      paymentMethod: data.paymentMethod,
      documentNo: data.documentNo,
      note: data.note,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
      payload['createdBy'] = actor;
    }
    return payload;
  }

  private sortByDate(rows: Revenue[]): Revenue[] {
    return [...rows].sort((a, b) => b.revenueDate.toMillis() - a.revenueDate.toMillis());
  }

  private filterByDateRange(rows: Revenue[], startDate: Date, endDate: Date): Revenue[] {
    const start = startOfDayBangkok(startDate).getTime();
    const end = nextDayBangkok(endDate).getTime();
    return rows.filter((item) => {
      const time = item.revenueDate.toDate().getTime();
      return time >= start && time < end;
    });
  }

  private mapRevenue(row: DocumentData): Revenue {
    return {
      id: String(row['id'] ?? row['revenueId'] ?? ''),
      revenueId: String(row['revenueId'] ?? row['id'] ?? ''),
      jobId: String(row['jobId'] ?? ''),
      revenueDate:
        row['revenueDate'] instanceof Timestamp ? row['revenueDate'] : Timestamp.fromDate(new Date()),
      type: this.mapType(row['type']),
      status: this.mapStatus(row['status']),
      description: String(row['description'] ?? ''),
      amount: Number(row['amount'] ?? 0),
      paymentMethod: row['paymentMethod'] ? String(row['paymentMethod']) : undefined,
      documentNo: row['documentNo'] ? String(row['documentNo']) : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      updatedBy: row['updatedBy'] ? String(row['updatedBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapType(value: unknown): RevenueType {
    const types: RevenueType[] = ['CONTRACT', 'VARIATION', 'RETENTION', 'OTHER'];
    return types.includes(value as RevenueType) ? (value as RevenueType) : 'CONTRACT';
  }

  private mapStatus(value: unknown): RevenueStatus {
    const statuses: RevenueStatus[] = ['PLANNED', 'BILLED', 'RECEIVED', 'CANCELLED'];
    return statuses.includes(value as RevenueStatus) ? (value as RevenueStatus) : 'PLANNED';
  }
}

export function mapRevenueError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'ไม่สามารถบันทึกรายรับได้';
}
