import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { combineLatest, filter, firstValueFrom, take } from 'rxjs';
import { Employee, EMPLOYMENT_TYPE_LABELS, Payroll } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { PayrollService, mapPayrollError } from '../../../core/services/payroll.service';
import { formatBaht, formatAmount, toDateInputValue } from '../../../core/utils/form.util';
import {
  defaultPayDate,
  formatPayrollRangeLabel,
  PayrollCutPreset,
  payrollCutRange,
  roundMoney,
} from '../../../core/utils/datetime.util';
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
  private readonly jobService = inject(JobService);
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
  readonly jobId = signal('');
  readonly selected = signal(new Set<string>());
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index);
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);

  readonly creatableRows = computed(() => this.rows().filter((row) => !row.existing));

  readonly selectedRows = computed(() => {
    const selected = this.selected();
    return this.creatableRows().filter((row) => selected.has(row.employee.id));
  });

  readonly totals = computed(() => {
    const rows = this.selectedRows();
    const income = roundMoney(rows.reduce((sum, row) => sum + row.basePay + row.overtimePay, 0));
    const deduction = roundMoney(rows.reduce((sum, row) => sum + row.advance, 0));
    return {
      count: rows.length,
      income,
      deduction,
      net: roundMoney(rows.reduce((sum, row) => sum + row.netPay, 0)),
    };
  });

  readonly allCreatableSelected = computed(() => {
    const rows = this.creatableRows();
    const selected = this.selected();
    return rows.length > 0 && rows.every((row) => selected.has(row.employee.id));
  });

  readonly someCreatableSelected = computed(() => {
    const rows = this.creatableRows();
    const selected = this.selected();
    return rows.some((row) => selected.has(row.employee.id)) && !this.allCreatableSelected();
  });

  readonly jobOptions = computed(() =>
    [...this.jobService.jobs()].sort((a, b) => a.jobCode.localeCompare(b.jobCode, 'th', { numeric: true })),
  );

  private readonly employeesLoaded$ = toObservable(this.employeeService.loaded);
  private readonly jobsLoaded$ = toObservable(this.jobService.loaded);
  private previewRequest = 0;

  async ngOnInit(): Promise<void> {
    this.syncPayDate();
    await firstValueFrom(
      combineLatest([this.employeesLoaded$, this.jobsLoaded$]).pipe(
        filter(([employeesLoaded, jobsLoaded]) => employeesLoaded && jobsLoaded),
        take(1),
      ),
    );
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

  setJob(value: string): void {
    this.jobId.set(value);
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
    const request = ++this.previewRequest;
    this.loading.set(true);
    try {
      const { start, end } = this.range();
      if (start.getTime() > end.getTime()) {
        this.toast.error('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
        if (request === this.previewRequest) {
          this.rows.set([]);
          this.selected.set(new Set());
        }
        return;
      }
      const previews = await this.payrollService.previewForPeriod(start, end, this.jobId() || undefined);
      if (request !== this.previewRequest) {
        return;
      }
      this.rows.set(previews);
      this.selected.set(new Set(previews.filter((row) => !row.existing).map((row) => row.employee.id)));
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดตัวอย่าง Payroll ได้');
    } finally {
      if (request === this.previewRequest) {
        this.loading.set(false);
      }
    }
  }

  isSelected(employeeId: string): boolean {
    return this.selected().has(employeeId);
  }

  onCheck(employeeId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selected());
    if (checked) {
      next.add(employeeId);
    } else {
      next.delete(employeeId);
    }
    this.selected.set(next);
  }

  onCheckAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selected.set(checked ? new Set(this.creatableRows().map((row) => row.employee.id)) : new Set());
  }

  async generate(): Promise<void> {
    const employeeIds = this.selectedRows().map((row) => row.employee.id);
    if (employeeIds.length === 0) {
      this.toast.warning('เลือกพนักงานที่ต้องการสร้าง Payroll ก่อน');
      return;
    }
    this.saving.set(true);
    try {
      const { start, end } = this.range();
      const jobId = this.jobId() || undefined;
      const result = await this.payrollService.generateForPeriod(
        this.year(),
        this.month(),
        employeeIds,
        {
          start,
          end,
          payDate: new Date(`${this.payDate()}T00:00:00`),
          jobId,
        },
      );
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
