import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const reportRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./reports-home/reports-home.component').then((m) => m.ReportsHomeComponent),
  },
  {
    path: 'attendance',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./attendance-report/attendance-report.component').then(
        (m) => m.AttendanceReportComponent,
      ),
  },
  {
    path: 'labor',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./labor-report/labor-report.component').then((m) => m.LaborReportComponent),
  },
  {
    path: 'expenses',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./expense-report/expense-report.component').then((m) => m.ExpenseReportComponent),
  },
  {
    path: 'job-cost',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./job-cost-report/job-cost-report.component').then((m) => m.JobCostReportComponent),
  },
  {
    path: 'payroll',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./payroll-report/payroll-report.component').then((m) => m.PayrollReportComponent),
  },
  {
    path: 'executive',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./executive-report/executive-report.component').then(
        (m) => m.ExecutiveReportComponent,
      ),
  },
];
