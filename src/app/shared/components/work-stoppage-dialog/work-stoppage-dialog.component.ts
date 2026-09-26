import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  WORK_STOPPAGE_PERIOD_LABELS,
  WORK_STOPPAGE_REASON_LABELS,
  WORK_STOPPAGE_REASONS,
  WorkStoppagePeriod,
  WorkStoppageReason,
  WorkStoppageScope,
} from '../../../core/models';
import { WorkStoppageDialogService } from '../../services/work-stoppage-dialog.service';

@Component({
  selector: 'app-work-stoppage-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './work-stoppage-dialog.component.html',
  styleUrl: './work-stoppage-dialog.component.scss',
})
export class WorkStoppageDialogComponent {
  readonly dialog = inject(WorkStoppageDialogService);
  readonly reasons = WORK_STOPPAGE_REASONS;
  readonly reasonLabels = WORK_STOPPAGE_REASON_LABELS;
  readonly periodLabels = WORK_STOPPAGE_PERIOD_LABELS;

  readonly period = signal<WorkStoppagePeriod>('FULL');
  readonly scope = signal<WorkStoppageScope>('JOB');
  readonly reason = signal<WorkStoppageReason>('RAIN');
  readonly reasonNote = signal('');
  readonly overwriteWorked = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const options = this.dialog.options();
      if (options) {
        this.period.set('FULL');
        this.scope.set(options.hasJob ? 'JOB' : 'ALL');
        this.reason.set('RAIN');
        this.reasonNote.set('');
        this.overwriteWorked.set(false);
        this.error.set('');
      }
    });
  }

  submit(): void {
    const options = this.dialog.options();
    if (!options) {
      return;
    }
    if (this.reason() === 'OTHER' && !this.reasonNote().trim()) {
      this.error.set('กรุณาระบุสาเหตุ');
      return;
    }
    this.error.set('');
    this.dialog.close({
      period: this.period(),
      scope: options.canStopAllJobs ? this.scope() : 'JOB',
      reason: this.reason(),
      reasonNote: this.reasonNote().trim(),
      overwriteWorked: this.overwriteWorked(),
    });
  }

  cancel(): void {
    this.dialog.close(null);
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  setPeriod(value: string): void {
    this.period.set(value as WorkStoppagePeriod);
  }

  setScope(value: string): void {
    this.scope.set(value as WorkStoppageScope);
  }

  setReason(value: string): void {
    this.reason.set(value as WorkStoppageReason);
  }

  setOverwrite(value: boolean): void {
    this.overwriteWorked.set(value);
  }
}
