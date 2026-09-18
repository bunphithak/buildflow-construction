import { inject, Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AttendanceReport,
  CompanySettings,
  ExecutiveReport,
  ExpenseReportRow,
  ExpenseReportSummary,
  JobCostSummary,
  PayrollReportRow,
} from '../models';
import { CompanySettingsService } from './company-settings.service';

@Injectable({
  providedIn: 'root',
})
export class PdfExportService {
  private readonly companySettings = inject(CompanySettingsService);

  async exportAttendance(
    report: AttendanceReport,
    periodLabel: string,
    filename = 'Attendance.pdf',
  ): Promise<void> {
    await this.tablePdf(
      filename,
      'รายงานการลงเวลาทำงาน',
      periodLabel,
      ['วันที่', 'พนักงาน', 'Job', 'เข้า', 'ออก', 'OT', 'สถานะ'],
      report.rows.map((row) => [
        row.date,
        row.employeeName,
        row.jobName,
        row.clockIn,
        row.clockOut,
        String(row.overtimeHours),
        row.status,
      ]),
    );
  }

  async exportExpense(
    rows: ExpenseReportRow[],
    summary: ExpenseReportSummary,
    periodLabel: string,
    filename = 'Expense.pdf',
  ): Promise<void> {
    await this.tablePdf(
      filename,
      'รายงานค่าใช้จ่าย',
      periodLabel,
      ['Job', 'หมวด', 'รายการ', 'ยอดรวม'],
      [
        ...rows.map((row) => [row.jobName, row.category, String(row.itemCount), this.money(row.amount)]),
        ['รวมวัสดุ', '', '', this.money(summary.material)],
        ['รวมน้ำมัน', '', '', this.money(summary.fuel)],
        ['รวมเครื่องจักร', '', '', this.money(summary.machine)],
        ['Safety', '', '', this.money(summary.safety)],
        ['อื่นๆ', '', '', this.money(summary.other)],
        ['รวมทั้งหมด', '', '', this.money(summary.total)],
      ],
    );
  }

  async exportJobCost(
    rows: JobCostSummary[],
    periodLabel: string,
    filename = 'JobCost.pdf',
  ): Promise<void> {
    const doc = await this.createDoc('รายงานต้นทุนงานก่อสร้าง', periodLabel);
    rows.forEach((row, index) => {
      if (index > 0) {
        doc.addPage();
        this.header(doc, 'รายงานต้นทุนงานก่อสร้าง', periodLabel);
      }
      const startY = 48;
      doc.setFontSize(14);
      doc.text(row.jobName, 14, startY);
      doc.setFontSize(11);
      const lines = [
        ['มูลค่างาน', this.money(row.contractValue)],
        ['ค่าแรง', this.money(row.laborCost)],
        ['ค่าใช้จ่าย', this.money(row.expenseCost)],
        ['ต้นทุนรวม', this.money(row.totalCost)],
        ['กำไร', this.money(row.estimatedProfit)],
        ['Margin', `${row.profitMargin.toFixed(2)}%`],
        ['งบคงเหลือ', this.money(row.remainingBudget)],
      ];
      autoTable(doc, {
        startY: startY + 6,
        theme: 'plain',
        styles: { font: this.font(doc), fontSize: 11 },
        body: lines,
      });
      autoTable(doc, {
        startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
        head: [['รายการ', 'จำนวนเงิน']],
        body: row.breakdown.map((item) => [item.name, this.money(item.amount)]),
        styles: { font: this.font(doc), fontSize: 10 },
        headStyles: { fillColor: [15, 28, 46] },
      });
    });
    this.save(doc, filename);
  }

  async exportPayroll(
    rows: PayrollReportRow[],
    periodLabel: string,
    filename = 'Payroll.pdf',
  ): Promise<void> {
    await this.tablePdf(
      filename,
      'รายงาน Payroll',
      periodLabel,
      ['พนักงาน', 'รายได้', 'OT', 'โบนัส', 'หัก', 'สุทธิ', 'สถานะ'],
      rows.map((row) => [
        row.employeeName,
        this.money(row.totalIncome),
        this.money(row.overtimePay),
        this.money(row.bonus),
        this.money(row.totalDeduction),
        this.money(row.netPay),
        row.status,
      ]),
    );
  }

  async exportExecutive(
    report: ExecutiveReport,
    periodLabel: string,
    filename = 'ExecutiveReport.pdf',
  ): Promise<void> {
    const doc = await this.createDoc('Executive Summary', periodLabel);
    autoTable(doc, {
      startY: 48,
      theme: 'striped',
      styles: { font: this.font(doc), fontSize: 11 },
      head: [['รายการ', 'มูลค่า']],
      body: [
        ['รายได้รวม', this.money(report.totalRevenue)],
        ['ต้นทุนรวม', this.money(report.totalCost)],
        ['กำไรรวม', this.money(report.totalProfit)],
        ['Margin รวม', `${report.margin.toFixed(2)}%`],
        ['Job เปิด', String(report.openJobs)],
        ['Job ปิด', String(report.closedJobs)],
        ['Payroll จ่ายแล้ว', this.money(report.payrollPaid)],
        ['Payroll รอจ่าย', this.money(report.payrollPending)],
      ],
      headStyles: { fillColor: [15, 28, 46] },
    });
    this.save(doc, filename);
  }

  private async tablePdf(
    filename: string,
    title: string,
    periodLabel: string,
    head: string[],
    body: string[][],
  ): Promise<void> {
    const doc = await this.createDoc(title, periodLabel);
    autoTable(doc, {
      startY: 48,
      head: [head],
      body,
      styles: { font: this.font(doc), fontSize: 9 },
      headStyles: { fillColor: [15, 28, 46] },
    });
    this.save(doc, filename);
  }

  private async createDoc(title: string, periodLabel: string): Promise<jsPDF> {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    await this.embedFont(doc);
    this.header(doc, title, periodLabel);
    return doc;
  }

  private header(doc: jsPDF, title: string, periodLabel: string): void {
    const settings = this.company();
    doc.setFont(this.font(doc), 'normal');
    doc.setFontSize(14);
    doc.text(settings.companyName, 14, 14);
    doc.setFontSize(11);
    doc.text(title, 14, 22);
    doc.setFontSize(9);
    doc.text(`ช่วงวันที่: ${periodLabel}`, 14, 28);
    doc.text(`วันที่สร้าง: ${new Intl.DateTimeFormat('th-TH').format(new Date())}`, 14, 34);
    const meta = [
      settings.address,
      settings.phone ? `โทร ${settings.phone}` : '',
      settings.taxId ? `เลขผู้เสียภาษี ${settings.taxId}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (meta) {
      doc.text(meta, 14, 40);
    }
  }

  private save(doc: jsPDF, filename: string): void {
    const total = doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.text(`หน้า ${page}/${total}`, 280, 200, { align: 'right' });
    }
    doc.save(filename);
  }

  private font(doc: jsPDF): string {
    const fonts = doc.getFontList();
    return fonts['Sarabun'] ? 'Sarabun' : 'helvetica';
  }

  private async embedFont(doc: jsPDF): Promise<void> {
    try {
      const response = await fetch('assets/fonts/Sarabun-Regular.ttf');
      if (!response.ok) {
        return;
      }
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      const base64 = btoa(binary);
      doc.addFileToVFS('Sarabun-Regular.ttf', base64);
      doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
      doc.setFont('Sarabun');
    } catch {
      return;
    }
  }

  private company(): CompanySettings {
    return this.companySettings.settings();
  }

  private money(value: number): string {
    return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      value,
    );
  }
}
