import { JobStatus } from '../models/job.model';

export type StatusTone = 'success' | 'muted' | 'warning' | 'danger' | 'info' | 'accent';

export function canAssignEmployeesToJob(status: JobStatus): boolean {
  return status !== 'CLOSED' && status !== 'CANCELLED';
}

export function isLockedJobStatus(status: JobStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED';
}

export function jobStatusVariant(status: JobStatus): StatusTone {
  switch (status) {
    case 'OPEN':
    case 'IN_PROGRESS':
      return 'info';
    case 'COMPLETED':
      return 'success';
    case 'CLOSED':
      return 'muted';
    case 'CANCELLED':
      return 'danger';
    case 'DRAFT':
    default:
      return 'warning';
  }
}

export function suggestedNextJobStatuses(status: JobStatus): JobStatus[] {
  switch (status) {
    case 'DRAFT':
      return ['OPEN', 'CANCELLED'];
    case 'OPEN':
      return ['IN_PROGRESS', 'CANCELLED'];
    case 'IN_PROGRESS':
      return ['COMPLETED', 'CANCELLED'];
    case 'COMPLETED':
      return ['CLOSED'];
    default:
      return [];
  }
}

export function scheduleProgressPercent(
  startDate: Date,
  expectedEndDate: Date,
  now = new Date(),
): number {
  const start = startDate.getTime();
  const end = expectedEndDate.getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  const percent = ((now.getTime() - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, Math.round(percent)));
}
