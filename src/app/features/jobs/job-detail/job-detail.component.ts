import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Attendance, AttendanceLaborRow, Employee, EMPLOYMENT_TYPE_LABELS, Expense, Job, JOB_STATUS_LABELS, JOB_STATUSES, JobEmployee, JobStatus } from '../../../core/models';
import { AttendanceService, attendanceTimeLabel } from '../../../core/services/attendance.service';
import { JobCostSummary } from '../../../core/models/cost.model';
import { EmployeeService, formatEmployeeWage } from '../../../core/services/employee.service';
import { ExpenseService } from '../../../core/services/expense.service';
import { JobCostService } from '../../../core/services/job-cost.service';
import { JobEmployeeService } from '../../../core/services/job-employee.service';
import { JobService, mapJobError } from '../../../core/services/job.service';
import { canCreateJobExpense } from '../../../core/utils/expense.util';
import { formatBaht, toDate, toDateInputValue } from '../../../core/utils/form.util';
import {
  getBudgetAlertIcon,
  getBudgetAlertLabel,
  getBudgetAlertLevel,
} from '../../../core/utils/job-cost.util';
import {
  canAssignEmployeesToJob,
  isLockedJobStatus,
  scheduleProgressPercent,
} from '../../../core/utils/job-status.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AssignEmployeeDialogComponent } from '../assign-employee-dialog/assign-employee-dialog.component';

type JobTab = 'overview' | 'employees' | 'attendance' | 'labor' | 'expenses' | 'summary';

