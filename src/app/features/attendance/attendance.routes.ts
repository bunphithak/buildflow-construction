import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';

export const attendanceRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
    loadComponent: () =>
      import('./attendance-list/attendance-list.component').then(
        (m) => m.AttendanceListComponent,
      ),
  },
  {
    path: 'daily',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./daily-attendance/daily-attendance.component').then(
        (m) => m.DailyAttendanceComponent,
      ),
  },
  {
    path: ':id/edit',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./attendance-edit/attendance-edit.component').then(
        (m) => m.AttendanceEditComponent,
      ),
  },
];
