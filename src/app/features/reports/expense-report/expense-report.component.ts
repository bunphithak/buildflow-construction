import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExpenseReportRow, ExpenseReportSummary } from '../../../core/models';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { JobService } from '../../../core/services/job.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatDateRangeLabel, resolveDashboardRange } from '../../../core/utils/date-range.util';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-expense-report',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './expense-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class ExpenseReportComponent {
  private readonly reports = inject(ReportService);
  private readonly excel = inject(ExcelExportService);
  private readonly pdf = inject(PdfExportService);
  readonly jobs = inject(JobService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  readonly rows = signal<ExpenseReportRow[]>([]);
  readonly summary = signal<ExpenseReportSummary | null>(null);
  readonly start = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly end = signal(toDateInputValue(new Date()));
  readonly jobId = signal('');

  constructor() {
    void this.load();
  }

  money(value: number): string {
    return formatBaht(value);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.reports.generateExpenseReport(
        resolveDashboardRange('custom', this.start(), this.end()),
        this.jobId() || undefined,
      );
      this.rows.set(result.rows);
      this.summary.set(result.summary);
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    const summary = this.summary();
    if (summary) {
      await this.excel.exportExpense(this.rows(), summary);
    }
  }

  async exportPdf(): Promise<void> {
    const summary = this.summary();
    if (summary) {
      await this.pdf.exportExpense(
        this.rows(),
        summary,
        formatDateRangeLabel(resolveDashboardRange('custom', this.start(), this.end())),
      );
    }
  }
}
