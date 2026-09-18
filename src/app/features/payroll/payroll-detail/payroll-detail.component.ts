import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Attendance,
  DEDUCTION_CATEGORIES,
  Employee,
  EmployeeAdvance,
  EMPLOYMENT_TYPE_LABELS,
  INCOME_CATEGORIES,
  Payroll,
  PayrollAdjustment,
} from '../../../core/models';
import { AuthService } from '../../../core/auth/auth.service';
import { AdvanceService } from '../../../core/services/advance.service';
import { AttendanceService, attendanceTimeLabel } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { PayrollService, mapPayrollError } from '../../../core/services/payroll.service';
import { formatBaht } from '../../../core/utils/form.util';
import { payrollDisplayLabel, snapshotEmployeeRates, summarizeAttendanceForPayroll } from '../../../core/utils/payroll.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-payroll-detail',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './payroll-detail.component.html',
  styleUrl: './payroll-detail.component.scss',
})
export class PayrollDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly payrollService = inject(PayrollService);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly advanceService = inject(AdvanceService);
  private readonly jobService = inject(JobService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly loading = signal(true);
  readonly payroll = signal<Payroll | null>(null);
  readonly employee = signal<Employee | null>(null);
  readonly attendances = signal<Attendance[]>([]);
  readonly adjustments = signal<PayrollAdjustment[]>([]);
  readonly pendingAdvances = signal<EmployeeAdvance[]>([]);
  readonly selectedAdvanceIds = signal<string[]>([]);
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly incomeCategories = INCOME_CATEGORIES;
  readonly deductionCategories = DEDUCTION_CATEGORIES;
  readonly isAdmin = computed(() => this.authService.hasRole(['ADMIN']));
  readonly locked = computed(() => {
    const status = this.payroll()?.status;
    return !status || this.payrollService.isLocked(status);
  });
  readonly incomes = computed(() => this.adjustments().filter((item) => item.type === 'INCOME'));
  readonly deductions = computed(() => this.adjustments().filter((item) => item.type === 'DEDUCTION'));
  readonly negative = computed(() => (this.payroll()?.netPay ?? 0) < 0);
  readonly liveAttendanceSummary = computed(() => {
    const payroll = this.payroll();
    const employee = this.employee();
    if (!employee || !payroll) {
      return null;
    }
    return summarizeAttendanceForPayroll(
      this.attendances(),
      snapshotEmployeeRates(employee),
      this.payrollService.payrollDateRange(payroll),
    );
  });
  readonly attendanceOutOfDate = computed(() => {
    const payroll = this.payroll();
    const live = this.liveAttendanceSummary();
    if (!payroll || !live || this.locked()) {
      return false;
    }
    return (
      payroll.totalWorkDays !== live.totalWorkDays ||
      payroll.totalHalfDays !== live.totalHalfDays ||
      payroll.totalOvertimeHours !== live.totalOvertimeHours
    );
  });

  readonly incomeForm = this.fb.nonNullable.group({
    category: ['โบนัส', Validators.required],
    description: ['', Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
  });

  readonly deductionForm = this.fb.nonNullable.group({
    category: ['หักอื่นๆ', Validators.required],
    description: ['', Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/payroll');
      return;
    }
    await this.load(id);
  }

  periodLabel(item: Payroll): string {
    return payrollDisplayLabel(item);
  }

  fullName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  money(value: number): string {
    return formatBaht(value);
  }

  jobName(id: string): string {
    const job = this.jobService.jobs().find((item) => item.id === id);
    return job ? `${job.jobCode} ${job.jobName}` : id;
  }

  times(item: Attendance): { clockIn: string; clockOut: string } {
    return attendanceTimeLabel(item);
  }

  toggleAdvance(id: string, checked: boolean): void {
    const next = new Set(this.selectedAdvanceIds());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectedAdvanceIds.set([...next]);
  }

  onAdvanceCheck(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.toggleAdvance(id, input.checked);
  }

  async saveAdvances(): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    try {
      await this.payrollService.updateNoteAndAdvances(
        payroll.id,
        payroll.note,
        this.selectedAdvanceIds(),
      );
      this.toast.success('บันทึกรายการเงินเบิกแล้ว');
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async addIncome(): Promise<void> {
    await this.addAdjustment('INCOME', this.incomeForm);
  }

  async addDeduction(): Promise<void> {
    await this.addAdjustment('DEDUCTION', this.deductionForm);
  }

  async removeAdjustment(id: string): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    try {
      await this.payrollService.deleteAdjustment(id, payroll.id);
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async recalculate(): Promise<void> {
    const payroll = this.payroll();
    const employee = this.employee();
    if (!payroll || !employee) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'คำนวณใหม่จาก Attendance',
      message: `โหลดการลงเวลาล่าสุดของ ${this.fullName(employee)} และอัปเดตค่าแรง/OT จากโปรไฟล์ปัจจุบัน รายการปรับยอดที่กรอกไว้จะยังคงอยู่`,
      confirmLabel: 'คำนวณใหม่',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.payrollService.recalculate(payroll.id, true);
      this.toast.success('คำนวณใหม่แล้ว');
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async approve(): Promise<void> {
    const payroll = this.payroll();
    const employee = this.employee();
    if (!payroll || !employee) {
      return;
    }
    if (this.negative()) {
      this.toast.error('ยอดหักมากกว่ารายได้ กรุณาตรวจสอบก่อนอนุมัติ');
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'อนุมัติ Payroll',
      message: `ยืนยันการอนุมัติ Payroll ของ ${this.fullName(employee)} งวด ${this.periodLabel(payroll)}?`,
      confirmLabel: 'อนุมัติ',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.payrollService.approve(payroll.id);
      this.toast.success('อนุมัติ Payroll แล้ว');
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async unapprove(): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'ยกเลิกการอนุมัติ',
      message: 'ต้องการยกเลิกการอนุมัติเพื่อแก้ไขตัวเลขหรือไม่? เงินเบิกที่หักจะกลับเป็นรอหัก',
      confirmLabel: 'ยกเลิกอนุมัติ',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.payrollService.unapprove(payroll.id);
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async markPaid(): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'บันทึกว่าจ่ายแล้ว',
      message: 'เมื่อจ่ายแล้ว จะไม่สามารถแก้ไข Payroll นี้ได้โดยตรง',
      confirmLabel: 'จ่ายแล้ว',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.payrollService.markPaid(payroll.id);
      this.toast.success('บันทึกว่าจ่ายแล้ว');
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  async revertDraft(): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    try {
      await this.payrollService.revertToDraft(payroll.id);
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  private async addAdjustment(
    type: 'INCOME' | 'DEDUCTION',
    form: typeof this.incomeForm,
  ): Promise<void> {
    const payroll = this.payroll();
    if (!payroll) {
      return;
    }
    form.markAllAsTouched();
    if (form.invalid) {
      return;
    }
    try {
      await this.payrollService.addAdjustment({
        payrollId: payroll.id,
        employeeId: payroll.employeeId,
        type,
        category: form.controls.category.value,
        description: form.controls.description.value,
        amount: Number(form.controls.amount.value),
      });
      form.reset({
        category: type === 'INCOME' ? 'โบนัส' : 'หักอื่นๆ',
        description: '',
        amount: null,
      });
      await this.load(payroll.id);
    } catch (error) {
      this.toast.error(mapPayrollError(error));
    }
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const payroll = await this.payrollService.getPayrollById(id);
      if (!payroll) {
        this.toast.error('ไม่พบ Payroll');
        await this.router.navigateByUrl('/payroll');
        return;
      }
      if (
        this.authService.hasRole(['EMPLOYEE']) &&
        !this.authService.hasRole(['ADMIN']) &&
        this.authService.currentUser()?.employeeId !== payroll.employeeId
      ) {
        await this.router.navigateByUrl('/payslips');
        return;
      }
      const employee = await this.employeeService.getEmployeeById(payroll.employeeId);
      const { start, end } = this.payrollService.payrollDateRange(payroll);
      const [attendances, adjustments, pending] = await Promise.all([
        this.attendanceService.getAttendancesByEmployeeAndDateRange(payroll.employeeId, start, end),
        this.payrollService.getAdjustments(id),
        this.advanceService.getPendingByEmployee(payroll.employeeId),
      ]);
      this.payroll.set(payroll);
      this.employee.set(employee);
      this.attendances.set(attendances.sort((a, b) => a.workDate.toMillis() - b.workDate.toMillis()));
      this.adjustments.set(adjustments);
      const selected = new Set(payroll.selectedAdvanceIds);
      const extras = pending.filter((item) => !selected.has(item.id));
      const selectedRows: EmployeeAdvance[] = [];
      for (const advanceId of payroll.selectedAdvanceIds) {
        const found = pending.find((item) => item.id === advanceId);
        if (found) {
          selectedRows.push(found);
        } else {
          const current = await this.advanceService.getAdvanceById(advanceId);
          if (current) {
            selectedRows.push(current);
          }
        }
      }
      this.pendingAdvances.set([...selectedRows, ...extras]);
      this.selectedAdvanceIds.set(payroll.selectedAdvanceIds);
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลด Payroll ได้');
    } finally {
      this.loading.set(false);
    }
  }
}
