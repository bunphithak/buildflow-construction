import { inject, Injectable } from '@angular/core';
import {
  Attendance,
  AttendanceStatusCounts,
  ChartSeries,
  DashboardSummary,
  Expense,
  isHalfDayStatus,
  Job,
  JobCostSummary,
  UserRole,
} from '../models';
import { bangkokDateKey, roundMoney } from '../utils/datetime.util';
import { DateRange, formatMonthKey, monthKeyFromDate } from '../utils/date-range.util';
import { AuthService } from '../auth/auth.service';
import { AttendanceService } from './attendance.service';
import { EmployeeService } from './employee.service';
import { ExpenseCategoryService } from './expense-category.service';
import { ExpenseService } from './expense.service';
import { JobCostService } from './job-cost.service';
import { JobService } from './job.service';
import { PayrollService } from './payroll.service';

interface CacheEntry {
  expires: number;
  value: DashboardSummary;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly attendanceService = inject(AttendanceService);
  private readonly employeeService = inject(EmployeeService);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(ExpenseCategoryService);
  private readonly jobService = inject(JobService);
  private readonly jobCostService = inject(JobCostService);
  private readonly payrollService = inject(PayrollService);
  private readonly authService = inject(AuthService);
  private readonly cache = new Map<string, CacheEntry>();

