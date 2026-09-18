import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { roleGuard } from '../../core/guards/role.guard';

const sendSuperAdminToDaily: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.initialized$.pipe(
    map(() => {
      if (authService.hasRole(['ADMIN'])) {
        return router.createUrlTree(['/attendance/daily'], { queryParams: route.queryParams });
      }
      return true;
    }),
  );
};

const sendRegularAdminToToday: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.initialized$.pipe(
    map(() => {
      if (!authService.hasRole(['ADMIN'])) {
        return router.createUrlTree(['/attendance/today'], { queryParams: route.queryParams });
      }
      return true;
    }),
  );
};

const sendEmployeeToToday: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.initialized$.pipe(
    map(() => {
      if (authService.hasRole(['MANAGER'])) {
        return router.createUrlTree(['/attendance/today']);
      }
      return true;
    }),
  );
};

export const attendanceRoutes: Routes = [
  {
    path: '',
    canActivate: [roleGuard, sendEmployeeToToday],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./attendance-list/attendance-list.component').then(
        (m) => m.AttendanceListComponent,
      ),
  },
  {
    path: 'today',
    canActivate: [roleGuard, sendSuperAdminToDaily],
    data: { roles: ['ADMIN', 'MANAGER'] },
    loadComponent: () =>
      import('./attendance-today/attendance-today.component').then(
        (m) => m.AttendanceTodayComponent,
      ),
  },
  {
    path: 'daily',
    canActivate: [roleGuard, sendRegularAdminToToday],
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
