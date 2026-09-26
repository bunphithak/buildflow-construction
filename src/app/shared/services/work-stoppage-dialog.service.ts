import { Injectable, signal } from '@angular/core';
import {
  WorkStoppagePeriod,
  WorkStoppageReason,
  WorkStoppageScope,
} from '../../core/models';

export interface WorkStoppageDialogOptions {
  jobLabel: string;
  hasJob: boolean;
  canStopAllJobs: boolean;
  workedCount: number;
}

export interface WorkStoppageDialogResult {
  period: WorkStoppagePeriod;
  scope: WorkStoppageScope;
  reason: WorkStoppageReason;
  reasonNote: string;
  overwriteWorked: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class WorkStoppageDialogService {
  private resolver: ((value: WorkStoppageDialogResult | null) => void) | null = null;
  readonly options = signal<WorkStoppageDialogOptions | null>(null);

  open(options: WorkStoppageDialogOptions): Promise<WorkStoppageDialogResult | null> {
    this.options.set(options);
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  close(value: WorkStoppageDialogResult | null): void {
    this.resolver?.(value);
    this.resolver = null;
    this.options.set(null);
  }
}
