import { NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/auth/auth.service';
import { USER_ROLE_LABELS, UserRole } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastHostComponent } from '../../shared/components/toast-host/toast-host.component';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: readonly UserRole[];
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
    ToastHostComponent,
  ],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly companyName = environment.companyName;
  readonly sidebarOpen = signal(false);
  readonly displayName = this.authService.displayName;
  readonly role = this.authService.role;
  readonly roleLabel = computed(() => {
    const role = this.role();
    return role ? USER_ROLE_LABELS[role] : '-';
  });

  private readonly allNavItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '▣', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
    { label: 'พนักงาน', path: '/employees', icon: '☺', roles: ['ADMIN'] },
    { label: 'ลงเวลาทำงาน', path: '/attendance', icon: '◷', roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] },
    { label: 'งานก่อสร้าง', path: '/jobs', icon: '⌂', roles: ['ADMIN', 'MANAGER'] },
    { label: 'ค่าใช้จ่าย', path: '/expenses', icon: '฿', roles: ['ADMIN', 'MANAGER'] },
    { label: 'Payroll', path: '/payroll', icon: '▤', roles: ['ADMIN'] },
    { label: 'สลิปเงินเดือน', path: '/payslips', icon: '✉', roles: ['ADMIN', 'EMPLOYEE'] },
    { label: 'รายงาน', path: '/reports', icon: '▦', roles: ['ADMIN', 'MANAGER'] },
    { label: 'ตั้งค่า', path: '/settings', icon: '⚙', roles: ['ADMIN'] },
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
