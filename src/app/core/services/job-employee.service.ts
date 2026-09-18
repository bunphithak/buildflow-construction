import { computed, inject, Injectable, signal } from '@angular/core';
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionData,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { map } from 'rxjs';
import { COLLECTIONS } from '../constants/collections';
import { JobAssignmentStatus, JobEmployee } from '../models';
import { canAssignEmployeesToJob } from '../utils/job-status.util';
import { JobService } from './job.service';

@Injectable({
  providedIn: 'root',
})
export class JobEmployeeService {
  private readonly firestore = inject(Firestore);
  private readonly jobService = inject(JobService);
  private readonly assignmentsRef = collection(this.firestore, COLLECTIONS.jobEmployees);

  readonly assignments = signal<JobEmployee[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  constructor() {
    collectionData(this.assignmentsRef, { idField: 'id' })
      .pipe(map((rows) => rows.map((row) => this.mapAssignment(row))))
      .subscribe({
        next: (assignments) => {
          this.assignments.set(assignments);
          this.loading.set(false);
          this.loaded.set(true);
          this.error.set(null);
        },
        error: (error: unknown) => {
          console.error('Failed to load job employees', error);
          this.error.set('ไม่สามารถโหลดข้อมูลพนักงานในงานได้');
          this.loading.set(false);
        },
      });
  }

  getEmployeesByJob(jobId: string, status?: JobAssignmentStatus): JobEmployee[] {
    return this.assignments().filter(
      (item) => item.jobId === jobId && (!status || item.status === status),
    );
  }

  getJobsByEmployee(employeeId: string, status?: JobAssignmentStatus): JobEmployee[] {
    return this.assignments().filter(
      (item) => item.employeeId === employeeId && (!status || item.status === status),
    );
  }

  activeCountByJob(jobId: string): number {
    return this.getEmployeesByJob(jobId, 'ACTIVE').length;
  }

  readonly activeCountByJobMap = computed(() => {
    const counts = new Map<string, number>();
    for (const item of this.assignments()) {
      if (item.status !== 'ACTIVE') {
        continue;
      }
      counts.set(item.jobId, (counts.get(item.jobId) ?? 0) + 1);
    }
    return counts;
  });

  isEmployeeAssigned(jobId: string, employeeId: string): boolean {
    return this.assignments().some(
      (item) =>
        item.jobId === jobId && item.employeeId === employeeId && item.status === 'ACTIVE',
    );
  }

  async assignEmployeeToJob(
    jobId: string,
    employeeId: string,
    assignedDate: Date,
  ): Promise<void> {
    await this.assignEmployeesToJob(jobId, [employeeId], assignedDate);
  }

  async assignEmployeesToJob(
    jobId: string,
    employeeIds: string[],
    assignedDate: Date,
  ): Promise<number> {
    const job = await this.jobService.getJobById(jobId);
    if (!job || !canAssignEmployeesToJob(job.status)) {
      throw new Error('JOB_LOCKED');
    }

    const uniqueIds = [...new Set(employeeIds)].filter(
      (employeeId) => !this.isEmployeeAssigned(jobId, employeeId),
    );
    if (uniqueIds.length === 0) {
      return 0;
    }

    const batch = writeBatch(this.firestore);
    for (const employeeId of uniqueIds) {
      const assignmentRef = doc(this.assignmentsRef);
      batch.set(assignmentRef, {
        jobId,
        employeeId,
        assignedDate: Timestamp.fromDate(assignedDate),
        status: 'ACTIVE',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.update(doc(this.firestore, COLLECTIONS.jobs, jobId), {
      assignedEmployeeIds: arrayUnion(...uniqueIds),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return uniqueIds.length;
  }

  async removeEmployeeFromJob(jobEmployeeId: string, removedDate: Date): Promise<void> {
    const assignment = this.assignments().find((item) => item.id === jobEmployeeId);
    if (!assignment) {
      throw new Error('ASSIGNMENT_NOT_FOUND');
    }

    const batch = writeBatch(this.firestore);
    batch.update(doc(this.firestore, COLLECTIONS.jobEmployees, jobEmployeeId), {
      status: 'REMOVED',
      removedDate: Timestamp.fromDate(removedDate),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(this.firestore, COLLECTIONS.jobs, assignment.jobId), {
      assignedEmployeeIds: arrayRemove(assignment.employeeId),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }

  async queryActiveByJob(jobId: string): Promise<JobEmployee[]> {
    if (this.loaded()) {
      return this.getEmployeesByJob(jobId, 'ACTIVE');
    }
    const snapshot = await getDocs(
      query(
        this.assignmentsRef,
        where('jobId', '==', jobId),
        where('status', '==', 'ACTIVE'),
      ),
    );
    return snapshot.docs.map((item) => this.mapAssignment({ id: item.id, ...item.data() }));
  }

  private mapAssignment(row: DocumentData): JobEmployee {
    return {
      id: String(row['id'] ?? ''),
      jobId: String(row['jobId'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      assignedDate: this.mapDate(row['assignedDate']),
      removedDate: row['removedDate'] ? this.mapDate(row['removedDate']) : undefined,
      status: row['status'] === 'REMOVED' ? 'REMOVED' : 'ACTIVE',
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapDate(value: unknown): Date | Timestamp | string {
    if (value instanceof Timestamp || value instanceof Date || typeof value === 'string') {
      return value;
    }
    return new Date();
  }
}
