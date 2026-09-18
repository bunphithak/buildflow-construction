import { Attendance, Employee, Payroll, PayrollAdjustment, PayrollAttendanceSummary, PayrollTotals } from '../models';
import {
  bangkokDateKey,
  daysInBangkokMonth,
  formatPayrollPeriod,
  formatPayrollRangeLabel,
  inclusiveCalendarDays,
  roundMoney,
} from './datetime.util';

const FULL_DAY_HOURS = 7;

export type PayrollDayKind = 'FULL' | 'HALF' | 'ABSENT' | 'LEAVE' | 'HOLIDAY' | 'NONE';

export interface PayrollRateSnapshot {
  employmentTypeSnapshot: 'DAILY' | 'MONTHLY';
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
}

export function snapshotEmployeeRates(employee: Employee): PayrollRateSnapshot {
  return {
    employmentTypeSnapshot: employee.employmentType,
    dailyRateSnapshot: employee.dailyRate,
    monthlySalarySnapshot: employee.monthlySalary,
    overtimeRateSnapshot: employee.overtimeRate,
  };
}

export function classifyCalendarDay(records: Attendance[]): PayrollDayKind {
  const work = records.filter((item) => item.status === 'PRESENT' || item.status === 'HALF_DAY');
  if (work.length > 0) {
    if (work.some((item) => item.status === 'PRESENT')) {
      return 'FULL';
    }
    const hours = work.reduce((sum, item) => sum + item.normalHours, 0);
    if (work.length > 1 || hours >= FULL_DAY_HOURS) {
      return 'FULL';
    }
    return 'HALF';
  }
  if (records.some((item) => item.status === 'ABSENT')) {
    return 'ABSENT';
  }
  if (records.some((item) => item.status === 'LEAVE')) {
    return 'LEAVE';
  }
  if (records.some((item) => item.status === 'HOLIDAY')) {
    return 'HOLIDAY';
  }
  return 'NONE';
}

export function groupAttendanceByCalendarDate(rows: Attendance[]): Map<string, Attendance[]> {
  const map = new Map<string, Attendance[]>();
  for (const row of rows) {
    const key = bangkokDateKey(row.workDate.toDate());
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  }
  return map;
}

export function summarizeAttendanceForPayroll(
  rows: Attendance[],
  rates: PayrollRateSnapshot,
  range?: { start: Date; end: Date },
): PayrollAttendanceSummary {
  const grouped = groupAttendanceByCalendarDate(rows);
  let totalWorkDays = 0;
  let totalHalfDays = 0;
  let totalAbsentDays = 0;
  let totalLeaveDays = 0;
  let totalNormalHours = 0;
  let totalOvertimeHours = 0;

  for (const dayRows of grouped.values()) {
    const kind = classifyCalendarDay(dayRows);
    if (kind === 'FULL') {
      totalWorkDays += 1;
    } else if (kind === 'HALF') {
      totalHalfDays += 1;
    } else if (kind === 'ABSENT') {
      totalAbsentDays += 1;
    } else if (kind === 'LEAVE') {
      totalLeaveDays += 1;
    }
    for (const row of dayRows) {
      totalNormalHours += row.normalHours;
      totalOvertimeHours += row.overtimeHours;
    }
  }

  const overtimePay = roundMoney(totalOvertimeHours * (rates.overtimeRateSnapshot ?? 0));
  let basePay = 0;
  if (rates.employmentTypeSnapshot === 'MONTHLY') {
    const salary = rates.monthlySalarySnapshot ?? 0;
    if (range) {
      const periodDays = inclusiveCalendarDays(range.start, range.end);
      const monthDays = daysInBangkokMonth(
        Number(bangkokDateKey(range.end).slice(0, 4)),
        Number(bangkokDateKey(range.end).slice(5, 7)),
      );
      basePay = roundMoney(salary * (periodDays / monthDays));
    } else {
      basePay = roundMoney(salary);
    }
  } else {
    const dailyRate = rates.dailyRateSnapshot ?? 0;
    basePay = roundMoney(totalWorkDays * dailyRate + totalHalfDays * dailyRate * 0.5);
  }

  return {
    totalWorkDays,
    totalHalfDays,
    totalAbsentDays,
    totalLeaveDays,
    totalNormalHours: roundMoney(totalNormalHours),
    totalOvertimeHours: roundMoney(totalOvertimeHours),
    basePay,
    overtimePay,
  };
}

export function calculatePayrollTotals(
  basePay: number,
  overtimePay: number,
  adjustments: Pick<PayrollAdjustment, 'type' | 'category' | 'amount'>[],
  advanceDeduction: number,
): PayrollTotals {
  const bonus = roundMoney(
    adjustments
      .filter((item) => item.type === 'INCOME' && item.category === 'โบนัส')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const additionalIncome = roundMoney(
    adjustments
      .filter((item) => item.type === 'INCOME' && item.category !== 'โบนัส')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const otherDeduction = roundMoney(
    adjustments
      .filter((item) => item.type === 'DEDUCTION')
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const totalIncome = roundMoney(basePay + overtimePay + additionalIncome + bonus);
  const safeAdvance = roundMoney(advanceDeduction);
  const totalDeduction = roundMoney(safeAdvance + otherDeduction);
  const netPay = roundMoney(totalIncome - totalDeduction);
  return {
    additionalIncome,
    bonus,
    totalIncome,
    advanceDeduction: safeAdvance,
    otherDeduction,
    totalDeduction,
    netPay,
  };
}

export function hasPayableWork(summary: Pick<PayrollAttendanceSummary, 'totalWorkDays' | 'totalHalfDays'>): boolean {
  return summary.totalWorkDays > 0 || summary.totalHalfDays > 0;
}

export function payrollDisplayLabel(item: Payroll): string {
  if (item.periodStart && item.periodEnd) {
    return formatPayrollRangeLabel(item.periodStart.toDate(), item.periodEnd.toDate(), item.payDate?.toDate());
  }
  return formatPayrollPeriod(item.year, item.month);
}
