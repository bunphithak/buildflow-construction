import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Job, JOB_STATUS_LABELS, JOB_STATUSES, JobStatus } from '../../../core/models';
import { AuthService } from '../../../core/auth/auth.service';
import { JobEmployeeService } from '../../../core/services/job-employee.service';
import { JobService, mapJobError } from '../../../core/services/job.service';
import { formatBaht, toDate } from '../../../core/utils/form.util';
import { isLockedJobStatus } from '../../../core/utils/job-status.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './job-list.component.html',
  styleUrl: './job-list.component.scss',
})
export class JobListComponent {
  private readonly jobService = inject(JobService);
  private readonly jobEmployeeService = inject(JobEmployeeService);
  private readonly authService = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly loading = this.jobService.loading;
  readonly error = this.jobService.error;
  readonly totalCount = this.jobService.totalCount;
  readonly inProgressCount = this.jobService.inProgressCount;
  readonly completedCount = this.jobService.completedCount;
  readonly closedCount = this.jobService.closedCount;
  readonly statusLabels = JOB_STATUS_LABELS;
  readonly statuses = JOB_STATUSES;
  readonly canManage = computed(() => this.authService.hasRole(['ADMIN']));

  readonly search = signal('');
  readonly statusFilter = signal<JobStatus | ''>('');
  readonly startDateFilter = signal('');

  readonly filteredJobs = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const status = this.statusFilter();
    const startDate = this.startDateFilter();
    const counts = this.jobEmployeeService.activeCountByJobMap();

    return this.jobService.jobs().filter((job) => {
      const matchesKeyword =
        !keyword ||
        [job.jobCode, job.jobName, job.customerName, job.location ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      const matchesStatus = !status || job.status === status;
      const matchesDate =
        !startDate || toDate(job.startDate).toISOString().slice(0, 10) >= startDate;
      return matchesKeyword && matchesStatus && matchesDate;
    }).map((job) => ({ job, employeeCount: counts.get(job.id) ?? 0 }));
  });

  money(value: number | undefined): string {
    return formatBaht(value ?? 0);
  }

  onStatusChange(job: Job, status: string): void {
    void this.changeStatus(job, status as JobStatus);
  }

  async changeStatus(job: Job, status: JobStatus): Promise<void> {
    if (status === job.status) {
      return;
    }
    if (isLockedJobStatus(status)) {
      const confirmed = await this.confirmDialog.confirm({
        title: `เปลี่ยนสถานะเป็น${JOB_STATUS_LABELS[status]}`,
        message: `ต้องการเปลี่ยนสถานะงาน ${job.jobCode} เป็น${JOB_STATUS_LABELS[status]} หรือไม่?`,
        confirmLabel: 'ยืนยัน',
      });
      if (!confirmed) {
        return;
      }
    }
    try {
      await this.jobService.changeJobStatus(job.id, status);
      this.toast.success('เปลี่ยนสถานะงานสำเร็จ');
    } catch (error) {
      this.toast.error(mapJobError(error));
    }
  }
}
