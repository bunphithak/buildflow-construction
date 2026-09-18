import { JobCostSummary } from './cost.model';

export interface AttendanceStatusCounts {
  present: number;
  absent: number;
  leave: number;
  halfDay: number;
  holiday: number;
}

export interface DashboardSummary {
  employeeCount: number;
  presentToday: number;
  absentToday: number;
  openJobs: number;
  completedJobs: number;
  laborCost: number;
  expenseCost: number;
  payrollPaid: number;
  attendance: AttendanceStatusCounts;
  topProfitJobs: JobCostSummary[];
  topSpendJobs: JobCostSummary[];
  overBudgetJobs: JobCostSummary[];
  monthlyLabor: ChartSeries;
  monthlyExpense: ChartSeries;
  monthlyTotalCost: ChartSeries;
  monthlyProfit: ChartSeries;
  expenseByCategory: ChartSeries;
  laborByJob: ChartSeries;
}

export interface ChartSeries {
  labels: string[];
  values: number[];
}

export interface AttendanceReportRow {
  date: string;
  employeeName: string;
  jobName: string;
  clockIn: string;
  clockOut: string;
  overtimeHours: number;
  status: string;
}

export interface AttendanceReport {
  rows: AttendanceReportRow[];
  workDayCount: number;
  overtimeHours: number;
}

export interface LaborReportRow {
  jobName: string;
  employeeCount: number;
  workDays: number;
  overtimeHours: number;
  laborCost: number;
}

export interface ExpenseReportRow {
  jobName: string;
  category: string;
  itemCount: number;
  amount: number;
}

export interface ExpenseReportSummary {
  material: number;
  fuel: number;
  machine: number;
  safety: number;
  other: number;
  total: number;
}

export interface PayrollReportRow {
  employeeName: string;
  basePay: number;
  overtimePay: number;
  bonus: number;
  additionalIncome: number;
  totalIncome: number;
  totalDeduction: number;
  netPay: number;
  status: string;
}

export interface ExecutiveReport {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  margin: number;
  openJobs: number;
  closedJobs: number;
  payrollPaid: number;
  payrollPending: number;
  laborCost: number;
  expenseCost: number;
}
