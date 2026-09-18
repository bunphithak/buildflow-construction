import { JobStatus } from '../models/job.model';

export function canCreateJobExpense(status: JobStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}

export function isJobExpenseLocked(status: JobStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED';
}