  async getDashboardSummary(
    range: DateRange,
    role: UserRole | null,
    jobId?: string,
  ): Promise<DashboardSummary> {
    const key = `${role}:${jobId ?? 'all'}:${range.start.toISOString()}:${range.end.toISOString()}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    const value = await this.fullSummary(range, jobId);
    this.cache.set(key, { value, expires: Date.now() + 30_000 });
    return value;
  }

  async getTodayAttendance(): Promise<AttendanceStatusCounts> {
    const today = new Date();
    const rows = await this.attendanceService.getAttendancesByDateRange(today, today);
    return this.countStatuses(rows);
  }

  async getMonthlyLabor(range: DateRange): Promise<number> {
    const rows = await this.attendanceService.getAttendancesByDateRange(range.start, range.end);
    return roundMoney(rows.reduce((sum, item) => sum + item.totalLaborCost, 0));
  }

  async getMonthlyExpense(range: DateRange): Promise<number> {
    const rows = await this.expenseService.getExpensesByDateRange(range.start, range.end);
    return roundMoney(rows.reduce((sum, item) => sum + item.amount, 0));
  }

  async getJobProfitSummary(range: DateRange): Promise<JobCostSummary[]> {
    return (await this.fullSummary(range)).topProfitJobs;
  }

  async getBudgetAlerts(range: DateRange): Promise<JobCostSummary[]> {
    return (await this.fullSummary(range)).overBudgetJobs;
  }

  async getTopJobs(range: DateRange): Promise<{ profit: JobCostSummary[]; spend: JobCostSummary[] }> {
    const summary = await this.fullSummary(range);
    return { profit: summary.topProfitJobs, spend: summary.topSpendJobs };
  }

  private async fullSummary(range: DateRange, jobId?: string): Promise<DashboardSummary> {
    const [attendancesRaw, expensesRaw, payrolls] = await Promise.all([
      this.attendanceService.getAttendancesByDateRange(range.start, range.end),
      this.expenseService.getExpensesByDateRange(range.start, range.end),
      this.payrollService.getPayrollsInDateRange(range.start, range.end),
    ]);
    const attendances = jobId ? attendancesRaw.filter((item) => item.jobId === jobId) : attendancesRaw;
    const expenses = jobId ? expensesRaw.filter((item) => item.jobId === jobId) : expensesRaw;
    const jobs = this.jobService
      .jobs()
      .filter((job) => !jobId || job.id === jobId);
    const jobCosts = this.buildJobCosts(jobs, attendances, expenses);
    const laborCost = roundMoney(attendances.reduce((sum, item) => sum + item.totalLaborCost, 0));
    const expenseCost = roundMoney(expenses.reduce((sum, item) => sum + item.amount, 0));
    const monthly = this.monthlySeries(range, attendances, expenses, jobs);
    const uniqueEmployees = new Set(attendances.map((item) => item.employeeId));
    return {
      employeeCount: jobId ? uniqueEmployees.size : this.employeeService.employees().length,
      presentToday: this.countStatuses(attendances).present,
      absentToday: this.countStatuses(attendances).absent,
      openJobs: jobs.filter((job) => job.status === 'OPEN' || job.status === 'IN_PROGRESS').length,
      completedJobs: jobs.filter((job) => job.status === 'COMPLETED' || job.status === 'CLOSED').length,
      laborCost,
      expenseCost,
      payrollPaid: jobId
        ? 0
        : roundMoney(
            payrolls.filter((item) => item.status === 'PAID').reduce((sum, item) => sum + item.netPay, 0),
          ),
      attendance: this.countStatuses(attendances),
      topProfitJobs: [...jobCosts].sort((a, b) => b.estimatedProfit - a.estimatedProfit).slice(0, 5),
      topSpendJobs: [...jobCosts].sort((a, b) => b.totalCost - a.totalCost).slice(0, 5),
      overBudgetJobs: jobCosts.filter((item) => item.budgetUsedPercent >= 100),
      monthlyLabor: monthly.labor,
      monthlyExpense: monthly.expense,
      monthlyTotalCost: monthly.total,
      monthlyProfit: monthly.profit,
      expenseByCategory: this.expenseCategorySeries(expenses),
      laborByJob: this.laborByJobSeries(attendances, jobs),
    };
  }

  private buildJobCosts(jobs: Job[], attendances: Attendance[], expenses: Expense[]): JobCostSummary[] {
    return jobs
      .filter((job) => job.status !== 'CANCELLED')
      .map((job) => {
        const jobAttendances = attendances.filter((item) => item.jobId === job.id);
        const jobExpenses = expenses.filter((item) => item.jobId === job.id);
        const labor = roundMoney(jobAttendances.reduce((sum, item) => sum + item.totalLaborCost, 0));
        const expense = roundMoney(jobExpenses.reduce((sum, item) => sum + item.amount, 0));
        return this.jobCostService.summarize(job, labor, expense, this.jobCostService.toBreakdown(jobExpenses));
      });
  }

  private countStatuses(rows: Attendance[]): AttendanceStatusCounts {
    const grouped = new Map<string, Attendance[]>();
    for (const row of rows) {
      const key = `${row.employeeId}:${bangkokDateKey(row.workDate.toDate())}`;
      const current = grouped.get(key) ?? [];
      current.push(row);
      grouped.set(key, current);
    }
    const counts: AttendanceStatusCounts = {
      present: 0,
      absent: 0,
      leave: 0,
      halfDay: 0,
      holiday: 0,
    };
    for (const dayRows of grouped.values()) {
      if (dayRows.some((item) => item.status === 'PRESENT')) {
        counts.present += 1;
      } else if (dayRows.some((item) => isHalfDayStatus(item.status))) {
        counts.halfDay += 1;
      } else if (dayRows.some((item) => item.status === 'LEAVE')) {
        counts.leave += 1;
      } else if (dayRows.some((item) => item.status === 'HOLIDAY')) {
        counts.holiday += 1;
      } else if (dayRows.some((item) => item.status === 'ABSENT')) {
        counts.absent += 1;
      }
    }
    return counts;
  }

  private monthlySeries(
    range: DateRange,
    attendances: Attendance[],
    expenses: Expense[],
    jobs: Job[],
  ): { labor: ChartSeries; expense: ChartSeries; total: ChartSeries; profit: ChartSeries } {
    const keys = this.monthKeys(range);
    const laborMap = new Map<string, number>();
    const expenseMap = new Map<string, number>();
    for (const row of attendances) {
      const key = monthKeyFromDate(row.workDate.toDate());
      laborMap.set(key, roundMoney((laborMap.get(key) ?? 0) + row.totalLaborCost));
    }
    for (const row of expenses) {
      const key = monthKeyFromDate(row.expenseDate.toDate());
      expenseMap.set(key, roundMoney((expenseMap.get(key) ?? 0) + row.amount));
    }
    const revenue = jobs
      .filter((job) => job.status !== 'CANCELLED')
      .reduce((sum, job) => sum + job.contractValue, 0);
    const labels = keys.map((key) => formatMonthKey(key));
    const laborValues = keys.map((key) => laborMap.get(key) ?? 0);
    const expenseValues = keys.map((key) => expenseMap.get(key) ?? 0);
    const totalValues = keys.map((_, index) => roundMoney(laborValues[index] + expenseValues[index]));
    const profitValues = totalValues.map((cost) => roundMoney(revenue / Math.max(keys.length, 1) - cost));
    return {
      labor: { labels, values: laborValues },
      expense: { labels, values: expenseValues },
      total: { labels, values: totalValues },
      profit: { labels, values: profitValues },
    };
  }

  private expenseCategorySeries(expenses: Expense[]): ChartSeries {
    const map = new Map<string, number>();
    for (const row of expenses) {
      const category = this.categoryService.getById(row.categoryId);
      const name = row.categoryNameSnapshot || category?.name || 'อื่นๆ';
      map.set(name, roundMoney((map.get(name) ?? 0) + row.amount));
    }
    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { labels: entries.map((item) => item[0]), values: entries.map((item) => item[1]) };
  }

  private laborByJobSeries(attendances: Attendance[], jobs: Job[]): ChartSeries {
    const map = new Map<string, number>();
    for (const row of attendances) {
      map.set(row.jobId, roundMoney((map.get(row.jobId) ?? 0) + row.totalLaborCost));
    }
    const entries = [...map.entries()]
      .map(([jobId, amount]) => {
        const job = jobs.find((item) => item.id === jobId);
        return [job ? `${job.jobCode}` : jobId, amount] as const;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    return { labels: entries.map((item) => item[0]), values: entries.map((item) => item[1]) };
  }

  private monthKeys(range: DateRange): string[] {
    const keys: string[] = [];
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const last = new Date(range.end.getFullYear(), range.end.getMonth(), 1);
    while (cursor.getTime() <= last.getTime()) {
      keys.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys.length > 0 ? keys : [monthKeyFromDate(range.start)];
  }

  private emptySeries(): ChartSeries {
    return { labels: [], values: [] };
  }
}
