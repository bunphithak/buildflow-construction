import { Component, Input } from '@angular/core';
import {
  ADVANCE_STATUS_LABELS,
  AdvanceStatus,
  AttendanceStatus,
  ATTENDANCE_STATUS_LABELS,
  EmployeeStatus,
  EMPLOYEE_STATUS_LABELS,
  JOB_ASSIGNMENT_STATUS_LABELS,
  JOB_STATUS_LABELS,
  JobAssignmentStatus,
  JobStatus,
  PAYROLL_STATUS_LABELS,
  PayrollStatus,
} from '../../../core/models';
import { jobStatusVariant, StatusTone } from '../../../core/utils/job-status.util';

export type BadgeVariant = StatusTone;
export type StatusBadgeKind = 'employee' | 'job' | 'assignment' | 'attendance' | 'payroll' | 'advance';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.scss',
})
export class StatusBadgeComponent {
  @Input() status?: EmployeeStatus | JobStatus | JobAssignmentStatus | AttendanceStatus | PayrollStatus | AdvanceStatus;
  @Input() kind: StatusBadgeKind = 'employee';

  get label(): string {
    if (!this.status) {
      return '-';
    }
    if (this.kind === 'job') {
      return JOB_STATUS_LABELS[this.status as JobStatus];
    }
    if (this.kind === 'assignment') {
      return JOB_ASSIGNMENT_STATUS_LABELS[this.status as JobAssignmentStatus];
    }
    if (this.kind === 'attendance') {
      return ATTENDANCE_STATUS_LABELS[this.status as AttendanceStatus];
    }
    if (this.kind === 'payroll') {
      return PAYROLL_STATUS_LABELS[this.status as PayrollStatus];
    }
    if (this.kind === 'advance') {
      return ADVANCE_STATUS_LABELS[this.status as AdvanceStatus];
    }
    return EMPLOYEE_STATUS_LABELS[this.status as EmployeeStatus];
  }

  get variant(): BadgeVariant {
    if (this.kind === 'job') {
      return jobStatusVariant((this.status as JobStatus) ?? 'DRAFT');
    }
    if (this.kind === 'attendance') {
      switch (this.status) {
        case 'PRESENT':
          return 'success';
        case 'HALF_DAY':
          return 'info';
        case 'LEAVE':
        case 'HOLIDAY':
          return 'warning';
        case 'ABSENT':
          return 'danger';
        default:
          return 'muted';
      }
    }
    if (this.kind === 'payroll') {
      switch (this.status) {
        case 'PAID':
        case 'APPROVED':
          return 'success';
        case 'CALCULATED':
          return 'info';
        case 'CANCELLED':
          return 'danger';
        default:
          return 'warning';
      }
    }
    if (this.kind === 'advance') {
      switch (this.status) {
        case 'DEDUCTED':
          return 'success';
        case 'CANCELLED':
          return 'danger';
        default:
          return 'warning';
      }
    }
    if (this.status === 'INACTIVE' || this.status === 'REMOVED' || this.status === 'CLOSED') {
      return 'muted';
    }
    if (this.status === 'CANCELLED') {
      return 'danger';
    }
    return 'success';
  }
}
