import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const expenseRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./expense-list/expense-list.component').then((m) => m.ExpenseListComponent),
  },
  {
    path: 'new',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./expense-form/expense-form.component').then((m) => m.ExpenseFormComponent),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./expense-form/expense-form.component').then((m) => m.ExpenseFormComponent),
  },
  {
    path: ':id',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./expense-detail/expense-detail.component').then((m) => m.ExpenseDetailComponent),
  },
];
