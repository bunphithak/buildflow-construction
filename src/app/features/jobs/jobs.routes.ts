import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const jobRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./job-list/job-list.component').then((m) => m.JobListComponent),
  },
  {
    path: 'new',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./job-form/job-form.component').then((m) => m.JobFormComponent),
  },
  {
    path: ':id',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./job-detail/job-detail.component').then((m) => m.JobDetailComponent),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./job-form/job-form.component').then((m) => m.JobFormComponent),
  },
];
