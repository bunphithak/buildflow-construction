import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PayrollReportRow } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatBaht } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-payroll-report',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './payroll-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class PayrollReportComponent {
  private readonly reports = inject(ReportService);
  private readonly excel = inject(ExcelExportService);
  private readonly pdf = inject(PdfExportService);
  readonly employees = inject(EmployeeService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  readonly rows = signal<PayrollReportRow[]>([]);
  readonly year = signal(new Date().getFullYear());
  readonly month = signal(new Date().getMonth() + 1);
  readonly employeeId = signal('');
  readonly years = Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index);
  readonly months = Array.from({ length: 12 }, (_, index) => index + 1);

  constructor() {
    void this.load();
  }

  money(value: number): string {
    return formatBaht(value);
  }

  periodLabel(): string {
    return `${this.month()}/${this.year()}`;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(
        await this.reports.generatePayrollReport(this.year(), this.month(), this.employeeId() || undefined),
      );
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    await this.excel.exportPayroll(this.rows());
  }

  async exportPdf(): Promise<void> {
    await this.pdf.exportPayroll(this.rows(), this.periodLabel());
  }
}
