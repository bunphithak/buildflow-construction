import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppUser, USER_ROLE_LABELS, UserRole } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { UserService, mapUserError } from '../../../core/services/user.service';
import { loginId } from '../../../core/utils/auth-login.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  private readonly userService = inject(UserService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly loading = this.userService.loading;
  readonly error = this.userService.error;
  readonly totalCount = this.userService.totalCount;
  readonly adminCount = this.userService.adminCount;
  readonly managerCount = this.userService.managerCount;
  readonly activeCount = this.userService.activeCount;
  readonly roleLabels = USER_ROLE_LABELS;

  readonly search = signal('');
  readonly roleFilter = signal<UserRole | ''>('');
  readonly statusFilter = signal<'ACTIVE' | 'INACTIVE' | ''>('');

  readonly filtered = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.userService.users().filter((user) => {
      const matchesKeyword =
        !keyword ||
        [user.displayName, loginId(user), user.email].join(' ').toLowerCase().includes(keyword);
      const matchesRole = !role || user.role === role;
      const matchesStatus =
        !status || (status === 'ACTIVE' ? user.isActive : !user.isActive);
      return matchesKeyword && matchesRole && matchesStatus;
    });
  });

  employeeName(employeeId?: string): string {
    if (!employeeId) {
      return '-';
    }
    const employee = this.employeeService.employees().find((item) => item.id === employeeId);
    return employee
      ? `${employee.employeeCode} ${employee.firstName} ${employee.lastName}`.trim()
      : employeeId;
  }

  loginName(user: AppUser): string {
    return loginId(user);
  }

  canResetPassword(user: AppUser): boolean {
    return this.userService.canResetPassword(user);
  }

  async resetPassword(user: AppUser): Promise<void> {
    if (!this.userService.canResetPassword(user)) {
      this.toast.error('บัญชีนี้เข้าด้วยชื่อผู้ใช้ ไม่มีอีเมลสำหรับรีเซ็ตรหัสผ่าน');
      return;
    }
    const confirmed = await this.confirmDialog.confirm({
      title: 'ส่งลิงก์รีเซ็ตรหัสผ่าน',
      message: `ส่งอีเมลรีเซ็ตรหัสผ่านไปที่ ${user.email} หรือไม่?`,
      confirmLabel: 'ส่งอีเมล',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.userService.sendResetPassword(user.email);
      this.toast.success('ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว');
    } catch (error) {
      this.toast.error(mapUserError(error));
    }
  }
}
