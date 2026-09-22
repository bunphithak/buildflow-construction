import { inject, Injectable } from '@angular/core';
import {
  collection,
  deleteDoc,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/collections';
import { AuthService } from '../auth/auth.service';
import {
  Attendance,
  Employee,
  EmployeeAdvance,
  Payroll,
  PayrollAdjustment,
  PayrollAdjustmentWriteData,
  PayrollStatus,
} from '../models';
import { AttendanceService } from './attendance.service';
import { AdvanceService } from './advance.service';
import { EmployeeService } from './employee.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { bangkokDateKey, monthRangeBangkok, payrollPeriodKey, roundMoney, startOfDayBangkok } from '../utils/datetime.util';
import { omitUndefined } from '../utils/form.util';
import {
  calculatePayrollTotals,
  hasPayableWork,
  payrollDisplayLabel,
  snapshotEmployeeRates,
} from '../utils/payroll.util';

const BATCH_LIMIT = 400;

@Injectable({
  providedIn: 'root',
})
export class PayrollService {
  private readonly firestore = inject(Firestore);
  private readonly authService = inject(AuthService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly advanceService = inject(AdvanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly calculation = inject(PayrollCalculationService);
  private readonly payrollsRef = collection(this.firestore, COLLECTIONS.payrolls);
  private readonly adjustmentsRef = collection(this.firestore, COLLECTIONS.payrollAdjustments);

  async getPayrollsByPeriod(year: number, month: number): Promise<Payroll[]> {
    const snapshot = await getDocs(
      query(this.payrollsRef, where('year', '==', year), where('month', '==', month)),
    );
    return snapshot.docs.map((item) => this.mapPayroll({ id: item.id, ...item.data() }));
  }

  async getPayrollsByYear(year: number): Promise<Payroll[]> {
    const snapshot = await getDocs(query(this.payrollsRef, where('year', '==', year)));
    return snapshot.docs.map((item) => this.mapPayroll({ id: item.id, ...item.data() }));
  }

  async getPayrollsInDateRange(startDate: Date, endDate: Date): Promise<Payroll[]> {
    const startYear = Number(bangkokDateKey(startDate).slice(0, 4));
    const endYear = Number(bangkokDateKey(endDate).slice(0, 4));
    const rows: Payroll[] = [];
    for (let year = startYear; year <= endYear; year += 1) {
      rows.push(...(await this.getPayrollsByYear(year)));
    }
    const startKey = bangkokDateKey(startDate).slice(0, 7);
    const endKey = bangkokDateKey(endDate).slice(0, 7);
    return rows.filter((item) => {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      return key >= startKey && key <= endKey;
    });
  }

  async getPayrollsByEmployee(employeeId: string): Promise<Payroll[]> {
    const snapshot = await getDocs(
      query(this.payrollsRef, where('employeeId', '==', employeeId)),
    );
    return snapshot.docs
      .map((item) => this.mapPayroll({ id: item.id, ...item.data() }))
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }

  async getPayrollById(id: string): Promise<Payroll | null> {
    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.payrolls, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapPayroll({ id: snapshot.id, ...snapshot.data() });
  }

  async findPayroll(employeeId: string, year: number, month: number): Promise<Payroll | null> {
    const rows = await this.getPayrollsByEmployee(employeeId);
    return (
      rows.find(
        (item) => item.year === year && item.month === month && item.status !== 'CANCELLED' && !item.periodKey,
      ) ??
      rows.find((item) => item.year === year && item.month === month && item.status !== 'CANCELLED') ??
      null
    );
  }

  async findPayrollByRange(employeeId: string, start: Date, end: Date): Promise<Payroll | null> {
    const rows = await this.getPayrollsByPeriodKey(payrollPeriodKey(start, end));
    return rows.find((item) => item.employeeId === employeeId && item.status !== 'CANCELLED') ?? null;
  }

  async getPayrollsByPeriodKey(periodKey: string): Promise<Payroll[]> {
    const snapshot = await getDocs(query(this.payrollsRef, where('periodKey', '==', periodKey)));
    return snapshot.docs.map((item) => this.mapPayroll({ id: item.id, ...item.data() }));
  }

  async previewForPeriod(start: Date, end: Date): Promise<
    Array<{
      employee: Employee;
      existing?: Payroll;
      workDays: number;
      halfDays: number;
      overtimeHours: number;
      basePay: number;
      overtimePay: number;
      advance: number;
      netPay: number;
    }>
  > {
    const { employees, attendancesByEmployee, payrollByEmployee, pendingByEmployee } =
      await this.loadPeriodContext(start, end);
    const previews = [];
    for (const employee of employees) {
      const existing = payrollByEmployee.get(employee.id);
      const summary = this.calculation.summarizeForEmployee(
        employee,
        attendancesByEmployee.get(employee.id) ?? [],
        { start, end },
      );
      if (!hasPayableWork(summary) && !existing) {
        continue;
      }
      const totals = calculatePayrollTotals(
        summary.basePay,
        summary.overtimePay,
        [],
        this.sumAdvances(pendingByEmployee.get(employee.id) ?? []),
      );
      previews.push({
        employee,
        existing,
        workDays: summary.totalWorkDays,
        halfDays: summary.totalHalfDays,
        overtimeHours: summary.totalOvertimeHours,
        basePay: summary.basePay,
        overtimePay: summary.overtimePay,
        advance: totals.advanceDeduction,
        netPay: totals.netPay,
      });
    }
    return previews;
  }

  payrollDateRange(payroll: Payroll): { start: Date; end: Date } {
    if (payroll.periodStart && payroll.periodEnd) {
      return { start: payroll.periodStart.toDate(), end: payroll.periodEnd.toDate() };
    }
    return monthRangeBangkok(payroll.year, payroll.month);
  }

  async getAdjustments(payrollId: string): Promise<PayrollAdjustment[]> {
    const snapshot = await getDocs(
      query(this.adjustmentsRef, where('payrollId', '==', payrollId)),
    );
    return snapshot.docs.map((item) => this.mapAdjustment({ id: item.id, ...item.data() }));
  }

  async generateForPeriod(
    year: number,
    month: number,
    employeeIds?: string[],
    range?: { start: Date; end: Date; payDate?: Date },
  ): Promise<{
    created: string[];
    existing: Payroll[];
  }> {
    const { start, end } = range ?? monthRangeBangkok(year, month);
    const periodKey = payrollPeriodKey(start, end);
    const { employees, attendancesByEmployee, payrollByEmployee, pendingByEmployee } =
      await this.loadPeriodContext(start, end, employeeIds);
    const existing: Payroll[] = [];
    const toCreate: { employee: Employee; rows: Attendance[]; pending: EmployeeAdvance[] }[] = [];
    for (const employee of employees) {
      const found = payrollByEmployee.get(employee.id);
      if (found) {
        existing.push(found);
        continue;
      }
      const rows = attendancesByEmployee.get(employee.id) ?? [];
      const summary = this.calculation.summarize(
        rows,
        snapshotEmployeeRates(employee),
        { start, end },
      );
      if (!hasPayableWork(summary)) {
        continue;
      }
      toCreate.push({ employee, rows, pending: pendingByEmployee.get(employee.id) ?? [] });
    }

    const created: string[] = [];
    for (const chunk of this.chunk(toCreate, BATCH_LIMIT)) {
      const batch = writeBatch(this.firestore);
      const actor = this.authService.currentUser()?.uid;
      for (const item of chunk) {
        const employee = item.employee;
        const rows = item.rows;
        const pending = item.pending;
        const rates = snapshotEmployeeRates(employee);
        const summary = this.calculation.summarize(rows, rates, { start, end });
        const totals = calculatePayrollTotals(summary.basePay, summary.overtimePay, [], this.sumAdvances(pending));
        const ref = doc(this.payrollsRef);
        batch.set(ref, this.toPayload({
          employeeId: employee.id,
          year,
          month,
          periodStart: Timestamp.fromDate(start),
          periodEnd: Timestamp.fromDate(end),
          payDate: range?.payDate ? Timestamp.fromDate(range.payDate) : undefined,
          periodKey,
          ...rates,
          ...summary,
          ...totals,
          selectedAdvanceIds: pending.map((item) => item.id),
          status: 'CALCULATED',
          calculatedAt: Timestamp.now(),
        }, ref.id, true, actor));
        created.push(ref.id);
      }
      await batch.commit();
    }
    return { created, existing };
  }

  async recalculate(id: string, refreshRates = true): Promise<void> {
    const payroll = await this.requireEditable(id);
    const employee = await this.employeeService.getEmployeeById(payroll.employeeId);
    if (!employee) {
      throw new Error('EMPLOYEE_NOT_FOUND');
    }
    const { start, end } = this.payrollDateRange(payroll);
    const rows = await this.attendanceService.getAttendancesByEmployeeAndDateRange(
      payroll.employeeId,
      start,
      end,
    );
    const rates = refreshRates
      ? snapshotEmployeeRates(employee)
      : {
          employmentTypeSnapshot: payroll.employmentTypeSnapshot,
          dailyRateSnapshot: payroll.dailyRateSnapshot,
          monthlySalarySnapshot: payroll.monthlySalarySnapshot,
          overtimeRateSnapshot: payroll.overtimeRateSnapshot,
        };
    const summary = this.calculation.summarize(rows, rates, { start, end });
    const adjustments = await this.getAdjustments(id);
    const advances = await this.loadSelectedAdvances(payroll.selectedAdvanceIds);
    const totals = calculatePayrollTotals(
      summary.basePay,
      summary.overtimePay,
      adjustments,
      this.sumAdvances(advances),
    );
    await updateDoc(
      doc(this.firestore, COLLECTIONS.payrolls, id),
      omitUndefined({
        ...rates,
        ...summary,
        ...totals,
        status: 'CALCULATED',
        calculatedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: this.authService.currentUser()?.uid,
      }) as DocumentData,
    );
  }

  async revertToDraft(id: string): Promise<void> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || payroll.status !== 'CALCULATED') {
      throw new Error('PAYROLL_LOCKED');
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.payrolls, id), {
      status: 'DRAFT',
      updatedAt: serverTimestamp(),
      updatedBy: this.authService.currentUser()?.uid,
    });
  }

  async updateNoteAndAdvances(id: string, note: string | undefined, selectedAdvanceIds: string[]): Promise<void> {
    const payroll = await this.requireEditable(id);
    const adjustments = await this.getAdjustments(id);
    const advances = await this.loadSelectedAdvances(selectedAdvanceIds);
    const totals = calculatePayrollTotals(
      payroll.basePay,
      payroll.overtimePay,
      adjustments,
      this.sumAdvances(advances),
    );
    await updateDoc(
      doc(this.firestore, COLLECTIONS.payrolls, id),
      omitUndefined({
        note: note?.trim(),
        selectedAdvanceIds,
        ...totals,
        updatedAt: serverTimestamp(),
        updatedBy: this.authService.currentUser()?.uid,
      }) as DocumentData,
    );
  }

  async addAdjustment(
    data: PayrollAdjustmentWriteData,
  ): Promise<{ adjustment: PayrollAdjustment; payroll: Payroll }> {
    await this.requireEditable(data.payrollId);
    if (!(data.amount > 0) || !data.description.trim()) {
      throw new Error('INVALID_ADJUSTMENT');
    }
    const ref = doc(this.adjustmentsRef);
    const adjustment: PayrollAdjustment = {
      id: ref.id,
      payrollId: data.payrollId,
      employeeId: data.employeeId,
      type: data.type,
      category: data.category.trim(),
      description: data.description.trim(),
      amount: roundMoney(data.amount),
    };
    await setDoc(
      ref,
      omitUndefined({
        payrollId: adjustment.payrollId,
        employeeId: adjustment.employeeId,
        type: adjustment.type,
        category: adjustment.category,
        description: adjustment.description,
        amount: adjustment.amount,
        createdAt: serverTimestamp(),
        createdBy: this.authService.currentUser()?.uid,
      }),
    );
    const existing = await this.getAdjustments(data.payrollId);
    const adjustments = existing.some((item) => item.id === adjustment.id)
      ? existing
      : [...existing, adjustment];
    const payroll = await this.refreshTotals(data.payrollId, adjustments);
    return { adjustment, payroll };
  }

  async deleteAdjustment(id: string, payrollId: string): Promise<Payroll> {
    await this.requireEditable(payrollId);
    await deleteDoc(doc(this.firestore, COLLECTIONS.payrollAdjustments, id));
    const remaining = (await this.getAdjustments(payrollId)).filter((item) => item.id !== id);
    return this.refreshTotals(payrollId, remaining);
  }

  async approve(id: string): Promise<void> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || (payroll.status !== 'CALCULATED' && payroll.status !== 'DRAFT')) {
      throw new Error('PAYROLL_LOCKED');
    }
    const actor = this.authService.currentUser()?.uid;
    const carryAmount = payroll.netPay < 0 ? roundMoney(Math.abs(payroll.netPay)) : 0;
    const carryRef = carryAmount > 0 ? doc(this.advancesCollection()) : null;
    await runTransaction(this.firestore, async (tx) => {
      const payrollRef = doc(this.firestore, COLLECTIONS.payrolls, id);
      const snapshot = await tx.get(payrollRef);
      if (!snapshot.exists()) {
        throw new Error('NOT_FOUND');
      }
      const current = this.mapPayroll({ id: snapshot.id, ...snapshot.data() });
      if (current.status === 'APPROVED' || current.status === 'PAID' || current.status === 'CANCELLED') {
        throw new Error('PAYROLL_LOCKED');
      }
      const advanceRefs = current.selectedAdvanceIds.map((advanceId) =>
        doc(this.firestore, COLLECTIONS.employeeAdvances, advanceId),
      );
      const advanceSnaps = await Promise.all(advanceRefs.map((ref) => tx.get(ref)));
      for (const advanceSnap of advanceSnaps) {
        if (!advanceSnap.exists()) {
          continue;
        }
        if (advanceSnap.data()['status'] !== 'PENDING') {
          throw new Error('ADVANCE_LOCKED');
        }
      }
      for (const advanceSnap of advanceSnaps) {
        if (!advanceSnap.exists()) {
          continue;
        }
        tx.update(advanceSnap.ref, {
          status: 'DEDUCTED',
          payrollId: id,
          deductedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: actor,
        });
      }
      if (carryRef && carryAmount > 0) {
        tx.set(carryRef, omitUndefined({
          employeeId: current.employeeId,
          advanceDate: Timestamp.fromDate(startOfDayBangkok(new Date())),
          amount: carryAmount,
          description: `ยกยอดติดลบจากงวด ${payrollDisplayLabel(current)}`,
          note: 'สร้างอัตโนมัติเมื่ออนุมัติ Payroll ที่ยอดสุทธิติดลบ',
          status: 'PENDING',
          sourcePayrollId: id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: actor,
          updatedBy: actor,
        }));
      }
      tx.update(payrollRef, omitUndefined({
        status: 'APPROVED',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actor,
        carriedForwardAmount: carryAmount > 0 ? carryAmount : null,
        carriedForwardAdvanceId: carryRef && carryAmount > 0 ? carryRef.id : null,
      }) as DocumentData);
    });
  }

  async unapprove(id: string): Promise<void> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || payroll.status !== 'APPROVED') {
      throw new Error('PAYROLL_LOCKED');
    }
    const carryId = payroll.carriedForwardAdvanceId;
    const dependents = carryId
      ? (await this.getPayrollsByEmployee(payroll.employeeId)).filter(
          (item) => item.id !== id && item.selectedAdvanceIds.includes(carryId),
        )
      : [];
    if (dependents.some((item) => this.isLocked(item.status))) {
      throw new Error('CARRY_LOCKED');
    }
    const actor = this.authService.currentUser()?.uid;
    await runTransaction(this.firestore, async (tx) => {
      const payrollRef = doc(this.firestore, COLLECTIONS.payrolls, id);
      const carryRef = carryId ? doc(this.firestore, COLLECTIONS.employeeAdvances, carryId) : null;
      const carrySnap = carryRef ? await tx.get(carryRef) : null;
      const otherSnaps = await Promise.all(
        dependents.map((item) => tx.get(doc(this.firestore, COLLECTIONS.payrolls, item.id))),
      );
      const advanceSnaps = await Promise.all(
        payroll.selectedAdvanceIds.map((advanceId) =>
          tx.get(doc(this.firestore, COLLECTIONS.employeeAdvances, advanceId)),
        ),
      );

      if (carrySnap?.exists() && carrySnap.data()['status'] === 'DEDUCTED') {
        throw new Error('CARRY_LOCKED');
      }
      for (const otherSnap of otherSnaps) {
        if (!otherSnap.exists()) {
          continue;
        }
        const current = this.mapPayroll({ id: otherSnap.id, ...otherSnap.data() });
        if (this.isLocked(current.status)) {
          throw new Error('CARRY_LOCKED');
        }
      }

      if (carryRef && carrySnap?.exists()) {
        tx.delete(carryRef);
      }
      for (const otherSnap of otherSnaps) {
        if (!otherSnap.exists()) {
          continue;
        }
        const current = this.mapPayroll({ id: otherSnap.id, ...otherSnap.data() });
        tx.update(otherSnap.ref, {
          selectedAdvanceIds: current.selectedAdvanceIds.filter((item) => item !== carryId),
          updatedAt: serverTimestamp(),
          updatedBy: actor,
        });
      }
      for (const advanceSnap of advanceSnaps) {
        if (!advanceSnap.exists()) {
          continue;
        }
        if (advanceSnap.data()['payrollId'] === id) {
          tx.update(advanceSnap.ref, {
            status: 'PENDING',
            payrollId: null,
            deductedAt: null,
            updatedAt: serverTimestamp(),
            updatedBy: actor,
          });
        }
      }
      tx.update(payrollRef, {
        status: 'CALCULATED',
        approvedAt: null,
        carriedForwardAmount: null,
        carriedForwardAdvanceId: null,
        updatedAt: serverTimestamp(),
        updatedBy: actor,
      });
    });
    for (const other of dependents) {
      if (!this.isLocked(other.status)) {
        await this.refreshTotals(other.id);
      }
    }
  }

  async markPaid(id: string): Promise<void> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || payroll.status !== 'APPROVED') {
      throw new Error('PAYROLL_LOCKED');
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.payrolls, id), {
      status: 'PAID',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: this.authService.currentUser()?.uid,
    });
  }

  async cancel(id: string): Promise<void> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || payroll.status === 'PAID') {
      throw new Error('PAYROLL_LOCKED');
    }
    if (payroll.status === 'APPROVED') {
      await this.unapprove(id);
    }
    await updateDoc(doc(this.firestore, COLLECTIONS.payrolls, id), {
      status: 'CANCELLED',
      updatedAt: serverTimestamp(),
      updatedBy: this.authService.currentUser()?.uid,
    });
  }

  async bulkRecalculate(ids: string[]): Promise<string[]> {
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await this.recalculate(id, true);
      } catch (error) {
        errors.push(this.describe(id, error));
      }
    }
    return errors;
  }

  async bulkApprove(ids: string[]): Promise<string[]> {
    const payrolls = await Promise.all(ids.map((id) => this.getPayrollById(id)));
    const errors: string[] = [];
    payrolls.forEach((item, index) => {
      if (!item) {
        errors.push(`${ids[index]}: ไม่พบรายการ`);
        return;
      }
      if (item.status === 'APPROVED' || item.status === 'PAID') {
        errors.push(`${item.id}: อนุมัติหรือจ่ายแล้ว`);
        return;
      }
      if (item.status === 'CANCELLED') {
        errors.push(`${item.id}: ถูกยกเลิกแล้ว`);
      }
    });
    if (errors.length > 0) {
      return errors;
    }
    for (const id of ids) {
      try {
        await this.approve(id);
      } catch (error) {
        errors.push(this.describe(id, error));
      }
    }
    return errors;
  }

  isLocked(status: PayrollStatus): boolean {
    return status === 'APPROVED' || status === 'PAID' || status === 'CANCELLED';
  }

  private async refreshTotals(
    payrollId: string,
    adjustments?: PayrollAdjustment[],
  ): Promise<Payroll> {
    const payroll = await this.requireEditable(payrollId);
    const rows = adjustments ?? (await this.getAdjustments(payrollId));
    const advances = await this.loadSelectedAdvances(payroll.selectedAdvanceIds);
    const totals = calculatePayrollTotals(
      payroll.basePay,
      payroll.overtimePay,
      rows,
      this.sumAdvances(advances),
    );
    await updateDoc(
      doc(this.firestore, COLLECTIONS.payrolls, payrollId),
      omitUndefined({
        ...totals,
        updatedAt: serverTimestamp(),
        updatedBy: this.authService.currentUser()?.uid,
      }) as DocumentData,
    );
    return { ...payroll, ...totals };
  }

  private async loadSelectedAdvances(ids: string[]): Promise<EmployeeAdvance[]> {
    const rows: EmployeeAdvance[] = [];
    for (const id of ids) {
      const item = await this.advanceService.getAdvanceById(id);
      if (item && item.status !== 'CANCELLED') {
        rows.push(item);
      }
    }
    return rows;
  }

  private advancesCollection() {
    return collection(this.firestore, COLLECTIONS.employeeAdvances);
  }

  private sumAdvances(rows: EmployeeAdvance[]): number {
    return roundMoney(rows.reduce((sum, item) => sum + item.amount, 0));
  }

  private async loadPeriodContext(
    start: Date,
    end: Date,
    employeeIds?: string[],
  ): Promise<{
    employees: Employee[];
    attendancesByEmployee: Map<string, Attendance[]>;
    payrollByEmployee: Map<string, Payroll>;
    pendingByEmployee: Map<string, EmployeeAdvance[]>;
  }> {
    const employees = this.employeeService
      .employees()
      .filter((item) => item.status === 'ACTIVE' && (!employeeIds || employeeIds.includes(item.id)));
    const [attendances, payrolls, pending] = await Promise.all([
      this.attendanceService.getAttendancesByDateRange(start, end),
      this.getPayrollsByPeriodKey(payrollPeriodKey(start, end)),
      this.advanceService.getPendingAdvances(),
    ]);
    const payrollByEmployee = new Map<string, Payroll>();
    for (const payroll of payrolls) {
      if (payroll.status === 'CANCELLED' || payrollByEmployee.has(payroll.employeeId)) {
        continue;
      }
      payrollByEmployee.set(payroll.employeeId, payroll);
    }
    return {
      employees,
      attendancesByEmployee: this.groupByEmployeeId(attendances),
      payrollByEmployee,
      pendingByEmployee: this.groupByEmployeeId(pending),
    };
  }

  private groupByEmployeeId<T extends { employeeId: string }>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.employeeId);
      if (list) {
        list.push(row);
      } else {
        map.set(row.employeeId, [row]);
      }
    }
    return map;
  }

  private async requireEditable(id: string): Promise<Payroll> {
    const payroll = await this.getPayrollById(id);
    if (!payroll || this.isLocked(payroll.status)) {
      throw new Error('PAYROLL_LOCKED');
    }
    return payroll;
  }

  private toPayload(
    data: Record<string, unknown>,
    id: string,
    isCreate: boolean,
    actor?: string,
  ): Record<string, unknown> {
    const payload = omitUndefined({
      ...data,
      selectedAdvanceIds: data['selectedAdvanceIds'] ?? [],
      updatedAt: serverTimestamp(),
      updatedBy: actor,
    });
    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
      payload['createdBy'] = actor;
    }
    return payload;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      result.push(items.slice(i, size + i));
    }
    return result;
  }

  private describe(id: string, error: unknown): string {
    return `${id}: ${mapPayrollError(error)}`;
  }

  private mapPayroll(row: DocumentData): Payroll {
    const status = this.mapStatus(row['status']);
    return {
      id: String(row['id'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      year: Number(row['year'] ?? 0),
      month: Number(row['month'] ?? 0),
      employmentTypeSnapshot: row['employmentTypeSnapshot'] === 'MONTHLY' ? 'MONTHLY' : 'DAILY',
      dailyRateSnapshot: typeof row['dailyRateSnapshot'] === 'number' ? row['dailyRateSnapshot'] : undefined,
      monthlySalarySnapshot:
        typeof row['monthlySalarySnapshot'] === 'number' ? row['monthlySalarySnapshot'] : undefined,
      overtimeRateSnapshot:
        typeof row['overtimeRateSnapshot'] === 'number' ? row['overtimeRateSnapshot'] : undefined,
      payDate: row['payDate'] instanceof Timestamp ? row['payDate'] : undefined,
      periodStart: row['periodStart'] instanceof Timestamp ? row['periodStart'] : undefined,
      periodEnd: row['periodEnd'] instanceof Timestamp ? row['periodEnd'] : undefined,
      periodKey: row['periodKey'] ? String(row['periodKey']) : undefined,
      totalWorkDays: Number(row['totalWorkDays'] ?? row['workDays'] ?? 0),
      totalHalfDays: Number(row['totalHalfDays'] ?? 0),
      totalAbsentDays: Number(row['totalAbsentDays'] ?? 0),
      totalLeaveDays: Number(row['totalLeaveDays'] ?? 0),
      totalNormalHours: Number(row['totalNormalHours'] ?? 0),
      totalOvertimeHours: Number(row['totalOvertimeHours'] ?? 0),
      basePay: Number(row['basePay'] ?? 0),
      overtimePay: Number(row['overtimePay'] ?? 0),
      additionalIncome: Number(row['additionalIncome'] ?? 0),
      bonus: Number(row['bonus'] ?? 0),
      totalIncome: Number(row['totalIncome'] ?? row['grossPay'] ?? 0),
      advanceDeduction: Number(row['advanceDeduction'] ?? 0),
      otherDeduction: Number(row['otherDeduction'] ?? 0),
      totalDeduction: Number(row['totalDeduction'] ?? 0),
      netPay: Number(row['netPay'] ?? 0),
      status,
      selectedAdvanceIds: Array.isArray(row['selectedAdvanceIds'])
        ? row['selectedAdvanceIds'].map((item) => String(item))
        : [],
      carriedForwardAmount:
        typeof row['carriedForwardAmount'] === 'number' ? row['carriedForwardAmount'] : undefined,
      carriedForwardAdvanceId: row['carriedForwardAdvanceId']
        ? String(row['carriedForwardAdvanceId'])
        : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      calculatedAt: row['calculatedAt'] instanceof Timestamp ? row['calculatedAt'] : undefined,
      approvedAt: row['approvedAt'] instanceof Timestamp ? row['approvedAt'] : undefined,
      paidAt: row['paidAt'] instanceof Timestamp ? row['paidAt'] : undefined,
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      updatedBy: row['updatedBy'] ? String(row['updatedBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapStatus(value: unknown): PayrollStatus {
    const statuses: PayrollStatus[] = ['DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED'];
    if (value === 'ADJUSTED') {
      return 'CALCULATED';
    }
    return statuses.includes(value as PayrollStatus) ? (value as PayrollStatus) : 'DRAFT';
  }

  private mapAdjustment(row: DocumentData): PayrollAdjustment {
    return {
      id: String(row['id'] ?? ''),
      payrollId: String(row['payrollId'] ?? ''),
      employeeId: String(row['employeeId'] ?? ''),
      type: row['type'] === 'DEDUCTION' ? 'DEDUCTION' : 'INCOME',
      category: String(row['category'] ?? ''),
      description: String(row['description'] ?? ''),
      amount: Number(row['amount'] ?? 0),
      createdBy: row['createdBy'] ? String(row['createdBy']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
    };
  }
}

export function mapPayrollError(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case 'PAYROLL_LOCKED':
        return 'Payroll นี้ถูกล็อกแล้ว ไม่สามารถแก้ไขได้';
      case 'NEGATIVE_NET':
        return 'ยอดหักมากกว่ารายได้ กรุณาตรวจสอบก่อนอนุมัติ';
      case 'CARRY_LOCKED':
        return 'ไม่สามารถยกเลิกอนุมัติได้ เพราะยอดติดลบถูกนำไปหักในงวดถัดไปแล้ว';
      case 'ADVANCE_LOCKED':
        return 'มีเงินเบิกที่ถูกใช้ไปแล้ว ไม่สามารถอนุมัติได้';
      case 'INVALID_ADJUSTMENT':
        return 'กรุณากรอกรายละเอียดและจำนวนที่มากกว่า 0';
      case 'EMPLOYEE_NOT_FOUND':
        return 'ไม่พบพนักงาน';
      case 'DUPLICATE_PAYROLL':
        return 'มี Payroll ของพนักงานคนนี้ในงวดนี้แล้ว';
      default:
        break;
    }
  }
  console.error('Payroll operation failed', error);
  return 'ไม่สามารถบันทึก Payroll ได้';
}
