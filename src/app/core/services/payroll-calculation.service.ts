import { Injectable } from '@angular/core';
import { Attendance, Employee, PayrollAttendanceSummary } from '../models';
import {
  PayrollRateSnapshot,
  snapshotEmployeeRates,
  summarizeAttendanceForPayroll,
} from '../utils/payroll.util';

@Injectable({
  providedIn: 'root',
})
export class PayrollCalculationService {
  snapshotRates(employee: Employee): PayrollRateSnapshot {
    return snapshotEmployeeRates(employee);
  }

  summarize(
    rows: Attendance[],
    rates: PayrollRateSnapshot,
    range?: { start: Date; end: Date },
  ): PayrollAttendanceSummary {
    return summarizeAttendanceForPayroll(rows, rates, range);
  }

  summarizeForEmployee(
    employee: Employee,
    rows: Attendance[],
    range?: { start: Date; end: Date },
  ): PayrollAttendanceSummary {
    return this.summarize(rows, this.snapshotRates(employee), range);
  }
}
