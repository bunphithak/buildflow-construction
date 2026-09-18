import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Payroll } from '../../../core/models';
import { AuthService } from '../../../core/auth/auth.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { PayrollService } from '../../../core/services/payroll.service';
import { formatBaht } from '../../../core/utils/form.util';
import { payrollDisplayLabel } from '../../../core/utils/payroll.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-payslip-list',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './payslip-list.component.html',
  styleUrl: './payslip-list.component.scss',
})
export class PayslipListComponent implements OnInit {
  private readonly payrollService = inject(PayrollService);
  private readonly employeeService = inject(EmployeeService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly payrolls = signal<Payroll[]>([]);
  readonly isAdmin = computed(() => this.authService.hasRole(['ADMIN']));

  async ngOnInit(): Promise<void> {
    try {
      if (this.isAdmin()) {
        const now = new Date();
        this.payrolls.set(await this.payrollService.getPayrollsByPeriod(now.getFullYear(), now.getMonth() + 1));
      } else {
        const employeeId = this.authService.currentUser()?.employeeId;
        this.payrolls.set(employeeId ? await this.payrollService.getPayrollsByEmployee(employeeId) : []);
      }
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดสลิปได้');
    } finally {
      this.loading.set(false);
    }
  }

  name(id: string): string {
    const item = this.employeeService.employees().find((row) => row.id === id);
    return item ? `${item.firstName} ${item.lastName}` : id;
  }

  period(item: Payroll): string {
    return payrollDisplayLabel(item);
  }

  money(value: number): string {
    return formatBaht(value);
  }
}
