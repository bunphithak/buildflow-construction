import { inject, Injectable } from '@angular/core';
import { Expense, Job, JobCostSummary } from '../models';
import { ExpenseBreakdownItem } from '../models/cost.model';
import { roundMoney } from '../utils/datetime.util';
import { calculateJobCostSummary } from '../utils/job-cost.util';
import { AttendanceService } from './attendance.service';
import { ExpenseService } from './expense.service';
import { ExpenseCategoryService } from './expense-category.service';
import { JobService } from './job.service';

@Injectable({
  providedIn: 'root',
})
export class JobCostService {
  private readonly jobService = inject(JobService);
  private readonly attendanceService = inject(AttendanceService);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(ExpenseCategoryService);

  summarize(
    job: Job,
    laborCost = 0,
    expenseCost = 0,
    breakdown: ExpenseBreakdownItem[] = [],
  ): JobCostSummary {
    const grouped = this.groupKnownCosts(breakdown);
    const withLabor = this.withLaborBreakdown(laborCost, breakdown);
    return calculateJobCostSummary({
      jobId: job.id,
      jobName: job.jobName,
      contractValue: job.contractValue,
      estimatedBudget: job.estimatedBudget,
      laborCost,
      expenseCost,
      materialCost: grouped.material,
      fuelCost: grouped.fuel,
      equipmentCost: grouped.machine,
      otherExpense: grouped.other,
      breakdown: withLabor,
    });
  }

  async getLaborCost(jobId: string): Promise<number> {
    return this.attendanceService.getLaborCostByJob(jobId);
  }

  async getExpenseCost(jobId: string): Promise<number> {
    return this.expenseService.getExpenseTotalByJob(jobId);
  }

  async getExpenseBreakdown(jobId: string): Promise<ExpenseBreakdownItem[]> {
    const rows = await this.expenseService.getExpensesByJob(jobId);
    return this.toBreakdown(rows);
  }

  async getJobCostSummary(jobId: string): Promise<JobCostSummary | null> {
    const job = await this.jobService.getJobById(jobId);
    if (!job) {
      return null;
    }
    const laborCost = await this.getLaborCost(jobId);
    const expenses = await this.expenseService.getExpensesByJob(jobId);
    return this.calculateJobCostSummary(job, laborCost, this.expenseTotal(expenses), this.toBreakdown(expenses));
  }

  async getJobCostSummaryByDateRange(
    jobId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<JobCostSummary | null> {
    const job = await this.jobService.getJobById(jobId);
    if (!job) {
      return null;
    }
    const laborCost = await this.attendanceService.getLaborCostByJobAndDateRange(
      jobId,
      startDate,
      endDate,
    );
    const expenses = await this.expenseService.getExpensesByJobAndDateRange(
      jobId,
      startDate,
      endDate,
    );
    return this.calculateJobCostSummary(
      job,
      laborCost,
      this.expenseTotal(expenses),
      this.toBreakdown(expenses),
    );
  }

  calculateJobCostSummary(
    job: Job,
    laborCost: number,
    expenseCost: number,
    breakdown: ExpenseBreakdownItem[] = [],
  ): JobCostSummary {
    return this.summarize(job, laborCost, expenseCost, breakdown);
  }

  toBreakdown(expenses: Expense[]): ExpenseBreakdownItem[] {
    const map = new Map<string, ExpenseBreakdownItem>();
    for (const expense of expenses) {
      const category = this.categoryService.getById(expense.categoryId);
      const key = category?.code || expense.categoryId;
      const current = map.get(key) ?? {
        code: key,
        name: expense.categoryNameSnapshot,
        amount: 0,
      };
      current.amount = roundMoney(current.amount + expense.amount);
      map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  private expenseTotal(expenses: Expense[]): number {
    return roundMoney(expenses.reduce((sum, item) => sum + item.amount, 0));
  }

  private withLaborBreakdown(
    laborCost: number,
    breakdown: ExpenseBreakdownItem[],
  ): ExpenseBreakdownItem[] {
    return [
      { code: 'LABOR', name: 'ค่าแรงพนักงาน', amount: roundMoney(laborCost) },
      ...breakdown.filter((item) => item.code !== 'LABOR'),
    ];
  }

  private groupKnownCosts(breakdown: ExpenseBreakdownItem[]): {
    material: number;
    fuel: number;
    machine: number;
    other: number;
  } {
    const result = { material: 0, fuel: 0, machine: 0, other: 0 };
    for (const item of breakdown) {
      if (item.code === 'LABOR') {
        continue;
      }
      if (item.code === 'MAT') {
        result.material += item.amount;
      } else if (item.code === 'FUEL') {
        result.fuel += item.amount;
      } else if (item.code === 'MACHINE' || item.code === 'RENT') {
        result.machine += item.amount;
      } else {
        result.other += item.amount;
      }
    }
    return result;
  }
}
