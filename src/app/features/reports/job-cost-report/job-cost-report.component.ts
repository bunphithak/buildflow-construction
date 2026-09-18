import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { JobCostSummary } from '../../../core/models';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatDateRangeLabel, resolveDashboardRange } from '../../../core/utils/date-range.util';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

type JobCostSort = 'profit' | 'cost' | 'margin' | 'budget';

@Component({
  selector: 'app-job-cost-report',
  standalone: true,
  imports: [FormsModule, RouterLink, DecimalPipe, PageHeaderComponent, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './job-cost-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class JobCostReportComponent {
  private readonly reports = inject(ReportService);
  private readonly excel = inject(ExcelExportService);
  private readonly pdf = inject(PdfExportService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  readonly rows = signal<JobCostSummary[]>([]);
  readonly sort = signal<JobCostSort>('profit');
  readonly start = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly end = signal(toDateInputValue(new Date()));

  readonly sorted = computed(() => {
    const copy = [...this.rows()];
    const key = this.sort();
    copy.sort((a, b) => {
      if (key === 'profit') {
        return b.estimatedProfit - a.estimatedProfit;
      }
      if (key === 'cost') {
        return b.totalCost - a.totalCost;
      }
      if (key === 'margin') {
        return b.profitMargin - a.profitMargin;
      }
      return b.budgetUsedPercent - a.budgetUsedPercent;
    });
    return copy;
  });

  constructor() {
    void this.load();
  }

  setSort(value: string): void {
    this.sort.set(value as JobCostSort);
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
      this.rows.set(await this.reports.generateJobCostReport(resolveDashboardRange('custom', this.start(), this.end())));
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    await this.excel.exportJobCost(this.sorted());
  }

  async exportPdf(): Promise<void> {
    await this.pdf.exportJobCost(this.sorted(), this.rangeLabel());
  }
}
