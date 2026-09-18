import { Component, computed, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Employee } from '../../../core/models';
import { formatEmployeeWage } from '../../../core/services/employee.service';
import { EMPLOYMENT_TYPE_LABELS } from '../../../core/models';
import { toDateInputValue } from '../../../core/utils/form.util';

@Component({
  selector: 'app-assign-employee-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './assign-employee-dialog.component.html',
  styleUrl: './assign-employee-dialog.component.scss',
})
export class AssignEmployeeDialogComponent {
  @Input({ required: true }) employees: Employee[] = [];
  @Input() assignedEmployeeIds: string[] = [];
  @Output() cancelled = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<{ employeeIds: string[]; assignedDate: Date }>();

  readonly search = signal('');
  readonly selectedIds = signal<string[]>([]);
  readonly assignedDate = signal(toDateInputValue(new Date()));
  readonly typeLabels = EMPLOYMENT_TYPE_LABELS;

  readonly availableEmployees = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const assigned = new Set(this.assignedEmployeeIds);
    return this.employees.filter((employee) => {
      if (employee.status !== 'ACTIVE' || assigned.has(employee.id)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [employee.employeeCode, employee.firstName, employee.lastName, employee.nickname ?? '', employee.position]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  });

  wage(employee: Employee): string {
    return formatEmployeeWage(employee);
  }

  fullName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggle(id: string): void {
    this.selectedIds.update((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  submit(): void {
    if (this.selectedIds().length === 0) {
      return;
    }
    this.confirmed.emit({
      employeeIds: this.selectedIds(),
      assignedDate: new Date(`${this.assignedDate()}T00:00:00`),
    });
  }
}
