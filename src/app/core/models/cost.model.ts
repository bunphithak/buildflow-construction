export interface EmployeeLaborCost {
  employeeId: string;
  employeeName: string;
  workDays: number;
  overtimeHours: number;
  laborCost: number;
}

export interface JobLaborCostSummary {
  jobId: string;
  jobName: string;
  employees: EmployeeLaborCost[];
  totalLaborCost: number;
}

export interface ExpenseBreakdownItem {
  code: string;
  name: string;
  amount: number;
}

export interface JobCostSummary {
  jobId: string;
  jobName: string;
  contractValue: number;
  estimatedBudget: number;
  laborCost: number;
  expenseCost: number;
  materialCost: number;
  equipmentCost: number;
  fuelCost: number;
  otherExpense: number;
  totalExpense: number;
  totalCost: number;
  totalJobCost: number;
  estimatedProfit: number;
  profitMargin: number;
  budgetUsedPercent: number;
  remainingBudget: number;
  breakdown: ExpenseBreakdownItem[];
}

export type BudgetAlertLevel = 'ok' | 'elevated' | 'warning' | 'over';
