import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Attendance, Employee, EmployeeAdvance, EMPLOYMENT_TYPE_LABELS, genderLabel, isWorkedAttendanceStatus, nationalityLabel, Payroll } from '../../../core/models';
import { AttendanceService, attendanceTimeLabel } from '../../../core/services/attendance.service';
import { AdvanceService } from '../../../core/services/advance.service';
import { PayrollService } from '../../../core/services/payroll.service';
import {
  EmployeeService,
  formatEmployeeWage,
} from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { formatAmount, formatBaht } from '../../../core/utils/form.util';
import { isRemoteStorageUrl } from '../../../core/utils/image-compress.util';
import { bangkokDateKey } from '../../../core/utils/datetime.util';
import { payrollDisplayLabel } from '../../../core/utils/payroll.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ToastService } from '../../../shared/services/toast.service';

type DetailTab =
  | 'general'
  | 'history'
  | 'attendance'
  | 'labor'
  | 'advance'
  | 'payslip';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './employee-detail.component.html',
  styleUrl: './employee-detail.component.scss',
})
export class EmployeeDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly employeeService = inject(EmployeeService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly jobService = inject(JobService);
  private readonly advanceService = inject(AdvanceService);
  private readonly payrollService = inject(PayrollService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly employee = signal<Employee | null>(null);
  readonly activeTab = signal<DetailTab>('general');
  readonly attendances = signal<Attendance[]>([]);
  readonly advances = signal<EmployeeAdvance[]>([]);
  readonly payrolls = signal<Payroll[]>([]);
  readonly monthFilter = signal('');
  readonly jobFilter = signal('');
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;

  readonly tabs: { id: DetailTab; label: string }[] = [
    { id: 'general', label: 'ข้อมูลทั่วไป' },
    { id: 'history', label: 'ประวัติการทำงาน' },
    { id: 'attendance', label: 'การลงเวลา' },
    { id: 'labor', label: 'ค่าแรง' },
    { id: 'advance', label: 'เงินเบิก' },
    { id: 'payslip', label: 'สลิปเงินเดือน' },
  ];

  readonly jobs = computed(() => this.jobService.jobs());
  readonly filteredAttendances = computed(() => {
    const month = this.monthFilter();
    const jobId = this.jobFilter();
    return this.attendances().filter((item) => {
      const matchesJob = !jobId || item.jobId === jobId;
      const key = bangkokDateKey(item.workDate.toDate()).slice(0, 7);
      const matchesMonth = !month || key === month;
      return matchesJob && matchesMonth;
    });
  });

  readonly laborSummary = computed(() => {
    const rows = this.filteredAttendances();
    const jobIds = new Set(rows.map((item) => item.jobId));
    return {
      workDays: rows.filter((item) => isWorkedAttendanceStatus(item.status)).length,
      jobCount: jobIds.size,
      overtime: rows.reduce((sum, item) => sum + item.overtimeHours, 0),
      labor: rows.reduce((sum, item) => sum + item.totalLaborCost, 0),
    };
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/employees');
      return;
    }

    try {
      const employee = await this.employeeService.getEmployeeById(id);
      if (!employee) {
        this.toast.error('ไม่พบข้อมูลพนักงาน');
        await this.router.navigateByUrl('/employees');
        return;
      }
      this.employee.set(employee);
      const rows = await this.attendanceService.getAttendancesByEmployee(employee.id);
      this.attendances.set(rows.sort((a, b) => b.workDate.toMillis() - a.workDate.toMillis()));
      this.advances.set(await this.advanceService.getAdvancesByEmployee(employee.id));
      this.payrolls.set(await this.payrollService.getPayrollsByEmployee(employee.id));
    } catch (error) {
      console.error('Failed to load employee detail', error);
      this.toast.error('ไม่สามารถโหลดข้อมูลพนักงานได้');
    } finally {
      this.loading.set(false);
    }
  }

  fullName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  photoUrl(employee: Employee): string | null {
    const url = employee.profileImageUrl;
    if (!url || isRemoteStorageUrl(url)) {
      return null;
    }
    return url;
  }

  nationality(employee: Employee): string {
    return nationalityLabel(employee.nationality);
  }

  gender(employee: Employee): string {
    return genderLabel(employee.gender);
  }

  wage(employee: Employee): string {
    return formatEmployeeWage(employee);
  }

  overtime(employee: Employee): string {
    if (employee.overtimeRate === undefined) {
      return '-';
    }
    return `${formatAmount(employee.overtimeRate)} บาท/ชั่วโมง`;
  }

  setTab(tab: DetailTab): void {
    this.activeTab.set(tab);
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

  period(item: Payroll): string {
    return payrollDisplayLabel(item);
  }
}
