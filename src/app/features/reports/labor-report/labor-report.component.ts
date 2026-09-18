import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LaborReportRow } from '../../../core/models';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { resolveDashboardRange } from '../../../core/utils/date-range.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-labor-report',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './labor-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class LaborReportComponent {
  private readonly reports = inject(ReportService);
  private readonly excel = inject(ExcelExportService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(false);
  readonly rows = signal<LaborReportRow[]>([]);
  readonly start = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly end = signal(toDateInputValue(new Date()));

  constructor() {
    void this.load();
  }

  money(value: number): string {
    return formatBaht(value);
  }

  total(): number {
    return this.rows().reduce((sum, row) => sum + row.laborCost, 0);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.rows.set(await this.reports.generateLaborReport(resolveDashboardRange('custom', this.start(), this.end())));
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    await this.excel.exportLabor(this.rows());
  }
}
