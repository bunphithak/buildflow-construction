import { Injectable, inject } from '@angular/core';
import ExcelJS from 'exceljs';
import {
  AttendanceReport,
  ExpenseReportRow,
  ExpenseReportSummary,
  JobCostSummary,
  LaborReportRow,
  PayrollReportRow,
} from '../models';
import { BusyService } from './busy.service';

@Injectable({
  providedIn: 'root',
})
export class ExcelExportService {
  private readonly busy = inject(BusyService);

  constructor() {
    this.busy.guard(this, [
      'exportAttendance',
      'exportLabor',
      'exportExpense',
      'exportJobCost',
      'exportPayroll',
    ]);
  }
  async exportAttendance(report: AttendanceReport, filename = 'Attendance.xlsx'): Promise<void> {
    await this.download(
      filename,
      'ลงเวลาทำงาน',
      ['วันที่', 'พนักงาน', 'Job', 'เข้า', 'ออก', 'OT', 'สถานะ'],
      report.rows.map((row) => [
        row.date,
        row.employeeName,
        row.jobName,
        row.clockIn,
        row.clockOut,
        row.overtimeHours,
        row.status,
      ]),
      [6],
    );
  }

  async exportLabor(rows: LaborReportRow[], filename = 'Labor.xlsx'): Promise<void> {
    await this.download(
      filename,
      'ค่าแรง',
      ['Job', 'จำนวนคน', 'วันทำงาน', 'OT', 'ค่าแรง'],
      rows.map((row) => [row.jobName, row.employeeCount, row.workDays, row.overtimeHours, row.laborCost]),
      [5],
    );
  }

  async exportExpense(
    rows: ExpenseReportRow[],
    summary: ExpenseReportSummary,
    filename = 'Expense.xlsx',
  ): Promise<void> {
    await this.download(
      filename,
      'ค่าใช้จ่าย',
      ['Job', 'หมวด', 'จำนวนรายการ', 'ยอดรวม'],
      [
        ...rows.map((row) => [row.jobName, row.category, row.itemCount, row.amount]),
        [],
        ['สรุป', 'วัสดุ', '', summary.material],
        ['', 'น้ำมัน', '', summary.fuel],
        ['', 'เครื่องจักร', '', summary.machine],
        ['', 'Safety', '', summary.safety],
        ['', 'อื่นๆ', '', summary.other],
        ['', 'รวม', '', summary.total],
      ],
      [4],
    );
  }

  async exportJobCost(rows: JobCostSummary[], filename = 'JobCost.xlsx'): Promise<void> {
    await this.download(
      filename,
      'ต้นทุน Job',
      [
        'งาน',
        'มูลค่างาน',
        'ค่าแรง',
        'ค่าใช้จ่าย',
        'ต้นทุนรวม',
        'กำไรประมาณการ',
        'Margin %',
        'ใช้ไปจากงบ %',
        'งบคงเหลือ',
      ],
      rows.map((row) => [
        row.jobName,
        row.contractValue,
        row.laborCost,
        row.expenseCost,
        row.totalCost,
        row.estimatedProfit,
        row.profitMargin,
        row.budgetUsedPercent,
        row.remainingBudget,
      ]),
      [2, 3, 4, 5, 6, 9],
    );
  }

  async exportPayroll(rows: PayrollReportRow[], filename = 'Payroll.xlsx'): Promise<void> {
    await this.download(
      filename,
      'Payroll',
      ['พนักงาน', 'รายได้', 'OT', 'โบนัส', 'เงินเพิ่ม', 'หัก', 'สุทธิ', 'สถานะ'],
      rows.map((row) => [
        row.employeeName,
        row.totalIncome,
        row.overtimePay,
        row.bonus,
        row.additionalIncome,
        row.totalDeduction,
        row.netPay,
        row.status,
      ]),
      [2, 3, 4, 5, 6, 7],
    );
  }

  private async download(
    filename: string,
    sheetName: string,
    headers: string[],
    rows: (string | number | null)[][],
    moneyCols: number[],
  ): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    for (const row of rows) {
      sheet.addRow(row);
    }
    sheet.columns.forEach((column, index) => {
      let width = headers[index]?.length ?? 10;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        width = Math.max(width, String(cell.value ?? '').length);
        if (moneyCols.includes(index + 1) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0.00';
        }
      });
      column.width = Math.min(Math.max(width + 2, 12), 40);
    });
    const buffer = await workbook.xlsx.writeBuffer();
    this.save(buffer, filename);
  }

  private save(buffer: ArrayBuffer, filename: string): void {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}
