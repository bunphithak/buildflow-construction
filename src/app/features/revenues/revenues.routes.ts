import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const revenueRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./revenue-list/revenue-list.component').then((m) => m.RevenueListComponent),
  },
  {
    path: 'new',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./revenue-form/revenue-form.component').then((m) => m.RevenueFormComponent),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./revenue-form/revenue-form.component').then((m) => m.RevenueFormComponent),
  },
  {
    path: ':id',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./revenue-detail/revenue-detail.component').then((m) => m.RevenueDetailComponent),
  },
];