interface JobMemberRow {
  assignment: JobEmployee;
  employee: Employee | null;
}

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
    AssignEmployeeDialogComponent,
  ],
  templateUrl: './job-detail.component.html',
  styleUrl: './job-detail.component.scss',
})
export class JobDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly jobService = inject(JobService);
  private readonly jobEmployeeService = inject(JobEmployeeService);
  readonly employeeService = inject(EmployeeService);
  private readonly jobCostService = inject(JobCostService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly expenseService = inject(ExpenseService);
  readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly loading = signal(true);
  readonly fetchedJob = signal<Job | null>(null);
  readonly jobId = signal<string | null>(null);
  readonly job = computed(
    () => this.jobService.jobs().find((item) => item.id === this.jobId()) ?? this.fetchedJob(),
  );
  readonly activeTab = signal<JobTab>('overview');
  readonly assignOpen = signal(false);
  readonly statusLabels = JOB_STATUS_LABELS;
  readonly statuses = JOB_STATUSES;
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;
  readonly canManage = computed(() => this.authService.hasRole(['ADMIN']));

  readonly tabs: { id: JobTab; label: string }[] = [
    { id: 'overview', label: 'ภาพรวม' },
    { id: 'employees', label: 'พนักงาน' },
    { id: 'attendance', label: 'ลงเวลาทำงาน' },
    { id: 'labor', label: 'ค่าแรง' },
    { id: 'expenses', label: 'ค่าใช้จ่าย' },
    { id: 'summary', label: 'สรุปต้นทุน' },
  ];

  readonly jobAttendances = signal<Attendance[]>([]);
  readonly attendancePage = signal(1);
  readonly attendancePageSize = signal(10);
  readonly attendancePageSizes = [10, 20, 50] as const;
  readonly sortedAttendances = computed(() =>
    [...this.jobAttendances()].sort((a, b) => {
      const dateDiff = b.workDate.toMillis() - a.workDate.toMillis();
      if (dateDiff !== 0) {
        return dateDiff;
      }
      return this.employeeName(a.employeeId).localeCompare(this.employeeName(b.employeeId), 'th');
    }),
  );
  readonly attendanceTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.sortedAttendances().length / this.attendancePageSize())),
  );
  readonly attendanceCurrentPage = computed(() =>
    Math.min(this.attendancePage(), this.attendanceTotalPages()),
  );
  readonly pagedAttendances = computed(() => {
    const start = (this.attendanceCurrentPage() - 1) * this.attendancePageSize();
    return this.sortedAttendances().slice(start, start + this.attendancePageSize());
  });
  readonly attendancePageNumbers = computed(() => {
    const total = this.attendanceTotalPages();
    const current = this.attendanceCurrentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }
    const start = Math.max(1, Math.min(current - 2, total - 4));
    const end = Math.min(total, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
  readonly attendanceRangeLabel = computed(() => {
    const total = this.sortedAttendances().length;
    if (total === 0) {
      return 'ไม่พบรายการ';
    }
    const start = (this.attendanceCurrentPage() - 1) * this.attendancePageSize() + 1;
    const end = Math.min(total, start + this.attendancePageSize() - 1);
    return `แสดง ${start}-${end} จาก ${total} รายการ`;
  });
  readonly jobExpenses = signal<Expense[]>([]);
  readonly laborFilter = signal<'all' | 'month' | 'range'>('all');
  readonly laborStart = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly laborEnd = signal(toDateInputValue(new Date()));
  readonly expenseFilter = signal<'all' | 'today' | 'month' | 'range'>('all');
  readonly expenseStart = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly expenseEnd = signal(toDateInputValue(new Date()));
  readonly laborTotal = computed(() =>
    this.jobAttendances().reduce((sum, row) => sum + row.totalLaborCost, 0),
  );
  readonly expenseTotal = computed(() =>
    this.jobExpenses().reduce((sum, row) => sum + row.amount, 0),
  );
  readonly filteredExpenses = computed(() => this.filterByDate(this.jobExpenses(), this.expenseFilter(), this.expenseStart(), this.expenseEnd()));
  readonly expenseBreakdown = computed(() => this.jobCostService.toBreakdown(this.filteredExpenses()));
  readonly expenseTabCards = computed(() => {
    const items = this.expenseBreakdown();
    const sum = (...codes: string[]) =>
      items.filter((item) => codes.includes(item.code)).reduce((total, item) => total + item.amount, 0);
    const known = new Set(['MAT', 'FUEL', 'MACHINE', 'RENT', 'TRANSPORT', 'VEHICLE']);
    return {
      total: items.reduce((total, item) => total + item.amount, 0),
      material: sum('MAT'),
      fuel: sum('FUEL'),
      machine: sum('MACHINE', 'RENT'),
      transport: sum('TRANSPORT', 'VEHICLE'),
      other: items.filter((item) => !known.has(item.code)).reduce((total, item) => total + item.amount, 0),
    };
  });
  readonly maxBreakdown = computed(() =>
    Math.max(...this.expenseBreakdown().map((item) => item.amount), 1),
  );
  readonly filteredLaborRows = computed(() => this.groupLabor(this.filteredAttendances()));
  readonly overtimeTotal = computed(() =>
    this.filteredLaborRows().reduce((sum, row) => sum + row.overtimeHours, 0),
  );

  readonly cost = computed<JobCostSummary | null>(() => {
    const job = this.job();
    return job
      ? this.jobCostService.summarize(
          job,
          this.laborTotal(),
          this.expenseTotal(),
          this.jobCostService.toBreakdown(this.jobExpenses()),
        )
      : null;
  });

  readonly members = computed<JobMemberRow[]>(() => {
    const job = this.job();
    if (!job) {
      return [];
    }
    const employees = this.employeeService.employees();
    return this.jobEmployeeService.getEmployeesByJob(job.id).map((assignment) => ({
      assignment,
      employee: employees.find((item) => item.id === assignment.employeeId) ?? null,
    }));
  });

  readonly activeMembers = computed(() =>
    this.members().filter((item) => item.assignment.status === 'ACTIVE'),
  );

  readonly dailyCount = computed(
    () => this.activeMembers().filter((item) => item.employee?.employmentType === 'DAILY').length,
  );
  readonly monthlyCount = computed(
    () => this.activeMembers().filter((item) => item.employee?.employmentType === 'MONTHLY').length,
  );

  readonly canAssign = computed(() => {
    const job = this.job();
    return !!job && this.canManage() && canAssignEmployeesToJob(job.status);
  });

  readonly canAddExpense = computed(() => {
    const job = this.job();
    return !!job && this.authService.hasRole(['ADMIN', 'MANAGER']) && canCreateJobExpense(job.status);
  });

  readonly assignedIds = computed(() => this.activeMembers().map((item) => item.assignment.employeeId));

  readonly schedulePercent = computed(() => {
    const job = this.job();
    if (!job?.expectedEndDate) {
      return null;
    }
    return scheduleProgressPercent(toDate(job.startDate), toDate(job.expectedEndDate));
  });

  readonly budgetLevel = computed(() => getBudgetAlertLevel(this.cost()?.budgetUsedPercent ?? 0));
  readonly budgetLabel = computed(() => getBudgetAlertLabel(this.budgetLevel()));
  readonly budgetIcon = computed(() => getBudgetAlertIcon(this.budgetLevel()));

  readonly supervisorName = computed(() => {
    const job = this.job();
    if (!job?.supervisorId) {
      return '-';
    }
    const employee = this.employeeService.employees().find((item) => item.id === job.supervisorId);
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() : '-';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/jobs');
      return;
    }
    this.jobId.set(id);
    try {
      const job = await this.jobService.getJobById(id);
      if (!job) {
        this.toast.error('ไม่พบข้อมูลงานก่อสร้าง');
        await this.router.navigateByUrl('/jobs');
        return;
      }
      this.fetchedJob.set(job);
      const attendances = await this.attendanceService.getAttendancesByJob(id);
      this.jobAttendances.set(attendances);
      const expenses = await this.expenseService.getExpensesByJob(id);
      this.jobExpenses.set(expenses);
    } catch (error) {
      console.error('Failed to load job detail', error);
      this.toast.error('ไม่สามารถโหลดข้อมูลงานได้');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: JobTab): void {
    this.activeTab.set(tab);
    if (tab === 'attendance') {
      this.attendancePage.set(1);
    }
  }

  setAttendancePageSize(value: number): void {
    this.attendancePageSize.set(value);
    this.attendancePage.set(1);
  }

  goToAttendancePage(page: number): void {
    this.attendancePage.set(Math.min(Math.max(1, page), this.attendanceTotalPages()));
  }

  money(value: number | undefined): string {
    return formatBaht(value ?? 0);
  }

  budgetBarWidth(percent: number): number {
    return Math.min(Math.max(percent, 0), 100);
  }

  wage(employee: Employee): string {
    return formatEmployeeWage(employee);
  }

  fullName(employee: Employee | null): string {
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() : 'ไม่พบข้อมูลพนักงาน';
  }

  employeeName(id: string): string {
    const employee = this.employeeService.employees().find((item) => item.id === id);
    return employee ? `${employee.firstName} ${employee.lastName}`.trim() : id;
  }

  times(item: Attendance): { clockIn: string; clockOut: string } {
    return attendanceTimeLabel(item);
  }

  setLaborFilter(value: string): void {
    this.laborFilter.set(value as 'all' | 'month' | 'range');
  }

  setExpenseFilter(value: string): void {
    this.expenseFilter.set(value as 'all' | 'today' | 'month' | 'range');
  }

  private filterByDate(
    rows: Expense[],
    filter: 'all' | 'today' | 'month' | 'range',
    startValue: string,
    endValue: string,
  ): Expense[] {
    if (filter === 'all') {
      return rows;
    }
    const now = new Date();
    const start =
      filter === 'today'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
        : filter === 'month'
          ? new Date(now.getFullYear(), now.getMonth(), 1)
          : new Date(startValue);
    const end = filter === 'range' ? new Date(endValue) : now;
    const startMs = start.getTime();
    const endMs = end.getTime() + 24 * 60 * 60 * 1000;
    return rows.filter((item) => {
      const time = item.expenseDate.toDate().getTime();
      return time >= startMs && time < endMs;
    });
  }

  private filteredAttendances(): Attendance[] {
    const rows = this.jobAttendances();
    const filter = this.laborFilter();
    if (filter === 'all') {
      return rows;
    }
    const now = new Date();
    const start =
      filter === 'month'
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(this.laborStart());
    const end = filter === 'month' ? now : new Date(this.laborEnd());
    const startMs = start.getTime();
    const endMs = end.getTime() + 24 * 60 * 60 * 1000;
    return rows.filter((item) => {
      const time = item.workDate.toDate().getTime();
      return time >= startMs && time < endMs;
    });
  }

  private groupLabor(rows: Attendance[]): AttendanceLaborRow[] {
    const map = new Map<string, AttendanceLaborRow>();
    for (const row of rows) {
      const current = map.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeName: this.employeeName(row.employeeId),
        employmentType: row.employmentTypeSnapshot,
        recordCount: 0,
        presentDays: 0,
        normalHours: 0,
        overtimeHours: 0,
        regularLaborCost: 0,
        overtimeCost: 0,
        totalLaborCost: 0,
      };
      current.recordCount += 1;
      if (row.status === 'PRESENT') {
        current.presentDays += 1;
      } else if (row.status === 'HALF_DAY') {
        current.presentDays += 0.5;
      }
      current.normalHours += row.normalHours;
      current.overtimeHours += row.overtimeHours;
      current.regularLaborCost += row.regularLaborCost;
      current.overtimeCost += row.overtimeCost;
      current.totalLaborCost += row.totalLaborCost;
      map.set(row.employeeId, current);
    }
    return [...map.values()];
  }

  onStatusChange(status: string): void {
    void this.changeStatus(status as JobStatus);
  }

  async changeStatus(status: JobStatus): Promise<void> {
    const job = this.job();
    if (!job || status === job.status) {
      return;
    }
    if (isLockedJobStatus(status)) {
      const confirmed = await this.confirmDialog.confirm({
        title: `เปลี่ยนสถานะเป็น${JOB_STATUS_LABELS[status]}`,
        message: `ต้องการเปลี่ยนสถานะงานนี้เป็น${JOB_STATUS_LABELS[status]} หรือไม่?`,
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

  async assignEmployees(payload: { employeeIds: string[]; assignedDate: Date }): Promise<void> {
    const job = this.job();
    if (!job) {
      return;
    }
    try {
      const added = await this.jobEmployeeService.assignEmployeesToJob(
        job.id,
        payload.employeeIds,
        payload.assignedDate,
      );
      this.assignOpen.set(false);
      if (added === 0) {
        this.toast.warning('พนักงานที่เลือกอยู่ใน Job นี้แล้ว');
        return;
      }
      this.toast.success(`เพิ่มพนักงาน ${added} คนสำเร็จ`);
    } catch (error) {
      this.toast.error(mapJobError(error));
    }
  }

  async removeMember(row: JobMemberRow): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'นำพนักงานออกจาก Job',
      message: `ต้องการนำพนักงานคนนี้ออกจาก Job หรือไม่? ประวัติจะยังถูกเก็บไว้`,
      confirmLabel: 'นำออก',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.jobEmployeeService.removeEmployeeFromJob(row.assignment.id, new Date());
      this.toast.success('นำพนักงานออกจาก Job แล้ว');
    } catch (error) {
      this.toast.error(mapJobError(error));
    }
  }
}
