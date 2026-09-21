import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Employee,
  EMPLOYEE_GENDERS,
  EMPLOYEE_NATIONALITIES,
  EMPLOYEE_POSITION_NAMES,
  EMPLOYMENT_TYPE_LABELS,
  EmployeeGender,
  EmployeeNationality,
  EmployeeStatus,
  EmploymentType,
  genderLabel,
  nationalityLabel,
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
  readonly nationalities = EMPLOYEE_NATIONALITIES;
  readonly genders = EMPLOYEE_GENDERS;

  readonly search = signal('');
  readonly typeFilter = signal<EmploymentType | ''>('');
  readonly positionFilter = signal('');
  readonly nationalityFilter = signal<EmployeeNationality | ''>('');
  readonly genderFilter = signal<EmployeeGender | ''>('');
  readonly statusFilter = signal<EmployeeStatus | ''>('');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizes = [10, 20, 50] as const;

  readonly positions = computed(() => {
    const used = this.employeeService.employees().map((item) => item.position).filter((item) => !!item);
    return [...new Set([...EMPLOYEE_POSITION_NAMES, ...used])];
  });

  readonly filteredEmployees = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    const position = this.positionFilter();
    const nationality = this.nationalityFilter();
    const gender = this.genderFilter();
    const status = this.statusFilter();

    return this.employeeService
      .employees()
      .filter((employee) => {
        const matchesKeyword =
          !keyword ||
          [employee.employeeCode, employee.firstName, employee.lastName, employee.nickname ?? '']
            .join(' ')
            .toLowerCase()
            .includes(keyword);
        const matchesType = !type || employee.employmentType === type;
        const matchesPosition = !position || employee.position === position;
        const matchesNationality = !nationality || employee.nationality === nationality;
        const matchesGender = !gender || employee.gender === gender;
        const matchesStatus = !status || employee.status === status;
        return matchesKeyword && matchesType && matchesPosition && matchesNationality && matchesGender && matchesStatus;
      })
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode, 'th', { numeric: true }));
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredEmployees().length / this.pageSize())),
  );

  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  readonly pagedEmployees = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredEmployees().slice(start, start + this.pageSize());
  });

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }
    const start = Math.max(1, Math.min(current - 2, total - 4));
    const end = Math.min(total, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly rangeLabel = computed(() => {
    const total = this.filteredEmployees().length;
    if (total === 0) {
      return 'ไม่พบรายการ';
    }
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `แสดง ${start}-${end} จาก ${total} คน`;
  });

  setSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  setTypeFilter(value: EmploymentType | ''): void {
    this.typeFilter.set(value);
    this.page.set(1);
  }

  setPositionFilter(value: string): void {
    this.positionFilter.set(value);
    this.page.set(1);
  }

  setNationalityFilter(value: EmployeeNationality | ''): void {
    this.nationalityFilter.set(value);
    this.page.set(1);
  }

  setGenderFilter(value: EmployeeGender | ''): void {
    this.genderFilter.set(value);
    this.page.set(1);
  }

  setStatusFilter(value: EmployeeStatus | ''): void {
    this.statusFilter.set(value);
    this.page.set(1);
  }

  setPageSize(value: number): void {
    this.pageSize.set(value);
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  wage(employee: Employee): string {
    return formatEmployeeWage(employee);
  }

  fullName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  nationality(employee: Employee): string {
    return nationalityLabel(employee.nationality);
  }

  gender(employee: Employee): string {
    return genderLabel(employee.gender);
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
