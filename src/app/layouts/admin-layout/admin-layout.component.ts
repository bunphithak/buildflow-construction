import { NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';
import { BRAND_LOGO_PATH } from '../../core/constants/brand';
import { AuthService } from '../../core/auth/auth.service';
import { USER_ROLE_LABELS, UserRole } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastHostComponent } from '../../shared/components/toast-host/toast-host.component';
import { WorkStoppageDialogComponent } from '../../shared/components/work-stoppage-dialog/work-stoppage-dialog.component';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: readonly UserRole[];
  exact?: boolean;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    NgClass,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ConfirmDialogComponent,
    WorkStoppageDialogComponent,
    ToastHostComponent,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly companyName = environment.companyName;
  readonly logoPath = BRAND_LOGO_PATH;
  readonly isTestEnv = environment.name !== 'production';
  readonly sidebarOpen = signal(false);
  readonly displayName = this.authService.displayName;
  readonly role = this.authService.role;
  readonly roleLabel = computed(() => {
    const role = this.role();
    return role ? USER_ROLE_LABELS[role] : '-';
  });

  private readonly allNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'fa-tachometer', roles: ['ADMIN'] },
    { label: 'พนักงาน', path: '/employees', icon: 'fa-users', roles: ['ADMIN'] },
    { label: 'ลงเวลาทำงาน', path: '/attendance/daily', icon: 'fa-clock-o', roles: ['ADMIN'] },
    { label: 'ลงเวลาทำงาน', path: '/attendance/today', icon: 'fa-clock-o', roles: ['MANAGER'] },
    { label: 'งานก่อสร้าง', path: '/jobs', icon: 'fa-building', roles: ['ADMIN'] },
    { label: 'ค่าใช้จ่าย', path: '/expenses', icon: 'fa-credit-card', roles: ['ADMIN', 'MANAGER'] },
    { label: 'รายรับ', path: '/revenues', icon: 'fa-line-chart', roles: ['ADMIN'] },
    { label: 'Payroll', path: '/payroll', icon: 'fa-calculator', roles: ['ADMIN'] },
    { label: 'สลิปเงินเดือน', path: '/payslips', icon: 'fa-file-text-o', roles: ['ADMIN'] },
    { label: 'รายงาน', path: '/reports', icon: 'fa-bar-chart', roles: ['ADMIN'] },
    { label: 'ผู้ใช้', path: '/settings/users', icon: 'fa-user', roles: ['ADMIN'] },
    { label: 'ตั้งค่า', path: '/settings', icon: 'fa-cog', roles: ['ADMIN'], exact: true },
  ];

  readonly navItems = computed(() =>
    this.allNavItems.filter((item) => this.authService.hasRole(item.roles)),
  );

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/login');
  }
}
