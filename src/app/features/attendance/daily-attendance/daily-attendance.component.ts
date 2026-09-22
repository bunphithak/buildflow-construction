import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Attendance,
  AttendanceStatus,
  ATTENDANCE_STATUS_LABELS,
  AttendanceWriteData,
  attendanceEntryStatuses,
  clockTimesForStatus,
  Employee,
  Job,
  needsAttendanceClock,
  otherJobAttendanceState,
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

interface DailyRow {
  selected: boolean;
  lockedByOtherJob: boolean;
  otherJobCode?: string;
  attendanceId?: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  position: string;
  employmentType: 'DAILY' | 'MONTHLY';
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
  selector: 'app-daily-attendance',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    ThaiDatePipe,
  ],
  templateUrl: './daily-attendance.component.html',
  styleUrl: './daily-attendance.component.scss',
})
export class DailyAttendanceComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly jobService = inject(JobService);
  private readonly jobEmployeeService = inject(JobEmployeeService);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly settingsService = inject(AttendanceSettingsService);
  private readonly toast = inject(ToastService);

  readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  readonly settings = this.settingsService.settings;

  readonly workDate = signal(toDateInputValue(new Date()));
  readonly jobId = signal(this.route.snapshot.queryParamMap.get('jobId') ?? '');
  readonly defaultClockIn = signal(this.settings().defaultClockIn);
  readonly defaultClockOut = signal(this.settings().defaultClockOut);
  readonly defaultBreakMinutes = signal(this.settings().defaultBreakMinutes);
  readonly rows = signal<DailyRow[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loaded = signal(false);

  readonly openJobs = computed(() =>
    this.jobService.jobs().filter((job) => job.status === 'OPEN' || job.status === 'IN_PROGRESS'),
  );

  readonly selectedCount = computed(() =>
    this.rows().filter((row) => row.selected && !row.lockedByOtherJob).length,
  );
  readonly allSelected = computed(() => {
    const editable = this.rows().filter((row) => !row.lockedByOtherJob);
    return editable.length > 0 && editable.every((row) => row.selected);
  });
  readonly selectedSavedCount = computed(
    () => this.rows().filter((row) => row.selected && !row.lockedByOtherJob && row.attendanceId).length,
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
    const date = this.route.snapshot.queryParamMap.get('date');
    if (date) {
      this.workDate.set(date);
    }
  }

  selectedJob(): Job | undefined {
    return this.jobService.jobs().find((job) => job.id === this.jobId());
  }

  rowStatuses(status: AttendanceStatus): AttendanceStatus[] {
    return attendanceEntryStatuses(status);
  }

  toggleAll(checked: boolean): void {
    this.rows.update((rows) =>
      rows.map((row) => (row.lockedByOtherJob ? row : { ...row, selected: checked })),
    );
  }

  onToggleAll(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAll(target.checked);
  }

  onStatusChange(index: number, status: string): void {
    const next = status as AttendanceStatus;
    this.updateRow(index, { status: next, ...this.timesFor(next) });
  }

  updateRow(index: number, patch: Partial<DailyRow>): void {
    this.rows.update((rows) =>
      rows.map((row, i) => {
        if (i !== index || row.lockedByOtherJob) {
          return row;
        }
        return { ...row, ...patch, error: undefined };
      }),
    );
  }

  applyStatus(status: AttendanceStatus): void {
    const times = this.timesFor(status);
    this.rows.update((rows) =>
      rows.map((row) =>
        row.selected && !row.lockedByOtherJob
          ? { ...row, status, ...times, error: undefined }
          : row,
      ),
    );
  }

  applyDefaultTimes(): void {
    const clockIn = this.defaultClockIn();
    const clockOut = this.defaultClockOut();
    const breakMinutes = Number(this.defaultBreakMinutes() || 0);
    this.rows.update((rows) =>
      rows.map((row) =>
        row.selected && !row.lockedByOtherJob
          ? { ...row, clockIn, clockOut, breakMinutes, error: undefined }
          : row,
      ),
    );
  }

  async loadEmployees(): Promise<void> {
    const jobId = this.jobId();
    if (!jobId) {
      this.toast.error('กรุณาเลือก Job');
      return;
    }
    this.loading.set(true);
    try {
      const date = new Date(`${this.workDate()}T00:00:00`);
      const assignments = this.jobEmployeeService.getEmployeesByJob(jobId, 'ACTIVE');
      const dayRows = await this.attendanceService.getAttendancesByDate(date);
      const existing = dayRows.filter((item) => item.jobId === jobId);
      const otherByEmployee = new Map<string, Attendance[]>();
      for (const item of dayRows) {
        if (item.jobId === jobId) {
          continue;
        }
        const list = otherByEmployee.get(item.employeeId) ?? [];
        list.push(item);
        otherByEmployee.set(item.employeeId, list);
      }
      const existingMap = new Map(existing.map((item) => [item.employeeId, item]));
      const employeeIds = new Set([
        ...assignments.map((item) => item.employeeId),
        ...existing.map((item) => item.employeeId),
      ]);

      const rows: DailyRow[] = [];
      for (const employeeId of employeeIds) {
        const employee = this.employeeService.employees().find((item) => item.id === employeeId);
        if (!employee) {
          continue;
        }
        const attendance = existingMap.get(employeeId);
        const assignmentActive = assignments.some((item) => item.employeeId === employeeId);
        if (!assignmentActive && !attendance) {
          continue;
        }
        rows.push(this.toRow(employee, attendance, otherByEmployee.get(employeeId) ?? []));
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
    const selected = this.rows().filter((row) => row.selected && !row.lockedByOtherJob);
    if (selected.length === 0) {
      this.toast.error('กรุณาเลือกพนักงานอย่างน้อย 1 คน');
      return;
    }

    const jobId = this.jobId();
    const workDate = this.workDate();
    const records: AttendanceWriteData[] = [];
    const nextRows = this.rows().map((row) => ({ ...row, error: undefined }));
    let hasError = false;

    for (const row of selected) {
      if (!row.employeeActive && !row.attendanceId) {
        hasError = true;
        this.setRowError(nextRows, row.employeeId, 'ไม่สามารถสร้างรายการใหม่ให้พนักงานที่ปิดใช้งาน');
        continue;
      }
      const needsTime = needsAttendanceClock(row.status);
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

  private setRowError(rows: DailyRow[], employeeId: string, message: string): void {
    const row = rows.find((item) => item.employeeId === employeeId);
    if (row) {
      row.error = message;
    }
  }

  private timesFor(status: AttendanceStatus): {
    clockIn: string;
    clockOut: string;
    breakMinutes: number;
  } {
    return (
      clockTimesForStatus(status, {
        clockIn: this.defaultClockIn(),
        clockOut: this.defaultClockOut(),
        breakMinutes: Number(this.defaultBreakMinutes() || 0),
      }) ?? {
        clockIn: this.defaultClockIn(),
        clockOut: this.defaultClockOut(),
        breakMinutes: Number(this.defaultBreakMinutes() || 0),
      }
    );
  }

  private toRow(
    employee: Employee,
    attendance: Attendance | undefined,
    otherAttendances: Attendance[],
  ): DailyRow {
    const otherState = otherJobAttendanceState(otherAttendances);
    const lockedByOtherJob = !attendance && otherState.locked;
    const display = attendance ?? (lockedByOtherJob ? otherAttendances[0] : undefined);
    const status = display?.status ?? otherState.suggestedStatus ?? 'PRESENT';
    const times = this.timesFor(status);
    return {
      selected: !lockedByOtherJob,
      lockedByOtherJob,
      otherJobCode: lockedByOtherJob
        ? [...new Set(otherAttendances.map((item) => this.jobCode(item.jobId)))].join(', ')
        : undefined,
      attendanceId: attendance?.id,
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: `${employee.firstName} ${employee.lastName}`.trim(),
      position: employee.position,
      employmentType: employee.employmentType,
      employeeActive: employee.status === 'ACTIVE',
      status,
      clockIn: display?.clockIn
        ? formatBangkokTime(display.clockIn.toDate())
        : times.clockIn,
      clockOut: display?.clockOut
        ? formatBangkokTime(display.clockOut.toDate())
        : times.clockOut,
      breakMinutes: display?.breakMinutes ?? times.breakMinutes,
      overtimeHours: display?.overtimeHours ?? 0,
      note: display?.note ?? '',
      employmentTypeSnapshot: display?.employmentTypeSnapshot ?? employee.employmentType,
      dailyRateSnapshot: display?.dailyRateSnapshot ?? employee.dailyRate,
      monthlySalarySnapshot: display?.monthlySalarySnapshot ?? employee.monthlySalary,
      overtimeRateSnapshot: display?.overtimeRateSnapshot ?? employee.overtimeRate,
    };
  }

  private jobCode(jobId: string): string {
    return this.jobService.jobs().find((job) => job.id === jobId)?.jobCode ?? jobId;
  }

  jobLabel(job: Job): string {
    return `${job.jobCode} - ${job.jobName}`;
  }
}
