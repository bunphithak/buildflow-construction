import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

const loadPlaceholder = () =>
  import('./shared/components/placeholder-page/placeholder-page.component').then(
    (m) => m.PlaceholderPageComponent,
  );

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'employees',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadChildren: () =>
          import('./features/employees/employees.routes').then((m) => m.employeeRoutes),
      },
      {
        path: 'attendance',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
        loadChildren: () =>
          import('./features/attendance/attendance.routes').then((m) => m.attendanceRoutes),
      },
      {
        path: 'jobs',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'MANAGER'] },
        loadChildren: () =>
          import('./features/jobs/jobs.routes').then((m) => m.jobRoutes),
      },
      {
        path: 'expenses',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'MANAGER'] },
        loadChildren: () =>
          import('./features/expenses/expenses.routes').then((m) => m.expenseRoutes),
      },
      {
        path: 'payroll',
        loadChildren: () =>
          import('./features/payroll/payroll.routes').then((m) => m.payrollRoutes),
      },
      {
        path: 'payslips',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'EMPLOYEE'] },
        loadComponent: () =>
          import('./features/payroll/payslip-list/payslip-list.component').then(
            (m) => m.PayslipListComponent,
          ),
      },
      {
        path: 'reports',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN', 'MANAGER'] },
        loadChildren: () =>
          import('./features/reports/reports.routes').then((m) => m.reportRoutes),
      },
      {
        path: 'settings',
        canActivate: [roleGuard],
        data: { roles: ['ADMIN'] },
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.settingsRoutes),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
