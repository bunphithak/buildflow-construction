import { inject, Injectable } from '@angular/core';
import {
  collection,
  doc,
  Firestore,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { AuthService } from '../auth/auth.service';
import { COLLECTIONS } from '../constants/collections';
import {
  Attendance,
  AttendanceWriteData,
  clockTimesForStatus,
  isWorkedAttendanceStatus,
  Job,
  nextStoppageStatus,
  WorkStoppage,
  WorkStoppagePeriod,
  WorkStoppageReason,
  WorkStoppageScope,
  workStoppageNote,
} from '../models';
import { bangkokDateKey, nextDayBangkok, startOfDayBangkok } from '../utils/datetime.util';
import { omitUndefined } from '../utils/form.util';
import { AttendanceService, combineWorkTime } from './attendance.service';
import { AttendanceSettingsService } from './attendance-settings.service';
import { BusyService } from './busy.service';
import { EmployeeService } from './employee.service';
import { JobEmployeeService } from './job-employee.service';

export interface ApplyWorkStoppageInput {
  workDate: Date;
  jobs: Job[];
  scope: WorkStoppageScope;
  period: WorkStoppagePeriod;
  reason: WorkStoppageReason;
  reasonNote?: string;
  overwriteWorked: boolean;
}

export interface ApplyWorkStoppageResult {
  saved: number;
  skipped: number;
  jobCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class WorkStoppageService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly jobEmployeeService = inject(JobEmployeeService);
  private readonly employeeService = inject(EmployeeService);
  private readonly settingsService = inject(AttendanceSettingsService);
  private readonly busy = inject(BusyService);
  private readonly stoppagesRef = collection(this.firestore, COLLECTIONS.workStoppages);

  constructor() {
    this.busy.guard(this, ['apply']);
  }

  async getByDate(date: Date): Promise<WorkStoppage[]> {
    const snapshot = await getDocs(
      query(
        this.stoppagesRef,
        where('workDate', '>=', Timestamp.fromDate(startOfDayBangkok(date))),
        where('workDate', '<', Timestamp.fromDate(nextDayBangkok(date))),
      ),
    );
    return snapshot.docs.map((item) => this.mapStoppage({ id: item.id, ...item.data() }));
  }

  async apply(input: ApplyWorkStoppageInput): Promise<ApplyWorkStoppageResult> {
    if (input.jobs.length === 0) {
      throw new Error('กรุณาเลือกไซต์งาน');
    }
    for (const job of input.jobs) {
      if (!this.authService.canManageJob(job.id)) {
        throw new Error('ไม่มีสิทธิ์สั่งหยุดของงานนี้');
      }
    }
    if (input.scope === 'ALL' && !this.authService.hasRole(['ADMIN'])) {
      throw new Error('เฉพาะผู้ดูแลระบบที่สั่งหยุดทุกไซต์ได้');
    }
    if (input.reason === 'OTHER' && !input.reasonNote?.trim()) {
      throw new Error('กรุณาระบุสาเหตุ');
    }

    const note = workStoppageNote(input.reason, input.reasonNote);
    const workDate = startOfDayBangkok(input.workDate);
    const dayRows = await this.attendanceService.getAttendancesByDate(workDate);
    const settings = this.settingsService.get();
    let saved = 0;
    let skipped = 0;

    for (const job of input.jobs) {
      const assignments = await this.jobEmployeeService.queryActiveByJob(job.id);
      const records: AttendanceWriteData[] = [];
      for (const assignment of assignments) {
        const employee =
          this.employeeService.employees().find((item) => item.id === assignment.employeeId) ??
          (await this.employeeService.getEmployeeById(assignment.employeeId));
        if (!employee || employee.status !== 'ACTIVE') {
          skipped += 1;
          continue;
        }
        const existing = dayRows.find(
          (item) => item.employeeId === employee.id && item.jobId === job.id,
        );
        const nextStatus = nextStoppageStatus(existing?.status, input.period, input.overwriteWorked);
        if (!nextStatus) {
          skipped += 1;
          continue;
        }
        const times = clockTimesForStatus(nextStatus, {
          clockIn: settings.defaultClockIn,
          clockOut: settings.defaultClockOut,
          breakMinutes: settings.defaultBreakMinutes,
        });
        records.push({
          employeeId: employee.id,
          jobId: job.id,
          workDate,
          clockIn: times?.clockIn ? combineWorkTime(workDate, times.clockIn) : undefined,
          clockOut: times?.clockOut ? combineWorkTime(workDate, times.clockOut) : undefined,
          breakMinutes: times?.breakMinutes ?? 0,
          overtimeHours: isWorkedAttendanceStatus(nextStatus) ? existing?.overtimeHours ?? 0 : 0,
          status: nextStatus,
          employmentTypeSnapshot: existing?.employmentTypeSnapshot ?? employee.employmentType,
          dailyRateSnapshot: existing?.dailyRateSnapshot ?? employee.dailyRate,
          monthlySalarySnapshot: existing?.monthlySalarySnapshot ?? employee.monthlySalary,
          overtimeRateSnapshot: existing?.overtimeRateSnapshot ?? employee.overtimeRate,
          note: this.mergeNote(existing?.note, note),
        });
      }
      if (records.length === 0) {
        continue;
      }
      await this.attendanceService.saveDailyAttendance(records);
      saved += records.length;
      this.mergeSavedIntoDayRows(dayRows, records, job.id);
    }

    await this.saveStoppageDoc({
      workDate,
      scope: input.scope,
      jobIds: input.jobs.map((job) => job.id),
      period: input.period,
      reason: input.reason,
      reasonNote: input.reasonNote?.trim() || undefined,
      note,
    });

    return { saved, skipped, jobCount: input.jobs.length };
  }

  private mergeNote(existing: string | undefined, stoppageNote: string): string {
    const current = existing?.trim();
    if (!current || current.includes('สั่งหยุด') || current === stoppageNote) {
      return stoppageNote;
    }
    return `${stoppageNote} · ${current}`;
  }

  private mergeSavedIntoDayRows(
    dayRows: Attendance[],
    records: AttendanceWriteData[],
    jobId: string,
  ): void {
    for (const record of records) {
      const index = dayRows.findIndex(
        (item) => item.employeeId === record.employeeId && item.jobId === jobId,
      );
      if (index >= 0) {
        dayRows[index] = {
          ...dayRows[index],
          status: record.status,
          note: record.note,
        };
      } else {
        dayRows.push({
          id: `pending-${record.employeeId}-${jobId}`,
          attendanceId: '',
          employeeId: record.employeeId,
          jobId,
          workDate: Timestamp.fromDate(record.workDate),
          breakMinutes: record.breakMinutes,
          normalHours: 0,
          overtimeHours: record.overtimeHours,
          status: record.status,
          employmentTypeSnapshot: record.employmentTypeSnapshot,
          regularLaborCost: 0,
          overtimeCost: 0,
          totalLaborCost: 0,
          note: record.note,
        });
      }
    }
  }

  private async saveStoppageDoc(data: {
    workDate: Date;
    scope: WorkStoppageScope;
    jobIds: string[];
    period: WorkStoppagePeriod;
    reason: WorkStoppageReason;
    reasonNote?: string;
    note: string;
  }): Promise<void> {
    const actor = this.authService.currentUser()?.uid;
    const dateKey = bangkokDateKey(data.workDate);
    const id = data.scope === 'ALL' ? `${dateKey}_all` : `${dateKey}_${data.jobIds[0]}`;
    const ref = doc(this.firestore, COLLECTIONS.workStoppages, id);
    await setDoc(
      ref,
      omitUndefined({
        workDate: Timestamp.fromDate(startOfDayBangkok(data.workDate)),
        scope: data.scope,
        jobIds: data.jobIds,
        period: data.period,
        reason: data.reason,
        reasonNote: data.reasonNote,
        note: data.note,
        createdAt: serverTimestamp(),
        createdBy: actor,
        updatedAt: serverTimestamp(),
        updatedBy: actor,
      }),
    );
  }

  private mapStoppage(row: DocumentData): WorkStoppage {
    return {
      id: String(row['id'] ?? ''),
      workDate: row['workDate'] instanceof Timestamp ? row['workDate'] : Timestamp.fromDate(new Date()),
      scope: row['scope'] === 'ALL' ? 'ALL' : 'JOB',
      jobIds: Array.isArray(row['jobIds']) ? row['jobIds'].map((item) => String(item)) : [],
      period:
        row['period'] === 'MORNING' || row['period'] === 'AFTERNOON' ? row['period'] : 'FULL',
      reason:
        row['reason'] === 'SAFETY' || row['reason'] === 'ORDER' || row['reason'] === 'OTHER'
          ? row['reason']
          : 'RAIN',
      reasonNote: row['reasonNote'] ? String(row['reasonNote']) : undefined,
      note: String(row['note'] ?? 'สั่งหยุด'),
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }
}
