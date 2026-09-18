import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const settingsRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./settings-home/settings-home.component').then((m) => m.SettingsHomeComponent),
  },
  {
    path: 'company',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./company-settings/company-settings.component').then(
        (m) => m.CompanySettingsComponent,
      ),
  },
  {
    path: 'expense-categories',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./expense-categories/expense-categories.component').then(
        (m) => m.ExpenseCategoriesComponent,
      ),
  },
  {
    path: 'users',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./user-list/user-list.component').then((m) => m.UserListComponent),
  },
  {
    path: 'users/new',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./user-form/user-form.component').then((m) => m.UserFormComponent),
  },
  {
    path: 'users/:uid/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN'] },
    loadComponent: () =>
      import('./user-form/user-form.component').then((m) => m.UserFormComponent),
  },
];
