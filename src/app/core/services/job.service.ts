import { computed, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  collectionData,
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
import { DocumentData } from 'firebase/firestore';
import { map } from 'rxjs';
import { COLLECTIONS } from '../constants/collections';
import { Job, JobStatus, JobWriteData } from '../models';
import { omitUndefined, toDate } from '../utils/form.util';

const JOB_CODE_PATTERN = /^JOB-(\d{4})-(\d+)$/i;

@Injectable({
  providedIn: 'root',
})
export class JobService {
  private readonly firestore = inject(Firestore);
  private readonly jobsRef = collection(this.firestore, COLLECTIONS.jobs);

  readonly jobs = signal<Job[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  readonly totalCount = computed(() => this.jobs().length);
  readonly inProgressCount = computed(
    () => this.jobs().filter((job) => job.status === 'IN_PROGRESS').length,
  );
  readonly completedCount = computed(
    () => this.jobs().filter((job) => job.status === 'COMPLETED').length,
  );
  readonly closedCount = computed(
    () => this.jobs().filter((job) => job.status === 'CLOSED').length,
  );

  constructor() {
    collectionData(this.jobsRef, { idField: 'id' })
      .pipe(map((rows) => rows.map((row) => this.mapJob(row))))
      .subscribe({
        next: (jobs) => {
          this.jobs.set(jobs);
          this.loading.set(false);
          this.loaded.set(true);
          this.error.set(null);
        },
        error: (error: unknown) => {
          console.error('Failed to load jobs', error);
          this.error.set('ไม่สามารถโหลดข้อมูลงานก่อสร้างได้');
          this.loading.set(false);
        },
      });
  }

  getJobs(): Job[] {
    return this.jobs();
  }

  async getJobById(id: string): Promise<Job | null> {
    const cached = this.jobs().find((job) => job.id === id);
    if (cached) {
      return cached;
    }
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.jobs, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapJob({ id: snapshot.id, ...snapshot.data() });
  }

  async generateNextJobCode(date = new Date()): Promise<string> {
    const yearBe = date.getFullYear() + 543;
    const codes = await this.getExistingCodes();
    let maxNumber = 0;
    for (const code of codes) {
      const match = JOB_CODE_PATTERN.exec(code.trim());
      if (match && Number(match[1]) === yearBe) {
        maxNumber = Math.max(maxNumber, Number(match[2]));
      }
    }
    return `JOB-${yearBe}-${String(maxNumber + 1).padStart(3, '0')}`;
  }

  async createJob(data: JobWriteData): Promise<string> {
    await this.assertUniqueCode(data.jobCode);
    const jobRef = doc(this.jobsRef);
    await setDoc(jobRef, this.toFirestorePayload(data, jobRef.id, true));
    return jobRef.id;
  }

  async updateJob(id: string, data: JobWriteData): Promise<void> {
    await this.assertUniqueCode(data.jobCode, id);
    await updateDoc(
      doc(this.firestore, COLLECTIONS.jobs, id),
      this.toFirestorePayload(data, id, false) as DocumentData,
    );
  }

  async changeJobStatus(id: string, status: JobStatus): Promise<void> {
    const payload: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp(),
    };
    if (status === 'COMPLETED' || status === 'CLOSED') {
      payload['actualEndDate'] = Timestamp.fromDate(new Date());
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.jobs, id), payload as DocumentData);
  }

  async deleteJob(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, COLLECTIONS.jobs, id));
  }

  private async assertUniqueCode(jobCode: string, excludeId?: string): Promise<void> {
    const normalized = jobCode.trim().toUpperCase();
    const cachedDuplicate = this.jobs().some(
      (job) => job.jobCode.trim().toUpperCase() === normalized && job.id !== excludeId,
    );
    if (cachedDuplicate) {
      throw new Error('DUPLICATE_CODE');
    }

    const snapshot = await getDocs(
      query(this.jobsRef, where('jobCode', '==', jobCode.trim())),
    );
    if (snapshot.docs.some((item) => item.id !== excludeId)) {
      throw new Error('DUPLICATE_CODE');
    }
  }

  private async getExistingCodes(): Promise<string[]> {
    if (this.loaded()) {
      return this.jobs().map((job) => job.jobCode);
    }
    const snapshot = await getDocs(this.jobsRef);
    return snapshot.docs.map((item) => String(item.data()['jobCode'] ?? ''));
  }

  private toFirestorePayload(
    data: JobWriteData,
    id: string,
    isCreate: boolean,
  ): Record<string, unknown> {
    const payload = omitUndefined({
      jobId: id,
      jobCode: data.jobCode.trim(),
      jobName: data.jobName.trim(),
      customerName: data.customerName.trim(),
      customerPhone: data.customerPhone?.trim(),
      location: data.location?.trim(),
      description: data.description?.trim(),
      contractValue: data.contractValue,
      estimatedBudget: data.estimatedBudget,
      startDate: Timestamp.fromDate(data.startDate),
      expectedEndDate: data.expectedEndDate ? Timestamp.fromDate(data.expectedEndDate) : undefined,
      status: data.status,
      supervisorId: data.supervisorId,
      note: data.note?.trim(),
      updatedAt: serverTimestamp(),
    });

    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
      payload['assignedEmployeeIds'] = [];
    } else {
      if (!data.supervisorId) {
        payload['supervisorId'] = deleteField();
      }
      if (!data.expectedEndDate) {
        payload['expectedEndDate'] = deleteField();
      }
      if (data.estimatedBudget === undefined) {
        payload['estimatedBudget'] = deleteField();
      }
    }

    return payload;
  }

  private mapJob(row: DocumentData): Job {
    const assignedEmployeeIds = Array.isArray(row['assignedEmployeeIds'])
      ? row['assignedEmployeeIds'].map((item) => String(item))
      : [];

    return {
      id: String(row['id'] ?? row['jobId'] ?? ''),
      jobId: String(row['jobId'] ?? row['id'] ?? ''),
      jobCode: String(row['jobCode'] ?? ''),
      jobName: String(row['jobName'] ?? ''),
      customerName: String(row['customerName'] ?? ''),
      customerPhone: row['customerPhone'] ? String(row['customerPhone']) : undefined,
      location: row['location'] ? String(row['location']) : undefined,
      description: row['description'] ? String(row['description']) : undefined,
      contractValue: this.mapNumber(row['contractValue']) ?? 0,
      estimatedBudget: this.mapNumber(row['estimatedBudget']),
      startDate: this.mapDate(row['startDate']),
      expectedEndDate: row['expectedEndDate'] ? this.mapDate(row['expectedEndDate']) : undefined,
      actualEndDate: row['actualEndDate'] ? this.mapDate(row['actualEndDate']) : undefined,
      status: this.mapStatus(row['status']),
      supervisorId: row['supervisorId'] ? String(row['supervisorId']) : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      assignedEmployeeIds,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapStatus(value: unknown): JobStatus {
    const statuses: JobStatus[] = [
      'DRAFT',
      'OPEN',
      'IN_PROGRESS',
      'COMPLETED',
      'CLOSED',
      'CANCELLED',
    ];
    return statuses.includes(value as JobStatus) ? (value as JobStatus) : 'DRAFT';
  }

  private mapDate(value: unknown): Date | Timestamp | string {
    if (value instanceof Timestamp || value instanceof Date || typeof value === 'string') {
      return value;
    }
    return new Date();
  }

  private mapNumber(value: unknown): number | undefined {
    return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
  }
}

export function mapJobError(error: unknown): string {
  if (error instanceof Error && error.message === 'DUPLICATE_CODE') {
    return 'รหัส Job นี้มีอยู่ในระบบแล้ว';
  }
  if (error instanceof Error && error.message === 'JOB_LOCKED') {
    return 'ไม่สามารถเพิ่มพนักงานในงานที่ปิดหรือยกเลิกแล้ว';
  }
  console.error('Job operation failed', error);
  return 'ไม่สามารถบันทึกข้อมูลงานก่อสร้างได้';
}

export function toJobDate(value: Date | Timestamp | string): Date {
  return toDate(value);
}
