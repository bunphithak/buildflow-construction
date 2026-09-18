import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS, AttendanceReport } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { ExcelExportService } from '../../../core/services/excel-export.service';
import { JobService } from '../../../core/services/job.service';
import { PdfExportService } from '../../../core/services/pdf-export.service';
import { ReportService } from '../../../core/services/report.service';
import { formatDateRangeLabel, resolveDashboardRange } from '../../../core/utils/date-range.util';
import { toDateInputValue } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-attendance-report',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './attendance-report.component.html',
  styleUrl: '../reports-shared.scss',
})
export class AttendanceReportComponent {
  private readonly reports = inject(ReportService);
  private readonly excel = inject(ExcelExportService);
  private readonly pdf = inject(PdfExportService);
  readonly jobs = inject(JobService);
  readonly employees = inject(EmployeeService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly report = signal<AttendanceReport | null>(null);
  readonly start = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly end = signal(toDateInputValue(new Date()));
  readonly jobId = signal('');
  readonly employeeId = signal('');
  readonly status = signal('');
  readonly statuses = ATTENDANCE_STATUSES;
  readonly statusLabels = ATTENDANCE_STATUS_LABELS;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const range = resolveDashboardRange('custom', this.start(), this.end());
      this.report.set(
        await this.reports.generateAttendanceReport({
          range,
          jobId: this.jobId() || undefined,
          employeeId: this.employeeId() || undefined,
          status: this.status() || undefined,
        }),
      );
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดรายงานไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  async exportExcel(): Promise<void> {
    const report = this.report();
    if (report) {
      await this.excel.exportAttendance(report);
    }
  }

  async exportPdf(): Promise<void> {
    const report = this.report();
    if (report) {
      await this.pdf.exportAttendance(report, formatDateRangeLabel(resolveDashboardRange('custom', this.start(), this.end())));
    }
  }
}
