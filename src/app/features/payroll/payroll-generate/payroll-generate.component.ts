import { Component, inject, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { Attendance, Employee, EMPLOYMENT_TYPE_LABELS, Payroll } from '../../../core/models';
import { AdvanceService } from '../../../core/services/advance.service';
import { AttendanceService } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { PayrollCalculationService } from '../../../core/services/payroll-calculation.service';
import { PayrollService, mapPayrollError } from '../../../core/services/payroll.service';
import { formatBaht, formatAmount, toDateInputValue } from '../../../core/utils/form.util';
import {
  defaultPayDate,
  formatPayrollRangeLabel,
  PayrollCutPreset,
  payrollCutRange,
} from '../../../core/utils/datetime.util';
import { calculatePayrollTotals, hasPayableWork } from '../../../core/utils/payroll.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

interface PreviewRow {
  employee: Employee;
  existing?: Payroll;
  workDays: number;
  halfDays: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  advance: number;
  netPay: number;
}

@Component({
  selector: 'app-payroll-generate',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, EmptyStateComponent, LoadingStateComponent],
  templateUrl: './payroll-generate.component.html',
  styleUrl: './payroll-generate.component.scss',
})
export class PayrollGenerateComponent implements OnInit {
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly advanceService = inject(AdvanceService);
  private readonly calculation = inject(PayrollCalculationService);
  private readonly payrollService = inject(PayrollService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly rows = signal<PreviewRow[]>([]);
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly preset = signal<PayrollCutPreset>(new Date().getDate() <= 15 ? 'first_half' : 'second_half');
  readonly customStart = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly customEnd = signal(toDateInputValue(new Date()));
  readonly payDate = signal(toDateInputValue(this.currentPayDate()));
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index);
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);

  private readonly employeesLoaded$ = toObservable(this.employeeService.loaded);

  async ngOnInit(): Promise<void> {
    this.syncPayDate();
    await firstValueFrom(this.employeesLoaded$.pipe(filter(Boolean), take(1)));
    await this.preview();
  }

  range() {
    return payrollCutRange(this.year(), this.month(), this.preset(), this.customStart(), this.customEnd());
  }

  periodLabel(): string {
    const { start, end } = this.range();
    return formatPayrollRangeLabel(start, end, new Date(`${this.payDate()}T00:00:00`));
  }

  monthName(month: number): string {
    return new Intl.DateTimeFormat('th-TH', { month: 'long' }).format(new Date(2026, month - 1, 1));
  }

  money(value: number): string {
    return formatBaht(value);
  }

  amount(value: number): string {
    return formatAmount(value);
  }

  setPreset(value: string): void {
    this.preset.set(value as PayrollCutPreset);
    this.syncPayDate();
    void this.preview();
  }

  onMonthYearChange(): void {
    this.syncPayDate();
    void this.preview();
  }

  private currentPayDate(): Date {
    const { end } = payrollCutRange(
      this.year(),
      this.month(),
      this.preset(),
      this.customStart(),
      this.customEnd(),
    );
    return defaultPayDate(end, this.preset());
  }

  private syncPayDate(): void {
    this.payDate.set(toDateInputValue(this.currentPayDate()));
  }

  async preview(): Promise<void> {
    this.loading.set(true);
    try {
      const { start, end } = this.range();
      if (start.getTime() > end.getTime()) {
        this.toast.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
        this.rows.set([]);
        return;
      }
      const employees = this.employeeService.employees().filter((item) => item.status === 'ACTIVE');
      const previews: PreviewRow[] = [];
      for (const employee of employees) {
        const existing = await this.payrollService.findPayrollByRange(employee.id, start, end);
        const attendances: Attendance[] = await this.attendanceService.getAttendancesByEmployeeAndDateRange(
          employee.id,
          start,
          end,
        );
        const pending = await this.advanceService.getPendingByEmployee(employee.id);
        const summary = this.calculation.summarizeForEmployee(employee, attendances, { start, end });
        if (!hasPayableWork(summary) && !existing) {
          continue;
        }
        const totals = calculatePayrollTotals(
          summary.basePay,
          summary.overtimePay,
          [],
          pending.reduce((sum, item) => sum + item.amount, 0),
        );
        previews.push({
          employee,
          existing: existing ?? undefined,
          workDays: summary.totalWorkDays,
          halfDays: summary.totalHalfDays,
          overtimeHours: summary.totalOvertimeHours,
          basePay: summary.basePay,
          overtimePay: summary.overtimePay,
          advance: totals.advanceDeduction,
          netPay: totals.netPay,
        });
      }
      this.rows.set(previews);
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดตัวอย่าง Payroll ได้');
    } finally {
      this.loading.set(false);
    }
  }

  async generate(): Promise<void> {
    this.saving.set(true);
    try {
      const { start, end } = this.range();
      const result = await this.payrollService.generateForPeriod(this.year(), this.month(), undefined, {
        start,
        end,
        payDate: new Date(`${this.payDate()}T00:00:00`),
      });
      if (result.created.length === 0 && result.existing.length > 0) {
        this.toast.warning('มี Payroll ของพนักงานในช่วงตัดยอดนี้แล้ว');
      } else if (result.created.length === 0) {
        this.toast.warning('ไม่มีพนักงานที่มีลงเวลาในช่วงตัดยอดนี้');
      } else {
        this.toast.success(`สร้าง Payroll ${result.created.length} รายการ`);
      }
      await this.router.navigateByUrl('/payroll');
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
