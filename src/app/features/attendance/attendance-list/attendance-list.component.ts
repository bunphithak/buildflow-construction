import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Attendance,
  AttendanceStatus,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  isHalfDayStatus,
} from '../../../core/models';
import { AttendanceService, attendanceTimeLabel } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { AuthService } from '../../../core/auth/auth.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-attendance-list',
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
  templateUrl: './attendance-list.component.html',
  styleUrl: './attendance-list.component.scss',
})
export class AttendanceListComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly jobService = inject(JobService);
  private readonly authService = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(false);
  readonly items = signal<Attendance[]>([]);
  readonly startDate = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly endDate = signal(toDateInputValue(new Date()));
  readonly jobId = signal('');
  readonly employeeId = signal('');
  readonly status = signal<AttendanceStatus | ''>('');
  readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  readonly statuses = ATTENDANCE_STATUSES;
  readonly isSuperAdmin = computed(() => this.authService.hasRole(['ADMIN']));
  readonly canManage = computed(() => this.authService.hasRole(['ADMIN', 'MANAGER']));
  readonly canDelete = computed(() => this.authService.hasRole(['ADMIN']));

  readonly jobs = computed(() => this.jobService.jobs());
  readonly employees = computed(() => this.employeeService.employees());

  readonly filtered = computed(() => {
    const jobId = this.jobId();
    const employeeId = this.employeeId();
    const status = this.status();
    return this.items().filter((item) => {
      return (
        (!jobId || item.jobId === jobId) &&
        (!employeeId || item.employeeId === employeeId) &&
        (!status || item.status === status)
      );
    });
  });

  readonly summary = computed(() => {
    const rows = this.filtered();
    return {
      present: rows.filter((item) => item.status === 'PRESENT').length,
      absent: rows.filter((item) => item.status === 'ABSENT').length,
      leave: rows.filter((item) => item.status === 'LEAVE').length,
      halfDay: rows.filter((item) => isHalfDayStatus(item.status)).length,
      overtime: rows.reduce((sum, item) => sum + item.overtimeHours, 0),
      labor: rows.reduce((sum, item) => sum + item.totalLaborCost, 0),
    };
  });

  async ngOnInit(): Promise<void> {
    await this.search();
  }

  async search(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await this.attendanceService.getAttendancesByDateRange(
        new Date(this.startDate()),
        new Date(this.endDate()),
      );
      this.items.set(rows.sort((a, b) => b.workDate.toMillis() - a.workDate.toMillis()));
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดข้อมูลลงเวลาได้');
    } finally {
      this.loading.set(false);
    }
  }

  onStatusFilter(value: string): void {
    this.status.set((value || '') as AttendanceStatus | '');
  }

  employeeName(id: string): string {
    const employee = this.employees().find((item) => item.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() : id;
  }

  jobName(id: string): string {
    const job = this.jobs().find((item) => item.id === id);
    return job ? `${job.jobCode} ${job.jobName}` : id;
  }

  times(item: Attendance): { clockIn: string; clockOut: string } {
    return attendanceTimeLabel(item);
  }

  money(value: number): string {
    return formatBaht(value);
  }

  async remove(item: Attendance): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'ลบรายการลงเวลา',
      message: 'ต้องการลบรายการนี้หรือไม่? การลบมีผลต่อต้นทุน Job',
      confirmLabel: 'ลบ',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.attendanceService.deleteAttendance(item.id);
      this.toast.success('ลบรายการลงเวลาแล้ว');
      await this.search();
    } catch (error) {
      this.toast.error('ลบไม่สำเร็จ');
    }
  }
}
