import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Employee, Payroll, PayrollAdjustment } from '../../../core/models';
import { AuthService } from '../../../core/auth/auth.service';
import { CompanySettingsService } from '../../../core/services/company-settings.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { PayrollService } from '../../../core/services/payroll.service';
import { formatAmount } from '../../../core/utils/form.util';
import { payrollDisplayLabel } from '../../../core/utils/payroll.util';
import { EMPLOYMENT_TYPE_LABELS } from '../../../core/models';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-payslip-view',
  standalone: true,
  imports: [RouterLink, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './payslip-view.component.html',
  styleUrl: './payslip-view.component.scss',
})
export class PayslipViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly payrollService = inject(PayrollService);
  private readonly employeeService = inject(EmployeeService);
  readonly companySettings = inject(CompanySettingsService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly payroll = signal<Payroll | null>(null);
  readonly employee = signal<Employee | null>(null);
  readonly adjustments = signal<PayrollAdjustment[]>([]);
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/payslips');
      return;
    }
    try {
      const payroll = await this.payrollService.getPayrollById(id);
      if (!payroll) {
        this.toast.error('ไม่พบสลิป');
        await this.router.navigateByUrl('/payslips');
        return;
      }
      this.payroll.set(payroll);
      this.employee.set(await this.employeeService.getEmployeeById(payroll.employeeId));
      this.adjustments.set(await this.payrollService.getAdjustments(id));
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดสลิปได้');
    } finally {
      this.loading.set(false);
    }
  }

  period(item: Payroll): string {
    return payrollDisplayLabel(item);
  }

  amount(value: number): string {
    return formatAmount(value);
  }

  incomes(): PayrollAdjustment[] {
    return this.adjustments().filter((item) => item.type === 'INCOME');
  }

  deductions(): PayrollAdjustment[] {
    return this.adjustments().filter((item) => item.type === 'DEDUCTION');
  }

  print(): void {
    window.print();
  }
}
