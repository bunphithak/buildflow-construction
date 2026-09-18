import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { UserRole } from '../models';

export const roleGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = (route.data['roles'] as UserRole[] | undefined) ?? [];

  return authService.initialized$.pipe(
    map(() => {
      if (!authService.isAuthenticated()) {
        return router.createUrlTree(['/login']);
      }
      if (allowedRoles.length === 0 || authService.hasRole(allowedRoles)) {
        return true;
      }
      return router.createUrlTree([authService.homePath()]);
    }),
  );
};
