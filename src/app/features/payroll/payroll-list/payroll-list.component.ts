import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Attendance, Employee, EMPLOYMENT_TYPE_LABELS, Payroll } from '../../../core/models';
import { AttendanceService } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { PayrollService, mapPayrollError } from '../../../core/services/payroll.service';
import { formatBaht, formatAmount } from '../../../core/utils/form.util';
import { formatPayrollPeriod, monthRangeBangkok, roundMoney, bangkokDateKey } from '../../../core/utils/datetime.util';
import { hasPayableWork, payrollDisplayLabel, payrollListQuery, summarizeAttendanceForPayroll } from '../../../core/utils/payroll.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-payroll-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './payroll-list.component.html',
  styleUrl: './payroll-list.component.scss',
})
export class PayrollListComponent implements OnInit {
  private readonly payrollService = inject(PayrollService);
  private readonly employeeService = inject(EmployeeService);
  private readonly jobService = inject(JobService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly payrolls = signal<Payroll[]>([]);
  readonly attendances = signal<Attendance[]>([]);
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly jobId = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly actingId = signal<string | null>(null);
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index);
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);

  readonly jobOptions = computed(() =>
    [...this.jobService.jobs()].sort((a, b) => a.jobCode.localeCompare(b.jobCode, 'th', { numeric: true })),
  );

  readonly visibleRows = computed(() => {
    const jobId = this.jobId();
    return this.payrolls()
      .map((payroll) => this.toDisplayRow(payroll, jobId || undefined))
      .filter((row) => row.visible);
  });

  readonly periodLabel = computed(() => formatPayrollPeriod(this.year(), this.month()));
  readonly summary = computed(() => {
    const rows = this.visibleRows().filter((row) => row.payroll.status !== 'CANCELLED');
    return {
      count: rows.length,
      base: roundMoney(rows.reduce((sum, row) => sum + row.base, 0)),
      ot: roundMoney(rows.reduce((sum, row) => sum + row.ot, 0)),
      extra: roundMoney(rows.reduce((sum, row) => sum + row.extra, 0)),
      deduction: roundMoney(rows.reduce((sum, row) => sum + row.deduction, 0)),
      net: roundMoney(rows.reduce((sum, row) => sum + row.net, 0)),
    };
  });

  readonly listQuery = computed(() => payrollListQuery(this.year(), this.month(), this.jobId()));

  async ngOnInit(): Promise<void> {
    this.applyQuery(this.route.snapshot.queryParamMap);
    await this.reload();
    await this.syncQuery();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.selected.set(new Set());
    try {
      const rows = await this.payrollService.getPayrollsByPeriod(this.year(), this.month());
      let { start, end } = monthRangeBangkok(this.year(), this.month());
      for (const payroll of rows) {
        const range = this.payrollService.payrollDateRange(payroll);
        if (range.start.getTime() < start.getTime()) {
          start = range.start;
        }
        if (range.end.getTime() > end.getTime()) {
          end = range.end;
        }
      }
      const attendances = await this.attendanceService.getAttendancesByDateRange(start, end);
      this.payrolls.set(rows);
      this.attendances.set(attendances);
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลด Payroll ได้');
    } finally {
      this.loading.set(false);
    }
  }

  employee(id: string): Employee | undefined {
    return this.employeeService.employees().find((item) => item.id === id);
  }

  employeeName(id: string): string {
    const item = this.employee(id);
    return item ? `${item.firstName} ${item.lastName}`.trim() : id;
  }

  employeeCode(id: string): string {
    return this.employee(id)?.employeeCode ?? '-';
  }

  money(value: number): string {
    return formatBaht(value);
  }

  amount(value: number): string {
    return formatAmount(value);
  }

  periodRange(item: Payroll): string {
    return payrollDisplayLabel(item);
  }

  setMonth(value: number): void {
    this.month.set(value);
    void this.onFilterPeriodChange();
  }

  setYear(value: number): void {
    this.year.set(value);
    void this.onFilterPeriodChange();
  }

  setJob(value: string): void {
    this.jobId.set(value);
    this.selected.set(new Set());
    void this.syncQuery();
  }

  private toDisplayRow(payroll: Payroll, jobId?: string): {
    payroll: Payroll;
    visible: boolean;
    workDays: number;
    halfDays: number;
    overtimeHours: number;
    base: number;
    ot: number;
    extra: number;
    deduction: number;
    net: number;
    income: number;
  } {
    const extra = payroll.additionalIncome + payroll.bonus;
    if (!jobId) {
      return {
        payroll,
        visible: true,
        workDays: payroll.totalWorkDays,
        halfDays: payroll.totalHalfDays,
        overtimeHours: payroll.totalOvertimeHours,
        base: payroll.basePay,
        ot: payroll.overtimePay,
        extra,
        deduction: payroll.totalDeduction,
        net: payroll.netPay,
        income: payroll.totalIncome,
      };
    }
    const range = this.payrollService.payrollDateRange(payroll);
    const jobRows = this.attendances().filter(
      (item) =>
        item.employeeId === payroll.employeeId &&
        item.jobId === jobId &&
        this.inRange(item, range.start, range.end),
    );
    const summary = summarizeAttendanceForPayroll(
      jobRows,
      {
        employmentTypeSnapshot: payroll.employmentTypeSnapshot,
        dailyRateSnapshot: payroll.dailyRateSnapshot,
        monthlySalarySnapshot: payroll.monthlySalarySnapshot,
        overtimeRateSnapshot: payroll.overtimeRateSnapshot,
      },
      range,
    );
    const base = summary.basePay;
    const ot = summary.overtimePay;
    const income = roundMoney(base + ot + extra);
    const deduction = payroll.totalDeduction;
    return {
      payroll,
      visible: hasPayableWork(summary),
      workDays: summary.totalWorkDays,
      halfDays: summary.totalHalfDays,
      overtimeHours: summary.totalOvertimeHours,
      base,
      ot,
      extra,
      deduction,
      net: roundMoney(income - deduction),
      income,
    };
  }

  private inRange(item: Attendance, start: Date, end: Date): boolean {
    const key = bangkokDateKey(item.workDate.toDate());
    return key >= bangkokDateKey(start) && key <= bangkokDateKey(end);
  }

  private applyQuery(params: { get(name: string): string | null }): void {
    const year = Number(params.get('year'));
    const month = Number(params.get('month'));
    if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
      this.year.set(year);
    }
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      this.month.set(month);
    }
    this.jobId.set(params.get('job') ?? '');
  }

  private async onFilterPeriodChange(): Promise<void> {
    await this.syncQuery();
    await this.reload();
  }

  private async syncQuery(): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: this.listQuery(),
      replaceUrl: true,
    });
  }

  monthName(month: number): string {
    return formatPayrollPeriod(2026, month).replace(/\s+\d+$/, '');
  }

  toggle(id: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selected.set(next);
  }

  toggleAll(checked: boolean): void {
    this.selected.set(checked ? new Set(this.visibleRows().map((row) => row.payroll.id)) : new Set());
  }

  isChecked(id: string): boolean {
    return this.selected().has(id);
  }

  onCheck(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toggle(id, input.checked);
  }

  onCheckAll(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toggleAll(input.checked);
  }

  async bulkRecalculate(): Promise<void> {
    const ids = [...this.selected()];
    if (ids.length === 0) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'คำนวณใหม่',
      message: `คำนวณใหม่จาก Attendance สำหรับ ${ids.length} รายการ? Rate snapshot จะอัปเดตจากข้อมูลพนักงานปัจจุบัน`,
      confirmLabel: 'คำนวณ',
    });
    if (!confirmed) {
      return;
    }
    const errors = await this.payrollService.bulkRecalculate(ids);
    if (errors.length > 0) {
      this.toast.error(errors.join('\n'));
    } else {
      this.toast.success('คำนวณรายการที่เลือกแล้ว');
    }
    await this.reload();
  }

  async bulkApprove(): Promise<void> {
    const ids = [...this.selected()];
    const approvable = this.payrolls().filter(
      (item) => ids.includes(item.id) && (item.status === 'DRAFT' || item.status === 'CALCULATED'),
    );
    if (approvable.length === 0) {
      this.toast.warning('รายการที่เลือกอนุมัติ จ่ายแล้ว หรือยกเลิกแล้ว ไม่สามารถอนุมัติซ้ำได้');
      return;
    }
    const negatives = approvable.filter((item) => item.netPay < 0);
    const extra =
      negatives.length === 0
        ? ''
        : `\n\nมี ${negatives.length} รายที่ยอดติดลบ จะยกยอดไปรอหักรอบถัดไป และงวดนี้จ่าย 0 บาท:\n` +
          negatives
            .map((item) => `${this.employeeName(item.employeeId)} ${this.money(item.netPay)}`)
            .join('\n');
    const skipped = ids.length - approvable.length;
    const skipNote = skipped > 0 ? `\n\nข้าม ${skipped} รายการที่อนุมัติหรือจ่ายแล้ว` : '';
    const confirmed = await this.confirmDialog.confirm({
      title: negatives.length > 0 ? 'อนุมัติและยกยอดติดลบ' : 'อนุมัติหลายรายการ',
      message: `ยืนยันอนุมัติ Payroll ${approvable.length} รายการของงวด ${this.periodLabel()}?${extra}${skipNote}`,
      confirmLabel: negatives.length > 0 ? 'อนุมัติและยกยอด' : 'อนุมัติ',
    });
    if (!confirmed) {
      return;
    }
    try {
      const errors = await this.payrollService.bulkApprove(approvable.map((item) => item.id));
      if (errors.length > 0) {
        this.toast.error(`มีรายการที่ต้องแก้:\n${errors.join('\n')}`);
      } else {
        this.toast.success(`อนุมัติแล้ว ${approvable.length} รายการ`);
      }
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
    await this.reload();
  }

  async approveOne(payroll: Payroll): Promise<void> {
    const negative = payroll.netPay < 0;
    const confirmed = negative
      ? await this.confirmDialog.confirm({
          title: 'ยอดสุทธิติดลบ',
          message: `ยอดสุทธิของ ${this.employeeName(payroll.employeeId)} งวด ${this.periodRange(payroll)} คือ ${this.money(payroll.netPay)} ต้องการอนุมัติและยกยอดติดลบ ${this.money(Math.abs(payroll.netPay))} ไปรอหักรอบถัดไปหรือไม่? งวดนี้จะจ่าย 0 บาท`,
          confirmLabel: 'อนุมัติและยกยอด',
        })
      : await this.confirmDialog.confirm({
          title: 'อนุมัติ Payroll',
          message: `ยืนยันการอนุมัติ Payroll ของ ${this.employeeName(payroll.employeeId)} งวด ${this.periodRange(payroll)}?`,
          confirmLabel: 'อนุมัติ',
        });
    if (!confirmed) {
      return;
    }
    this.actingId.set(payroll.id);
    try {
      await this.payrollService.approve(payroll.id);
      this.toast.success(negative ? 'อนุมัติแล้ว และยกยอดติดลบไปรอหักรอบถัดไป' : 'อนุมัติ Payroll แล้ว');
      await this.reload();
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    } finally {
      this.actingId.set(null);
    }
  }

  async markPaidOne(payroll: Payroll): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'บันทึกว่าจ่ายแล้ว',
      message: `ยืนยันว่าจ่ายเงินให้ ${this.employeeName(payroll.employeeId)} งวด ${this.periodRange(payroll)} แล้ว? เมื่อจ่ายแล้วจะไม่สามารถแก้ไข Payroll นี้ได้โดยตรง`,
      confirmLabel: 'จ่ายแล้ว',
    });
    if (!confirmed) {
      return;
    }
    this.actingId.set(payroll.id);
    try {
      await this.payrollService.markPaid(payroll.id);
      this.toast.success('บันทึกว่าจ่ายแล้ว');
      await this.reload();
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    } finally {
      this.actingId.set(null);
    }
  }

  protected readonly mapPayrollError = mapPayrollError;
}
