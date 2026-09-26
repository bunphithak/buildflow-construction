import { Injectable, inject } from '@angular/core';
import { Attendance, AttendanceStatus, AttendanceWriteData } from '../models';
import { AttendanceSettingsService } from './attendance-settings.service';
import { roundMoney } from '../utils/datetime.util';

export interface LaborCalculationInput {
  status: AttendanceStatus;
  employmentTypeSnapshot: 'DAILY' | 'MONTHLY';
  dailyRateSnapshot?: number;
  monthlySalarySnapshot?: number;
  overtimeRateSnapshot?: number;
  overtimeHours: number;
}

export interface LaborCalculationResult {
  regularLaborCost: number;
  overtimeCost: number;
  totalLaborCost: number;
}

@Injectable({
  providedIn: 'root',
})
export class AttendanceCalculationService {
  private readonly settingsService = inject(AttendanceSettingsService);

  calculateWorkingMinutes(clockIn?: Date, clockOut?: Date, breakMinutes = 0): number {
    if (!clockIn || !clockOut) {
      return 0;
    }
    const diff = clockOut.getTime() - clockIn.getTime();
    if (diff <= 0) {
      return 0;
    }
    const minutes = diff / 60000 - Math.max(0, Number(breakMinutes ?? 0));
    return Math.max(0, minutes);
  }

  calculateNormalHours(clockIn?: Date, clockOut?: Date, breakMinutes = 0): number {
    return roundMoney(this.calculateWorkingMinutes(clockIn, clockOut, breakMinutes) / 60);
  }

  calculateRegularLaborCost(input: LaborCalculationInput): number {
    const settings = this.settingsService.get();
    const dailyRate = roundMoney(input.dailyRateSnapshot);
    const monthlySalary = roundMoney(input.monthlySalarySnapshot);
    const workingDays = Math.max(1, settings.monthlyWorkingDays);
    const monthlyDailyCost = roundMoney(monthlySalary / workingDays);

    const presentCost =
      input.employmentTypeSnapshot === 'DAILY' ? dailyRate : monthlyDailyCost;

    switch (input.status) {
      case 'PRESENT':
        return presentCost;
      case 'HALF_DAY':
      case 'HALF_DAY_MORNING':
      case 'HALF_DAY_AFTERNOON':
        return roundMoney(presentCost * 0.5);
      case 'HOLIDAY':
        return settings.paidHolidayEnabled ? presentCost : 0;
      case 'SITE_CLOSED':
      case 'SITE_CLOSED_MORNING':
      case 'SITE_CLOSED_AFTERNOON':
      case 'ABSENT':
      case 'LEAVE':
      default:
        return 0;
    }
  }

  calculateOvertimeCost(overtimeHours: number, overtimeRateSnapshot?: number): number {
    return roundMoney(Math.max(0, Number(overtimeHours ?? 0)) * Number(overtimeRateSnapshot ?? 0));
  }

  calculateTotalLaborCost(regularLaborCost: number, overtimeCost: number): number {
    return roundMoney(regularLaborCost + overtimeCost);
  }

  calculate(input: LaborCalculationInput): LaborCalculationResult {
    const regularLaborCost = this.calculateRegularLaborCost(input);
    const overtimeCost = this.calculateOvertimeCost(input.overtimeHours, input.overtimeRateSnapshot);
    return {
      regularLaborCost,
      overtimeCost,
      totalLaborCost: this.calculateTotalLaborCost(regularLaborCost, overtimeCost),
    };
  }

  applyToWriteData(
    data: AttendanceWriteData,
    clockIn?: Date,
    clockOut?: Date,
  ): AttendanceWriteData & {
    normalHours: number;
    regularLaborCost: number;
    overtimeCost: number;
    totalLaborCost: number;
  } {
    const hours = this.calculateNormalHours(clockIn, clockOut, data.breakMinutes);
    const costs = this.calculate({
      status: data.status,
      employmentTypeSnapshot: data.employmentTypeSnapshot,
      dailyRateSnapshot: data.dailyRateSnapshot,
      monthlySalarySnapshot: data.monthlySalarySnapshot,
      overtimeRateSnapshot: data.overtimeRateSnapshot,
      overtimeHours: data.overtimeHours,
    });
    return {
      ...data,
      normalHours: hours,
      ...costs,
    };
  }

  recalculateExisting(attendance: Attendance, clockIn?: Date, clockOut?: Date): LaborCalculationResult & {
    normalHours: number;
  } {
    const costs = this.calculate({
      status: attendance.status,
      employmentTypeSnapshot: attendance.employmentTypeSnapshot,
      dailyRateSnapshot: attendance.dailyRateSnapshot,
      monthlySalarySnapshot: attendance.monthlySalarySnapshot,
      overtimeRateSnapshot: attendance.overtimeRateSnapshot,
      overtimeHours: attendance.overtimeHours,
    });
    return {
      ...costs,
      normalHours: this.calculateNormalHours(clockIn, clockOut, attendance.breakMinutes),
    };
  }
}
