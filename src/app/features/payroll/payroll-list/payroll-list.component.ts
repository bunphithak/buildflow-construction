import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Employee, EMPLOYMENT_TYPE_LABELS, Payroll } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { PayrollService, mapPayrollError } from '../../../core/services/payroll.service';
import { formatBaht, formatAmount } from '../../../core/utils/form.util';
import { formatPayrollPeriod } from '../../../core/utils/datetime.util';
import { payrollDisplayLabel } from '../../../core/utils/payroll.util';
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
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly loading = signal(true);
  readonly payrolls = signal<Payroll[]>([]);
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly selected = signal<Set<string>>(new Set());
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - 2 + index);
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);

  readonly periodLabel = computed(() => formatPayrollPeriod(this.year(), this.month()));
  readonly summary = computed(() => {
    const rows = this.payrolls().filter((item) => item.status !== 'CANCELLED');
    return {
      count: rows.length,
      base: rows.reduce((sum, item) => sum + item.basePay, 0),
      ot: rows.reduce((sum, item) => sum + item.overtimePay, 0),
      extra: rows.reduce((sum, item) => sum + item.additionalIncome + item.bonus, 0),
      deduction: rows.reduce((sum, item) => sum + item.totalDeduction, 0),
      net: rows.reduce((sum, item) => sum + item.netPay, 0),
    };
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.selected.set(new Set());
    try {
      const rows = await this.payrollService.getPayrollsByPeriod(this.year(), this.month());
      this.payrolls.set(rows);
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
    this.selected.set(checked ? new Set(this.payrolls().map((item) => item.id)) : new Set());
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
    if (ids.length === 0) {
      return;
    }
    const negatives = this.payrolls().filter((item) => ids.includes(item.id) && item.netPay < 0);
    const extra =
      negatives.length === 0
        ? ''
        : `\n\nมี ${negatives.length} รายที่ยอดติดลบ จะยกยอดไปรอหักรอบถัดไป และงวดนี้จ่าย 0 บาท:\n` +
          negatives
            .map((item) => `${this.employeeName(item.employeeId)} ${this.money(item.netPay)}`)
            .join('\n');
    const confirmed = await this.confirmDialog.confirm({
      title: negatives.length > 0 ? 'อนุมัติและยกยอดติดลบ' : 'อนุมัติหลายรายการ',
      message: `ยืนยันอนุมัติ Payroll ${ids.length} รายการของงวด ${this.periodLabel()}?${extra}`,
      confirmLabel: negatives.length > 0 ? 'อนุมัติและยกยอด' : 'อนุมัติ',
    });
    if (!confirmed) {
      return;
    }
    const errors = await this.payrollService.bulkApprove(ids);
    if (errors.length > 0) {
      this.toast.error(`มีรายการที่ต้องแก้:\n${errors.join('\n')}`);
    } else {
      this.toast.success('อนุมัติรายการที่เลือกแล้ว');
    }
    await this.reload();
  }

  protected readonly mapPayrollError = mapPayrollError;
}
