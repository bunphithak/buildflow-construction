import { BudgetAlertLevel, ExpenseBreakdownItem, JobCostSummary } from '../models/cost.model';
import { roundMoney } from './datetime.util';

export interface JobCostInput {
  jobId: string;
  jobName: string;
  contractValue: number;
  estimatedBudget?: number;
  laborCost?: number;
  expenseCost?: number;
  materialCost?: number;
  equipmentCost?: number;
  fuelCost?: number;
  otherExpense?: number;
  breakdown?: ExpenseBreakdownItem[];
  variationAmount?: number;
  billedAmount?: number;
  receivedAmount?: number;
}

export function calculateJobCostSummary(input: JobCostInput): JobCostSummary {
  const laborCost = roundMoney(input.laborCost);
  const materialCost = roundMoney(input.materialCost);
  const equipmentCost = roundMoney(input.equipmentCost);
  const fuelCost = roundMoney(input.fuelCost);
  const otherExpense = roundMoney(input.otherExpense);
  const expenseCost = roundMoney(
    input.expenseCost ?? materialCost + equipmentCost + fuelCost + otherExpense,
  );
  const totalCost = roundMoney(laborCost + expenseCost);
  const contractValue = roundMoney(input.contractValue);
  const estimatedBudget = roundMoney(input.estimatedBudget);
  const variationAmount = roundMoney(input.variationAmount);
  const totalRevenue = roundMoney(contractValue + variationAmount);
  const billedAmount = roundMoney(input.billedAmount);
  const receivedAmount = roundMoney(input.receivedAmount);
  const outstandingAmount = roundMoney(totalRevenue - receivedAmount);
  const estimatedProfit = roundMoney(totalRevenue - totalCost);
  const cashProfit = roundMoney(receivedAmount - totalCost);
  const remainingBudget = roundMoney(estimatedBudget - totalCost);
  const profitMargin = totalRevenue > 0 ? (estimatedProfit / totalRevenue) * 100 : 0;
  const budgetUsedPercent = estimatedBudget > 0 ? (totalCost / estimatedBudget) * 100 : 0;

  return {
    jobId: input.jobId,
    jobName: input.jobName,
    contractValue,
    estimatedBudget,
    laborCost,
    expenseCost,
    materialCost,
    equipmentCost,
    fuelCost,
    otherExpense,
    totalExpense: expenseCost,
    totalCost,
    totalJobCost: totalCost,
    estimatedProfit,
    profitMargin,
    budgetUsedPercent,
    remainingBudget,
    breakdown: input.breakdown ?? [],
    variationAmount,
    totalRevenue,
    billedAmount,
    receivedAmount,
    outstandingAmount,
    cashProfit,
  };
}

export function getBudgetAlertLevel(budgetUsedPercent: number): BudgetAlertLevel {
  if (budgetUsedPercent >= 100) {
    return 'over';
  }
  if (budgetUsedPercent >= 80) {
    return 'warning';
  }
  if (budgetUsedPercent >= 70) {
    return 'elevated';
  }
  return 'ok';
}

export function getBudgetAlertLabel(level: BudgetAlertLevel): string {
  switch (level) {
    case 'over':
      return 'เกินงบประมาณ';
    case 'warning':
      return 'ใกล้เต็มงบ';
    case 'elevated':
      return 'เริ่มใช้จ่ายสูง';
    default:
      return 'ปกติ';
  }
}

export function getBudgetAlertIcon(level: BudgetAlertLevel): string {
  switch (level) {
    case 'over':
      return '✕';
    case 'warning':
    case 'elevated':
      return '!';
    default:
      return '✓';
  }
}
