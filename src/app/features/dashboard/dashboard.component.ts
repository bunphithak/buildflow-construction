import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardSummary } from '../../core/models';
import { JobService } from '../../core/services/job.service';
import { formatBaht, toDateInputValue } from '../../core/utils/form.util';
import {
  DashboardPreset,
  formatDateRangeLabel,
  resolveDashboardRange,
} from '../../core/utils/date-range.util';
import { getBudgetAlertLabel } from '../../core/utils/job-cost.util';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SimpleChartComponent } from '../../shared/components/simple-chart/simple-chart.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    DecimalPipe,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    SimpleChartComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  readonly jobs = inject(JobService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly preset = signal<DashboardPreset>('month');
  readonly jobId = signal('');
  readonly customStart = signal(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  readonly customEnd = signal(toDateInputValue(new Date()));
  readonly canSeeFinance = computed(() => this.authService.hasRole(['ADMIN', 'MANAGER']));
  readonly rangeLabel = computed(() => formatDateRangeLabel(this.range()));

  constructor() {
    void this.reload();
  }

  range() {
    return resolveDashboardRange(this.preset(), this.customStart(), this.customEnd());
  }

  money(value: number): string {
    return formatBaht(value);
  }

  setPreset(value: string): void {
    this.preset.set(value as DashboardPreset);
    void this.reload();
  }

  setJob(value: string): void {
    this.jobId.set(value);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.dashboardService.getDashboardSummary(
        this.range(),
        this.authService.role(),
        this.jobId() || undefined,
      );
      this.summary.set(data);
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลด Dashboard ได้');
    } finally {
      this.loading.set(false);
    }
  }

  budgetLabel(percent: number): string {
    return getBudgetAlertLabel(percent >= 100 ? 'over' : percent >= 80 ? 'warning' : percent >= 70 ? 'elevated' : 'ok');
  }
}
