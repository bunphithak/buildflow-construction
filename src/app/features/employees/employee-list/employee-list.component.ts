import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Employee,
  EMPLOYMENT_TYPE_LABELS,
  EmployeeStatus,
  EmploymentType,
} from '../../../core/models';
import {
  EmployeeService,
  formatEmployeeWage,
  mapEmployeeError,
} from '../../../core/services/employee.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './employee-list.component.html',
  styleUrl: './employee-list.component.scss',
})
export class EmployeeListComponent {
  private readonly employeeService = inject(EmployeeService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly loading = this.employeeService.loading;
  readonly error = this.employeeService.error;
  readonly totalCount = this.employeeService.totalCount;
  readonly monthlyCount = this.employeeService.monthlyCount;
  readonly dailyCount = this.employeeService.dailyCount;
  readonly activeCount = this.employeeService.activeCount;
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;

  readonly search = signal('');
  readonly typeFilter = signal<EmploymentType | ''>('');
  readonly positionFilter = signal('');
  readonly statusFilter = signal<EmployeeStatus | ''>('');

  readonly positions = computed(() => {
    const values = this.employeeService
      .employees()
      .map((item) => item.position)
      .filter((item) => !!item);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'th'));
  });

  readonly filteredEmployees = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const position = this.positionFilter();
    const status = this.statusFilter();

    return this.employeeService.employees().filter((employee) => {
      const matchesKeyword =
        !keyword ||
        [employee.employeeCode, employee.firstName, employee.lastName, employee.nickname ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      const matchesType = !type || employee.employmentType === type;
      const matchesPosition = !position || employee.position === position;
      const matchesStatus = !status || employee.status === status;
      return matchesKeyword && matchesType && matchesPosition && matchesStatus;
    });
  });

  wage(employee: Employee): string {
    return formatEmployeeWage(employee);
  }

  fullName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  async toggleStatus(employee: Employee): Promise<void> {
    const nextStatus: EmployeeStatus = employee.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const action = nextStatus === 'INACTIVE' ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน';
    const confirmed = await this.confirmDialog.confirm({
      title: `${action}พนักงาน`,
      message: `ต้องการ${action} ${this.fullName(employee)} หรือไม่?`,
      confirmLabel: action,
    });
    if (!confirmed) {
      return;
    }

    try {
      await this.employeeService.changeEmployeeStatus(employee.id, nextStatus);
      this.toast.success(`${action}สำเร็จ`);
    } catch (error) {
      this.toast.error(mapEmployeeError(error));
    }
  }

  statusActionLabel(status: EmployeeStatus): string {
    return status === 'ACTIVE' ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
  }
}
