import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUSES,
  Attendance,
  AttendanceStatus,
  AttendanceWriteData,
} from '../../../core/models';
import { AttendanceService, combineWorkTime } from '../../../core/services/attendance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { formatBangkokTime } from '../../../core/utils/datetime.util';
import { formatBaht, toDateInputValue, trimValue } from '../../../core/utils/form.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-attendance-edit',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './attendance-edit.component.html',
  styleUrl: './attendance-edit.component.scss',
})
export class AttendanceEditComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly jobService = inject(JobService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly original = signal<Attendance | null>(null);
  readonly statusLabels = ATTENDANCE_STATUS_LABELS;
  readonly statuses = ATTENDANCE_STATUSES;
  readonly jobs = this.jobService.jobs;
  readonly employees = this.employeeService.employees;

  readonly form = this.fb.nonNullable.group({
    jobId: ['', Validators.required],
    workDate: ['', Validators.required],
    status: this.fb.nonNullable.control<AttendanceStatus>('PRESENT'),
    clockIn: [''],
    clockOut: [''],
    breakMinutes: this.fb.nonNullable.control(0, Validators.min(0)),
    overtimeHours: this.fb.nonNullable.control(0, Validators.min(0)),
    note: [''],
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/attendance');
      return;
    }
    try {
      const attendance = await this.attendanceService.getAttendanceById(id);
      if (!attendance) {
        this.toast.error('ไม่พบรายการลงเวลา');
        await this.router.navigateByUrl('/attendance');
        return;
      }
      this.original.set(attendance);
      this.form.patchValue({
        jobId: attendance.jobId,
        workDate: toDateInputValue(attendance.workDate.toDate()),
        status: attendance.status,
        clockIn: attendance.clockIn ? formatBangkokTime(attendance.clockIn.toDate()) : '',
        clockOut: attendance.clockOut ? formatBangkokTime(attendance.clockOut.toDate()) : '',
        breakMinutes: attendance.breakMinutes,
        overtimeHours: attendance.overtimeHours,
        note: attendance.note ?? '',
      });
    } catch (error) {
      console.error(error);
      this.toast.error('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

  snapshotLabel(): string {
    const item = this.original();
    if (!item) {
      return '';
    }
    const rate =
      item.employmentTypeSnapshot === 'DAILY'
        ? formatBaht(item.dailyRateSnapshot ?? 0)
        : formatBaht(item.monthlySalarySnapshot ?? 0);
    return `ใช้ Rate Snapshot เดิม: ${item.employmentTypeSnapshot === 'DAILY' ? 'รายวัน' : 'รายเดือน'} ${rate}`;
  }

  async submit(): Promise<void> {
    const original = this.original();
    if (!original || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (
      (value.status === 'PRESENT' || value.status === 'HALF_DAY') &&
      value.clockIn &&
      value.clockOut &&
      value.clockOut <= value.clockIn
    ) {
      this.toast.error('เวลาออกงานต้องมากกว่าเวลาเข้างาน');
      return;
    }

    const data: AttendanceWriteData = {
      employeeId: original.employeeId,
      jobId: value.jobId,
      workDate: new Date(`${value.workDate}T00:00:00`),
      clockIn: value.clockIn ? combineWorkTime(value.workDate, value.clockIn) : undefined,
      clockOut: value.clockOut ? combineWorkTime(value.workDate, value.clockOut) : undefined,
      breakMinutes: Number(value.breakMinutes || 0),
      overtimeHours: Number(value.overtimeHours || 0),
      status: value.status,
      employmentTypeSnapshot: original.employmentTypeSnapshot,
      dailyRateSnapshot: original.dailyRateSnapshot,
      monthlySalarySnapshot: original.monthlySalarySnapshot,
      overtimeRateSnapshot: original.overtimeRateSnapshot,
      note: trimValue(value.note),
    };

    this.saving.set(true);
    try {
      await this.attendanceService.updateAttendance(original.id, data);
      this.toast.success('แก้ไขรายการลงเวลาสำเร็จ');
      await this.router.navigateByUrl('/attendance');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }
}
