import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExecutiveReport } from '../../../core/models';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatDateRangeLabel, resolveDashboardRange } from '../../../core/utils/date-range.util';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-executive-report',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './executive-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class ExecutiveReportComponent {
  private readonly reports = inject(ReportService);
  private readonly pdf = inject(PdfExportService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  readonly report = signal<ExecutiveReport | null>(null);
  readonly start = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly end = signal(toDateInputValue(new Date()));

  constructor() {
    void this.load();
  }

  money(value: number): string {
    return formatBaht(value);
  }

  rangeLabel(): string {
    return formatDateRangeLabel(resolveDashboardRange('custom', this.start(), this.end()));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.report.set(await this.reports.generateExecutiveReport(resolveDashboardRange('custom', this.start(), this.end())));
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    const report = this.report();
    if (report) {
      await this.pdf.exportExecutive(report, this.rangeLabel());
    }
  }
}
