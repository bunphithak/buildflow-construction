import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const payrollRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./payroll-list/payroll-list.component').then((m) => m.PayrollListComponent),
  },
  {
    path: 'generate',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./payroll-generate/payroll-generate.component').then(
        (m) => m.PayrollGenerateComponent,
      ),
  },
  {
    path: 'advances',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./advance-list/advance-list.component').then((m) => m.AdvanceListComponent),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./payroll-detail/payroll-detail.component').then((m) => m.PayrollDetailComponent),
  },
  {
    path: ':id/payslip',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'EMPLOYEE'] },
    loadComponent: () =>
      import('./payslip-view/payslip-view.component').then((m) => m.PayslipViewComponent),
  },
  {
    path: ':id',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'EMPLOYEE'] },
    loadComponent: () =>
      import('./payroll-detail/payroll-detail.component').then((m) => m.PayrollDetailComponent),
  },
];
