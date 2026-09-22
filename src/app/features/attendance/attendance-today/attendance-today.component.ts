import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Attendance,
  AttendanceStatus,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  AttendanceWriteData,
  Employee,
  Job,
} from '../../../core/models';
import { AttendanceSettingsService } from '../../../core/services/attendance-settings.service';
import { AttendanceService, combineWorkTime } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobEmployeeService } from '../../../core/services/job-employee.service';
import { JobService } from '../../../core/services/job.service';
import { formatBangkokTime } from '../../../core/utils/datetime.util';
import { toDateInputValue } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ToastService } from '../../../shared/services/toast.service';

interface TodayRow {
  selected: boolean;
  attendanceId?: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  employeeActive: boolean;
  status: AttendanceStatus;
  clockIn: string;
  clockOut: string;
  breakMinutes: number;
  overtimeHours: number;
  note: string;
  employmentTypeSnapshot: 'DAILY' | 'MONTHLY';
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
  error?: string;
}

@Component({
  selector: 'app-attendance-today',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    ThaiDatePipe,
  ],
  templateUrl: './attendance-today.component.html',
  styleUrl: './attendance-today.component.scss',
})
export class AttendanceTodayComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly jobService = inject(JobService);
  private readonly jobEmployeeService = inject(JobEmployeeService);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly settingsService = inject(AttendanceSettingsService);
  private readonly toast = inject(ToastService);

  readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  readonly statuses = ATTENDANCE_STATUSES;
  readonly settings = this.settingsService.settings;
  readonly workDate = toDateInputValue(new Date());
  readonly jobId = signal(this.route.snapshot.queryParamMap.get('jobId') ?? '');
  readonly defaultClockIn = signal(this.settings().defaultClockIn);
  readonly defaultClockOut = signal(this.settings().defaultClockOut);
  readonly defaultBreakMinutes = signal(this.settings().defaultBreakMinutes);
  readonly rows = signal<TodayRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loaded = signal(false);
  readonly canViewHistory = computed(() => this.authService.hasRole(['ADMIN']));
  readonly showNoAssignedJobs = computed(
    () =>
      this.authService.hasRole(['MANAGER']) &&
      this.jobService.loaded() &&
      this.openJobs().length === 0,
  );

  readonly openJobs = computed(() =>
    this.authService.filterManagedJobs(
      this.jobService.jobs().filter((job) => job.status === 'OPEN' || job.status === 'IN_PROGRESS'),
    ),
  );

  readonly selectedCount = computed(() => this.rows().filter((row) => row.selected).length);
  readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((row) => row.selected),
  );
  readonly selectedSavedCount = computed(
    () => this.rows().filter((row) => row.selected && row.attendanceId).length,
  );
  readonly saveLabel = computed(() => {
    const selected = this.selectedCount();
    const savedSelected = this.selectedSavedCount();
    if (selected === 0) {
      return 'บันทึกการลงเวลา';
    }
    if (savedSelected === selected) {
      return `อัปเดตการลงเวลา ${selected} คน`;
    }
    if (savedSelected > 0) {
      return `บันทึก/อัปเดต ${selected} คน`;
    }
    return `บันทึกการลงเวลา ${selected} คน`;
  });

  constructor() {
    void this.init();
  }

  selectedJob(): Job | undefined {
    return this.openJobs().find((job) => job.id === this.jobId());
  }

  async onJobChange(jobId: string): Promise<void> {
    this.jobId.set(jobId);
    this.rows.set([]);
    this.loaded.set(false);
    if (jobId) {
      await this.loadEmployees();
    }
  }

  toggleAll(checked: boolean): void {
    this.rows.update((rows) => rows.map((row) => ({ ...row, selected: checked })));
  }

  onToggleAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAll(target.checked);
  }

  onStatusChange(index: number, status: string): void {
    this.updateRow(index, { status: status as AttendanceStatus });
  }

  updateRow(index: number, patch: Partial<TodayRow>): void {
    this.rows.update((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch, error: undefined } : row)),
    );
  }

  applyStatus(status: AttendanceStatus): void {
    this.rows.update((rows) =>
      rows.map((row) => (row.selected ? { ...row, status, error: undefined } : row)),
    );
  }

  applyDefaultTimes(): void {
    const clockIn = this.defaultClockIn();
    const clockOut = this.defaultClockOut();
    const breakMinutes = Number(this.defaultBreakMinutes() || 0);
    this.rows.update((rows) =>
      rows.map((row) =>
        row.selected ? { ...row, clockIn, clockOut, breakMinutes, error: undefined } : row,
      ),
    );
  }

  async loadEmployees(): Promise<void> {
    const jobId = this.jobId();
    if (!jobId) {
      this.toast.error('กรุณาเลือก Job');
      return;
    }
    if (!this.authService.canManageJob(jobId)) {
      this.toast.error('ไม่มีสิทธิ์ลงเวลาของงานนี้');
      this.jobId.set('');
      this.rows.set([]);
      this.loaded.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const date = new Date(`${this.workDate}T00:00:00`);
      const assignments = await this.jobEmployeeService.queryActiveByJob(jobId);
      const existing = await this.loadExistingForJob(jobId, date);
      const existingMap = new Map(existing.map((item) => [item.employeeId, item]));
      const employeeIds = new Set([
        ...assignments.map((item) => item.employeeId),
        ...existing.map((item) => item.employeeId),
      ]);

      const rows: TodayRow[] = [];
      for (const employeeId of employeeIds) {
        const employee = await this.employeeService.getEmployeeById(employeeId);
        if (!employee) {
          continue;
        }
        const attendance = existingMap.get(employeeId);
        const assignmentActive = assignments.some((item) => item.employeeId === employeeId);
        if (!assignmentActive && !attendance) {
          continue;
        }
        rows.push(this.toRow(employee, attendance));
      }
      this.rows.set(rows.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)));
      this.loaded.set(true);
      if (rows.length === 0) {
        this.toast.warning('ยังไม่มีพนักงานในงานนี้ กรุณาไปที่ Job แล้วมอบหมายพนักงานก่อน');
      }
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดพนักงานได้');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const selected = this.rows().filter((row) => row.selected);
    if (selected.length === 0) {
      this.toast.error('กรุณาเลือกพนักงานอย่างน้อย 1 คน');
      return;
    }

    const jobId = this.jobId();
    if (!this.authService.canManageJob(jobId)) {
      this.toast.error('ไม่มีสิทธิ์ลงเวลาของงานนี้');
      return;
    }
    const workDate = this.workDate;
    const records: AttendanceWriteData[] = [];
    const nextRows = this.rows().map((row) => ({ ...row, error: undefined }));
    let hasError = false;

    for (const row of selected) {
      if (!row.employeeActive && !row.attendanceId) {
        hasError = true;
        this.setRowError(nextRows, row.employeeId, 'ไม่สามารถสร้างรายการใหม่ให้พนักงานที่ปิดใช้งาน');
        continue;
      }
      const needsTime = row.status === 'PRESENT' || row.status === 'HALF_DAY';
      if (needsTime && row.clockIn && row.clockOut && row.clockOut <= row.clockIn) {
        hasError = true;
        this.setRowError(nextRows, row.employeeId, 'เวลาออกงานต้องมากกว่าเวลาเข้างาน');
        continue;
      }
      records.push({
        employeeId: row.employeeId,
        jobId,
        workDate: new Date(`${workDate}T00:00:00`),
        clockIn: row.clockIn ? combineWorkTime(workDate, row.clockIn) : undefined,
        clockOut: row.clockOut ? combineWorkTime(workDate, row.clockOut) : undefined,
        breakMinutes: Number(row.breakMinutes || 0),
        overtimeHours: Number(row.overtimeHours || 0),
        status: row.status,
        employmentTypeSnapshot: row.employmentTypeSnapshot,
        dailyRateSnapshot: row.dailyRateSnapshot,
        monthlySalarySnapshot: row.monthlySalarySnapshot,
        overtimeRateSnapshot: row.overtimeRateSnapshot,
        note: row.note || undefined,
      });
    }

    this.rows.set(nextRows);
    if (hasError) {
      this.toast.error('มีรายการที่ไม่ถูกต้อง กรุณาตรวจสอบพนักงานที่มีปัญหา');
      return;
    }

    this.saving.set(true);
    try {
      const savedIds = await this.attendanceService.saveDailyAttendance(records);
      this.rows.update((rows) =>
        rows.map((row) => {
          const attendanceId = savedIds.get(row.employeeId);
          return attendanceId
            ? { ...row, attendanceId, error: undefined }
            : { ...row, error: undefined };
        }),
      );
      const updated = records.filter((item) =>
        selected.some((row) => row.employeeId === item.employeeId && row.attendanceId),
      ).length;
      if (updated === records.length) {
        this.toast.success(`อัปเดตการลงเวลา ${records.length} คนสำเร็จ`);
      } else if (updated > 0) {
        this.toast.success(`บันทึก ${records.length - updated} คน และอัปเดต ${updated} คนสำเร็จ`);
      } else {
        this.toast.success(`บันทึกการลงเวลา ${records.length} คนสำเร็จ`);
      }
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  jobLabel(job: Job): string {
    return `${job.jobCode} - ${job.jobName}`;
  }

  private async loadExistingForJob(jobId: string, date: Date): Promise<Attendance[]> {
    return this.attendanceService.getAttendancesByJobAndDate(jobId, date);
  }

  private async init(): Promise<void> {
    const requested = this.jobId();
    if (requested && !this.authService.canManageJob(requested)) {
      this.jobId.set('');
    }
    if (this.jobId()) {
      await this.loadEmployees();
    } else if (this.openJobs().length === 1) {
      await this.onJobChange(this.openJobs()[0].id);
    }
  }

  private setRowError(rows: TodayRow[], employeeId: string, message: string): void {
    const row = rows.find((item) => item.employeeId === employeeId);
    if (row) {
      row.error = message;
    }
  }

  private toRow(employee: Employee, attendance: Attendance | undefined): TodayRow {
    const settings = this.settings();
    return {
      selected: true,
      attendanceId: attendance?.id,
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      employeeActive: employee.status === 'ACTIVE',
      status: attendance?.status ?? 'PRESENT',
      clockIn: attendance?.clockIn
        ? formatBangkokTime(attendance.clockIn.toDate())
        : settings.defaultClockIn,
      clockOut: attendance?.clockOut
        ? formatBangkokTime(attendance.clockOut.toDate())
        : settings.defaultClockOut,
      breakMinutes: attendance?.breakMinutes ?? settings.defaultBreakMinutes,
      overtimeHours: attendance?.overtimeHours ?? 0,
      note: attendance?.note ?? '',
      employmentTypeSnapshot: attendance?.employmentTypeSnapshot ?? employee.employmentType,
      dailyRateSnapshot: attendance?.dailyRateSnapshot ?? employee.dailyRate,
      monthlySalarySnapshot: attendance?.monthlySalarySnapshot ?? employee.monthlySalary,
      overtimeRateSnapshot: attendance?.overtimeRateSnapshot ?? employee.overtimeRate,
    };
  }
}
