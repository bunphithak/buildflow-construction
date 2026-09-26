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
  writeBatch,
  deleteField,
} from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/collections';
import {
  Attendance,
  AttendanceLaborRow,
  AttendanceStatus,
  AttendanceWriteData,
  isHalfDayStatus,
  isWorkedAttendanceStatus,
  needsAttendanceClock,
} from '../models';
import { AuthService } from '../auth/auth.service';
import { BusyService } from './busy.service';
import {
  combineBangkokDateAndTime,
  formatBangkokTime,
  hasTimeOverlap,
  nextDayBangkok,
  startOfDayBangkok,
} from '../utils/datetime.util';
import { omitUndefined } from '../utils/form.util';
import { AttendanceCalculationService } from './attendance-calculation.service';

const BATCH_LIMIT = 450;

@Injectable({
  providedIn: 'root',
})
export class AttendanceService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly calculation = inject(AttendanceCalculationService);
  private readonly busy = inject(BusyService);
  private readonly attendancesRef = collection(this.firestore, COLLECTIONS.attendances);

  constructor() {
    this.busy.guard(this, [
      'createAttendance',
      'updateAttendance',
      'saveDailyAttendance',
      'deleteAttendance',
    ]);
  }

  async getAttendances(): Promise<Attendance[]> {
    const snapshot = await getDocs(this.attendancesRef);
    return snapshot.docs.map((item) => this.mapAttendance({ id: item.id, ...item.data() }));
  }

  async getAttendanceById(id: string): Promise<Attendance | null> {
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.attendances, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapAttendance({ id: snapshot.id, ...snapshot.data() });
  }

  async getAttendancesByDate(date: Date): Promise<Attendance[]> {
    return this.queryDateRange(date, date);
  }

  async getAttendancesByJob(jobId: string): Promise<Attendance[]> {
    const snapshot = await getDocs(query(this.attendancesRef, where('jobId', '==', jobId)));
    return snapshot.docs.map((item) => this.mapAttendance({ id: item.id, ...item.data() }));
  }

  async getAttendancesByJobAndDate(jobId: string, date: Date): Promise<Attendance[]> {
    return this.queryByJobAndDateRange(jobId, date, date);
  }

  async getAttendancesByEmployee(employeeId: string): Promise<Attendance[]> {
    const snapshot = await getDocs(
      query(this.attendancesRef, where('employeeId', '==', employeeId)),
    );
    return snapshot.docs.map((item) => this.mapAttendance({ id: item.id, ...item.data() }));
  }

  async getAttendancesByEmployeeAndDateRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return this.queryByEmployeeAndDateRange(employeeId, startDate, endDate);
  }

  async getAttendancesByEmployeeAndDate(employeeId: string, date: Date): Promise<Attendance[]> {
    return this.queryByEmployeeAndDateRange(employeeId, date, date);
  }

  async getAttendancesByDateRange(startDate: Date, endDate: Date): Promise<Attendance[]> {
    return this.queryDateRange(startDate, endDate);
  }

  async getAttendancesByJobAndDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return this.queryByJobAndDateRange(jobId, startDate, endDate);
  }

  async createAttendance(data: AttendanceWriteData): Promise<string> {
    await this.assertCanSave(data);
    const ref = doc(this.attendancesRef);
    await setDoc(ref, this.toPayload(data, ref.id, true));
    return ref.id;
  }

  async updateAttendance(id: string, data: AttendanceWriteData): Promise<void> {
    await this.assertCanSave(data, id);
    await updateDoc(
      doc(this.firestore, COLLECTIONS.attendances, id),
      this.toPayload(data, id, false) as DocumentData,
    );
  }

  async saveDailyAttendance(
    records: AttendanceWriteData[],
  ): Promise<Map<string, string>> {
    const savedIds = new Map<string, string>();
    if (records.length === 0) {
      return savedIds;
    }

    const workDate = records[0].workDate;
    const dayRows = await this.getAttendancesByDate(workDate);
    const seen = new Set<string>();
    const errors: string[] = [];

    for (const record of records) {
      if (seen.has(record.employeeId)) {
        errors.push('มีพนักงานซ้ำในรายการที่บันทึก');
        continue;
      }
      seen.add(record.employeeId);
      const existing = dayRows.find(
        (item) => item.employeeId === record.employeeId && item.jobId === record.jobId,
      );
      try {
        this.validateWrite(record, existing?.id, dayRows);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'ข้อมูลไม่ถูกต้อง');
      }
    }
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    const chunks = this.chunk(records, BATCH_LIMIT);
    const actor = this.authService.currentUser()?.uid;
    for (const chunk of chunks) {
      const batch = writeBatch(this.firestore);
      for (const record of chunk) {
        const existing = dayRows.find(
          (item) => item.employeeId === record.employeeId && item.jobId === record.jobId,
        );
        const ref = existing
          ? doc(this.firestore, COLLECTIONS.attendances, existing.id)
          : doc(this.attendancesRef);
        savedIds.set(record.employeeId, ref.id);
        const payload = this.toPayload(record, ref.id, !existing, actor);
        if (existing) {
          batch.update(ref, payload as DocumentData);
        } else {
          batch.set(ref, payload);
        }
      }
      await batch.commit();
    }
    return savedIds;
  }

  async deleteAttendance(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, COLLECTIONS.attendances, id));
  }

  async getLaborCostByJob(jobId: string): Promise<number> {
    const rows = await this.getAttendancesByJob(jobId);
    return rows.reduce((sum, item) => sum + item.totalLaborCost, 0);
  }

  async getLaborCostByJobAndDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const rows = await this.getLaborRowsByJob(jobId, startDate, endDate);
    return rows.reduce((sum, item) => sum + item.totalLaborCost, 0);
  }

  async getLaborRowsByJob(
    jobId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<AttendanceLaborRow[]> {
    let rows = await this.getAttendancesByJob(jobId);
    if (startDate && endDate) {
      const start = startOfDayBangkok(startDate).getTime();
      const end = nextDayBangkok(endDate).getTime();
      rows = rows.filter((item) => {
        const time = item.workDate.toDate().getTime();
        return time >= start && time < end;
      });
    }
    return this.groupLabor(rows);
  }

  async findOverlappingAttendance(
    employeeId: string,
    workDate: Date,
    clockIn: Date,
    clockOut: Date,
    excludeId?: string,
  ): Promise<Attendance | null> {
    const rows = await this.getAttendancesByEmployeeAndDate(employeeId, workDate);
    return this.findTimeOverlap(rows, employeeId, clockIn, clockOut, excludeId);
  }

  private async queryByJobAndDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    const rows = await this.getAttendancesByJob(jobId);
    return rows.filter((item) => this.isInWorkDateRange(item, startDate, endDate));
  }

  private async queryByEmployeeAndDateRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    const rows = await this.getAttendancesByEmployee(employeeId);
    return rows.filter((item) => this.isInWorkDateRange(item, startDate, endDate));
  }

  private async queryDateRange(startDate: Date, endDate: Date): Promise<Attendance[]> {
    const snapshot = await getDocs(
      query(
        this.attendancesRef,
        where('workDate', '>=', Timestamp.fromDate(startOfDayBangkok(startDate))),
        where('workDate', '<', Timestamp.fromDate(nextDayBangkok(endDate))),
      ),
    );
    return snapshot.docs.map((item) => this.mapAttendance({ id: item.id, ...item.data() }));
  }

  private isInWorkDateRange(item: Attendance, startDate: Date, endDate: Date): boolean {
    const time = item.workDate.toMillis();
    return time >= startOfDayBangkok(startDate).getTime() && time < nextDayBangkok(endDate).getTime();
  }

  private async assertCanSave(data: AttendanceWriteData, excludeId?: string): Promise<void> {
    const dayRows = await this.getAttendancesByDate(data.workDate);
    this.validateWrite(data, excludeId, dayRows);
  }

  private validateWrite(
    data: AttendanceWriteData,
    excludeId: string | undefined,
    dayRows: Attendance[],
  ): void {
    const needsTime = needsAttendanceClock(data.status);
    if (needsTime && data.clockIn && data.clockOut && data.clockOut.getTime() <= data.clockIn.getTime()) {
      throw new Error(`เวลาออกงานต้องมากกว่าเวลาเข้างาน`);
    }
    if (data.breakMinutes < 0 || data.overtimeHours < 0) {
      throw new Error('ค่าพักและ OT ต้องไม่ติดลบ');
    }
    if (data.dailyRateSnapshot !== undefined && data.dailyRateSnapshot < 0) {
      throw new Error('ค่าแรงต้องไม่ติดลบ');
    }
    if (data.monthlySalarySnapshot !== undefined && data.monthlySalarySnapshot < 0) {
      throw new Error('เงินเดือนต้องไม่ติดลบ');
    }

    const sameJob = dayRows.find(
      (item) =>
        item.employeeId === data.employeeId && item.jobId === data.jobId && item.id !== excludeId,
    );
    if (sameJob) {
      throw new Error('พนักงานมีรายการลงเวลาใน Job นี้แล้วสำหรับวันนี้');
    }

    if (data.clockIn && data.clockOut) {
      const overlap = this.findTimeOverlap(
        dayRows,
        data.employeeId,
        data.clockIn,
        data.clockOut,
        excludeId,
      );
      if (overlap) {
        throw new Error('พนักงานมีเวลาทำงานซ้อนกับ Job อื่น');
      }
    }
  }

  private findTimeOverlap(
    rows: Attendance[],
    employeeId: string,
    clockIn: Date,
    clockOut: Date,
    excludeId?: string,
  ): Attendance | null {
    return (
      rows.find((item) => {
        if (item.employeeId !== employeeId || item.id === excludeId || !item.clockIn || !item.clockOut) {
          return false;
        }
        return hasTimeOverlap(clockIn, clockOut, item.clockIn.toDate(), item.clockOut.toDate());
      }) ?? null
    );
  }

  private toPayload(
    data: AttendanceWriteData,
    id: string,
    isCreate: boolean,
    actor = this.authService.currentUser()?.uid,
  ): Record<string, unknown> {
    const clockIn = data.clockIn;
    const clockOut = data.clockOut;
    const calculated = this.calculation.applyToWriteData(data, clockIn, clockOut);
    const payload = omitUndefined({
      attendanceId: id,
      employeeId: data.employeeId,
      jobId: data.jobId,
      workDate: Timestamp.fromDate(startOfDayBangkok(data.workDate)),
      breakMinutes: Number(data.breakMinutes ?? 0),
      normalHours: calculated.normalHours,
      overtimeHours: Number(data.overtimeHours ?? 0),
      status: data.status,
      employmentTypeSnapshot: data.employmentTypeSnapshot,
      dailyRateSnapshot: data.dailyRateSnapshot,
      monthlySalarySnapshot: data.monthlySalarySnapshot,
      overtimeRateSnapshot: data.overtimeRateSnapshot,
      regularLaborCost: calculated.regularLaborCost,
      overtimeCost: calculated.overtimeCost,
      totalLaborCost: calculated.totalLaborCost,
      note: data.note,
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
    if (clockIn) {
      payload['clockIn'] = Timestamp.fromDate(clockIn);
    } else if (!isCreate) {
      payload['clockIn'] = deleteField();
    }
    if (clockOut) {
      payload['clockOut'] = Timestamp.fromDate(clockOut);
    } else if (!isCreate) {
      payload['clockOut'] = deleteField();
    }
    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
      payload['createdBy'] = actor;
    }
    return payload;
  }

  private groupLabor(rows: Attendance[]): AttendanceLaborRow[] {
    const map = new Map<string, AttendanceLaborRow>();
    for (const row of rows) {
      const current = map.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeName: row.employeeId,
        employmentType: row.employmentTypeSnapshot,
        recordCount: 0,
        presentDays: 0,
        normalHours: 0,
        overtimeHours: 0,
        regularLaborCost: 0,
        overtimeCost: 0,
        totalLaborCost: 0,
      };
      current.recordCount += 1;
      if (isWorkedAttendanceStatus(row.status)) {
        current.presentDays += isHalfDayStatus(row.status) ? 0.5 : 1;
      }
      current.normalHours += row.normalHours;
      current.overtimeHours += row.overtimeHours;
      current.regularLaborCost += row.regularLaborCost;
      current.overtimeCost += row.overtimeCost;
      current.totalLaborCost += row.totalLaborCost;
      map.set(row.employeeId, current);
    }
    return [...map.values()];
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, i + size));
    }
    return result;
  }

  private mapAttendance(row: DocumentData): Attendance {
    return {
      id: String(row['id'] ?? row['attendanceId'] ?? ''),
      attendanceId: String(row['attendanceId'] ?? row['id'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      jobId: String(row['jobId'] ?? ''),
      workDate: row['workDate'] instanceof Timestamp ? row['workDate'] : Timestamp.fromDate(new Date()),
      clockIn: row['clockIn'] instanceof Timestamp ? row['clockIn'] : undefined,
      clockOut: row['clockOut'] instanceof Timestamp ? row['clockOut'] : undefined,
      breakMinutes: Number(row['breakMinutes'] ?? 0),
      normalHours: Number(row['normalHours'] ?? 0),
      overtimeHours: Number(row['overtimeHours'] ?? 0),
      status: this.mapStatus(row['status']),
      employmentTypeSnapshot: row['employmentTypeSnapshot'] === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
      dailyRateSnapshot:
        typeof row['dailyRateSnapshot'] === 'number' ? row['dailyRateSnapshot'] : undefined,
      monthlySalarySnapshot:
        typeof row['monthlySalarySnapshot'] === 'number' ? row['monthlySalarySnapshot'] : undefined,
      overtimeRateSnapshot:
        typeof row['overtimeRateSnapshot'] === 'number' ? row['overtimeRateSnapshot'] : undefined,
      regularLaborCost: Number(row['regularLaborCost'] ?? 0),
      overtimeCost: Number(row['overtimeCost'] ?? 0),
      totalLaborCost: Number(row['totalLaborCost'] ?? 0),
      note: row['note'] ? String(row['note']) : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      updatedBy: row['updatedBy'] ? String(row['updatedBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapStatus(value: unknown): AttendanceStatus {
    const statuses: AttendanceStatus[] = [
      'PRESENT',
      'ABSENT',
      'LEAVE',
      'HOLIDAY',
      'SITE_CLOSED',
      'SITE_CLOSED_MORNING',
      'SITE_CLOSED_AFTERNOON',
      'HALF_DAY',
      'HALF_DAY_MORNING',
      'HALF_DAY_AFTERNOON',
    ];
    return statuses.includes(value as AttendanceStatus) ? (value as AttendanceStatus) : 'ABSENT';
  }
}

export function attendanceTimeLabel(attendance: Attendance): { clockIn: string; clockOut: string } {
  return {
    clockIn: attendance.clockIn ? formatBangkokTime(attendance.clockIn.toDate()) : '-',
    clockOut: attendance.clockOut ? formatBangkokTime(attendance.clockOut.toDate()) : '-',
  };
}

export function workDateFromInput(value: string): Date {
  return startOfDayBangkok(value);
}

export function combineWorkTime(workDate: Date | string, time: string): Date {
  return combineBangkokDateAndTime(workDate, time);
}
