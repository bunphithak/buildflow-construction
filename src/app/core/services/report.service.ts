import { inject, Injectable } from '@angular/core';
import {
  AttendanceReport,
  AttendanceReportRow,
  ExecutiveReport,
  Expense,
  ExpenseReportRow,
  ExpenseReportSummary,
  Job,
  JobCostSummary,
  LaborReportRow,
  Payroll,
  PayrollReportRow,
} from '../models';
import { Attendance, ATTENDANCE_STATUS_LABELS } from '../models/attendance.model';
import { PAYROLL_STATUS_LABELS } from '../models/payroll.model';
import { bangkokDateKey, roundMoney } from '../utils/datetime.util';
import { DateRange } from '../utils/date-range.util';
import { AttendanceService, attendanceTimeLabel } from './attendance.service';
import { EmployeeService } from './employee.service';
import { ExpenseCategoryService } from './expense-category.service';
import { ExpenseService } from './expense.service';
import { JobCostService } from './job-cost.service';
import { JobService } from './job.service';
import { PayrollService } from './payroll.service';

export interface AttendanceReportFilter {
  range: DateRange;
  jobId?: string;
  employeeId?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReportService {
  private readonly attendanceService = inject(AttendanceService);
  private readonly expenseService = inject(ExpenseService);
  private readonly employeeService = inject(EmployeeService);
  private readonly jobService = inject(JobService);
  private readonly jobCostService = inject(JobCostService);
  private readonly payrollService = inject(PayrollService);
  private readonly categoryService = inject(ExpenseCategoryService);

  async generateAttendanceReport(filter: AttendanceReportFilter): Promise<AttendanceReport> {
    let rows = filter.jobId
      ? await this.attendanceService.getAttendancesByJobAndDateRange(
          filter.jobId,
          filter.range.start,
          filter.range.end,
        )
      : await this.attendanceService.getAttendancesByDateRange(filter.range.start, filter.range.end);
    if (filter.employeeId) {
      rows = rows.filter((item) => item.employeeId === filter.employeeId);
    }
    if (filter.status) {
      rows = rows.filter((item) => item.status === filter.status);
    }
    const mapped: AttendanceReportRow[] = rows
      .sort((a, b) => a.workDate.toMillis() - b.workDate.toMillis())
      .map((item) => {
        const times = attendanceTimeLabel(item);
        return {
          date: bangkokDateKey(item.workDate.toDate()),
          employeeName: this.employeeName(item.employeeId),
          jobName: this.jobName(item.jobId),
          clockIn: times.clockIn,
          clockOut: times.clockOut,
          overtimeHours: item.overtimeHours,
          status: ATTENDANCE_STATUS_LABELS[item.status],
        };
      });
    const uniqueDays = new Set(
      rows
        .filter((item) => item.status === 'PRESENT' || item.status === 'HALF_DAY')
        .map((item) => `${item.employeeId}:${bangkokDateKey(item.workDate.toDate())}`),
    );
    return {
      rows: mapped,
      workDayCount: uniqueDays.size,
      overtimeHours: roundMoney(rows.reduce((sum, item) => sum + item.overtimeHours, 0)),
    };
  }

  async generateLaborReport(range: DateRange): Promise<LaborReportRow[]> {
    const rows = await this.attendanceService.getAttendancesByDateRange(range.start, range.end);
    const byJob = new Map<string, Attendance[]>();
    for (const row of rows) {
      const current = byJob.get(row.jobId) ?? [];
      current.push(row);
      byJob.set(row.jobId, current);
    }
    return [...byJob.entries()].map(([jobId, items]) => {
      const uniqueEmployees = new Set(items.map((item) => item.employeeId));
      const uniqueDays = new Set(
        items
          .filter((item) => item.status === 'PRESENT' || item.status === 'HALF_DAY')
          .map((item) => `${item.employeeId}:${bangkokDateKey(item.workDate.toDate())}`),
      );
      return {
        jobName: this.jobName(jobId),
        employeeCount: uniqueEmployees.size,
        workDays: uniqueDays.size,
        overtimeHours: roundMoney(items.reduce((sum, item) => sum + item.overtimeHours, 0)),
        laborCost: roundMoney(items.reduce((sum, item) => sum + item.totalLaborCost, 0)),
      };
    });
  }

  async generateExpenseReport(range: DateRange, jobId?: string): Promise<{
    rows: ExpenseReportRow[];
    summary: ExpenseReportSummary;
  }> {
    const expenses = jobId
      ? await this.expenseService.getExpensesByJobAndDateRange(jobId, range.start, range.end)
      : await this.expenseService.getExpensesByDateRange(range.start, range.end);
    const map = new Map<string, ExpenseReportRow>();
    for (const row of expenses) {
      const category = row.categoryNameSnapshot || this.categoryService.getById(row.categoryId)?.name || 'อื่นๆ';
      const key = `${row.jobId}:${row.categoryId}`;
      const current = map.get(key) ?? {
        jobName: this.jobName(row.jobId),
        category,
        itemCount: 0,
        amount: 0,
      };
      current.itemCount += 1;
      current.amount = roundMoney(current.amount + row.amount);
      map.set(key, current);
    }
    return { rows: [...map.values()], summary: this.expenseSummary(expenses) };
  }

  async generateJobCostReport(range: DateRange): Promise<JobCostSummary[]> {
    const [attendances, expenses] = await Promise.all([
      this.attendanceService.getAttendancesByDateRange(range.start, range.end),
      this.expenseService.getExpensesByDateRange(range.start, range.end),
    ]);
    return this.jobService
      .jobs()
      .filter((job) => job.status !== 'CANCELLED')
      .map((job) => this.toJobCost(job, attendances, expenses));
  }

  async generatePayrollReport(year: number, month: number, employeeId?: string): Promise<PayrollReportRow[]> {
    let rows = await this.payrollService.getPayrollsByPeriod(year, month);
    if (employeeId) {
      rows = rows.filter((item) => item.employeeId === employeeId);
    }
    return rows.map((item) => this.toPayrollRow(item));
  }

  async generateExecutiveReport(range: DateRange): Promise<ExecutiveReport> {
    const [attendances, expenses, payrolls] = await Promise.all([
      this.attendanceService.getAttendancesByDateRange(range.start, range.end),
      this.expenseService.getExpensesByDateRange(range.start, range.end),
      this.payrollService.getPayrollsInDateRange(range.start, range.end),
    ]);
    const jobs = this.jobService.jobs().filter((job) => job.status !== 'CANCELLED');
    const laborCost = roundMoney(attendances.reduce((sum, item) => sum + item.totalLaborCost, 0));
    const expenseCost = roundMoney(expenses.reduce((sum, item) => sum + item.amount, 0));
    const totalCost = roundMoney(laborCost + expenseCost);
    const totalRevenue = roundMoney(jobs.reduce((sum, job) => sum + job.contractValue, 0));
    const totalProfit = roundMoney(totalRevenue - totalCost);
    return {
      totalRevenue,
      totalCost,
      totalProfit,
      margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
      openJobs: jobs.filter((job) => job.status === 'OPEN' || job.status === 'IN_PROGRESS').length,
      closedJobs: jobs.filter((job) => job.status === 'CLOSED' || job.status === 'COMPLETED').length,
      payrollPaid: roundMoney(
        payrolls.filter((item) => item.status === 'PAID').reduce((sum, item) => sum + item.netPay, 0),
      ),
      payrollPending: roundMoney(
        payrolls
          .filter((item) => item.status === 'CALCULATED' || item.status === 'APPROVED' || item.status === 'DRAFT')
          .reduce((sum, item) => sum + item.netPay, 0),
      ),
      laborCost,
      expenseCost,
    };
  }

  private toJobCost(job: Job, attendances: Attendance[], expenses: Expense[]): JobCostSummary {
    const jobAttendances = attendances.filter((item) => item.jobId === job.id);
    const jobExpenses = expenses.filter((item) => item.jobId === job.id);
    return this.jobCostService.summarize(
      job,
      roundMoney(jobAttendances.reduce((sum, item) => sum + item.totalLaborCost, 0)),
      roundMoney(jobExpenses.reduce((sum, item) => sum + item.amount, 0)),
      this.jobCostService.toBreakdown(jobExpenses),
    );
  }

  private toPayrollRow(item: Payroll): PayrollReportRow {
    return {
      employeeName: this.employeeName(item.employeeId),
      basePay: item.basePay,
      overtimePay: item.overtimePay,
      bonus: item.bonus,
      additionalIncome: item.additionalIncome,
      totalIncome: item.totalIncome,
      totalDeduction: item.totalDeduction,
      netPay: item.netPay,
      status: PAYROLL_STATUS_LABELS[item.status],
    };
  }

  private expenseSummary(expenses: Expense[]): ExpenseReportSummary {
    const summary: ExpenseReportSummary = {
      material: 0,
      fuel: 0,
      machine: 0,
      safety: 0,
      other: 0,
      total: 0,
    };
    for (const row of expenses) {
      const code = this.categoryService.getById(row.categoryId)?.code ?? '';
      summary.total += row.amount;
      if (code === 'MAT') {
        summary.material += row.amount;
      } else if (code === 'FUEL') {
        summary.fuel += row.amount;
      } else if (code === 'MACHINE' || code === 'RENT') {
        summary.machine += row.amount;
      } else if (code === 'SAFETY') {
        summary.safety += row.amount;
      } else {
        summary.other += row.amount;
      }
    }
    return {
      material: roundMoney(summary.material),
      fuel: roundMoney(summary.fuel),
      machine: roundMoney(summary.machine),
      safety: roundMoney(summary.safety),
      other: roundMoney(summary.other),
      total: roundMoney(summary.total),
    };
  }

  private employeeName(id: string): string {
    const item = this.employeeService.employees().find((row) => row.id === id);
    return item ? `${item.employeeCode} ${item.firstName} ${item.lastName}` : id;
  }

  private jobName(id: string): string {
    const item = this.jobService.jobs().find((row) => row.id === id);
    return item ? `${item.jobCode} ${item.jobName}` : id;
  }
}
