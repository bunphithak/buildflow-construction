import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-reports-home',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <app-page-header title="ศูนย์รายงาน" subtitle="Attendance, Labor, Expense, Job Cost, Payroll และ Executive" />
    <section class="grid">
      <a class="card" routerLink="/reports/attendance"><h2>Attendance</h2><p>รายงานลงเวลาทำงาน</p></a>
      <a class="card" routerLink="/reports/labor"><h2>Labor</h2><p>รายงานค่าแรงตาม Job</p></a>
      <a class="card" routerLink="/reports/expenses"><h2>Expense</h2><p>รายงานค่าใช้จ่ายตามหมวด</p></a>
      <a class="card" routerLink="/reports/job-cost"><h2>Job Cost</h2><p>ต้นทุน กำไร Margin และงบ</p></a>
      <a class="card" routerLink="/reports/payroll"><h2>Payroll</h2><p>รายได้ หัก และยอดสุทธิ</p></a>
      <a class="card" routerLink="/reports/executive"><h2>Executive</h2><p>สรุปภาพรวมผู้บริหาร</p></a>
    </section>
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 1rem;
      }
      a.card {
        text-decoration: none;
        color: inherit;
      }
      h2 {
        margin: 0 0 0.4rem;
      }
      p {
        margin: 0;
        color: var(--color-muted);
      }
      @media (max-width: 960px) {
        .grid {
          grid-template-columns: 1fr 1fr;
        }
      }
      @media (max-width: 640px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class ReportsHomeComponent {}
