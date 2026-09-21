import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Employee, Payroll, PayrollAdjustment } from '../../../core/models';
import { COMPANY_LOGO_PATH } from '../../../core/constants/brand';
import { CompanySettingsService } from '../../../core/services/company-settings.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { PayrollService } from '../../../core/services/payroll.service';
import { formatAmount } from '../../../core/utils/form.util';
import { formatThaiDateShort } from '../../../core/utils/datetime.util';
import { payrollDisplayLabel } from '../../../core/utils/payroll.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ToastService } from '../../../shared/services/toast.service';

const STORE_CREDIT_CATEGORIES = new Set(['เงินร้านค้า', 'หักอุปกรณ์']);
const ABSENT_CATEGORIES = new Set(['ขาดงาน']);
const ADVANCE_CATEGORIES = new Set(['เงินเบิก']);

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
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly payroll = signal<Payroll | null>(null);
  readonly employee = signal<Employee | null>(null);
  readonly adjustments = signal<PayrollAdjustment[]>([]);

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

  logoSrc(): string {
    const url = this.companySettings.settings().logoUrl?.trim();
    if (!url || url.includes('buildflow-logo')) {
      return COMPANY_LOGO_PATH;
    }
    return url;
  }

  titleTh(item: Payroll): string {
    return item.employmentTypeSnapshot === 'MONTHLY' ? 'สลิปเงินเดือน' : 'สลิปค่าแรงรายวัน';
  }

  titleEn(item: Payroll): string {
    return item.employmentTypeSnapshot === 'MONTHLY' ? 'PAY SLIP (SALARY)' : 'PAY SLIP (DAILY WAGE)';
  }

  titleMm(item: Payroll): string {
    return item.employmentTypeSnapshot === 'MONTHLY' ? 'လစာပြေစာ' : 'နေ့စားလုပ်ခပြေစာ';
  }

  slipNo(item: Payroll): string {
    const tail = item.id.replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase().padStart(3, '0');
    return `SL-${tail}`;
  }

  employeeName(employee: Employee): string {
    const prefix = employee.gender === 'FEMALE' ? 'นางสาว' : employee.gender === 'MALE' ? 'นาย' : '';
    const name = `${employee.firstName} ${employee.lastName}`.trim();
    return prefix ? `${prefix} ${name}` : name;
  }

  period(item: Payroll): string {
    return payrollDisplayLabel(item);
  }

  payDate(item: Payroll): string {
    const value = item.payDate?.toDate() ?? item.approvedAt?.toDate() ?? item.paidAt?.toDate();
    return value ? formatThaiDateShort(value) : '-';
  }

  workingDays(item: Payroll): number {
    return item.totalWorkDays + item.totalHalfDays * 0.5;
  }

  rate(item: Payroll): number {
    if (item.employmentTypeSnapshot === 'MONTHLY') {
      return item.monthlySalarySnapshot ?? 0;
    }
    return item.dailyRateSnapshot ?? 0;
  }

  calculation(item: Payroll): string {
    if (item.employmentTypeSnapshot === 'MONTHLY') {
      return `เงินเดือน ${this.amount(item.monthlySalarySnapshot ?? 0)}`;
    }
    const days = this.workingDays(item);
    const rate = item.dailyRateSnapshot ?? 0;
    return `${this.days(days)} วัน × ${this.amount(rate)} บาท`;
  }

  incomes(): PayrollAdjustment[] {
    return this.adjustments().filter((item) => item.type === 'INCOME');
  }

  storeCredit(): number {
    return this.sumDeductions(STORE_CREDIT_CATEGORIES);
  }

  absentAmount(): number {
    return this.sumDeductions(ABSENT_CATEGORIES);
  }

  cashAdvance(item: Payroll): number {
    return item.advanceDeduction + this.sumDeductions(ADVANCE_CATEGORIES);
  }

  otherDeduction(): number {
    return this.adjustments()
      .filter(
        (item) =>
          item.type === 'DEDUCTION' &&
          !STORE_CREDIT_CATEGORIES.has(item.category) &&
          !ABSENT_CATEGORIES.has(item.category) &&
          !ADVANCE_CATEGORIES.has(item.category),
      )
      .reduce((sum, item) => sum + item.amount, 0);
  }

  displayNet(item: Payroll): number {
    return item.carriedForwardAmount ? 0 : item.netPay;
  }

  amount(value: number): string {
    return formatAmount(value);
  }

  days(value: number): string {
    return formatAmount(value);
  }

  print(): void {
    window.print();
  }

  private sumDeductions(categories: Set<string>): number {
    return this.adjustments()
      .filter((item) => item.type === 'DEDUCTION' && categories.has(item.category))
      .reduce((sum, item) => sum + item.amount, 0);
  }
}
