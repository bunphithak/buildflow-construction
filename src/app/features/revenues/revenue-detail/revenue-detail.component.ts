import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { REVENUE_STATUS_LABELS, REVENUE_TYPE_LABELS, Revenue } from '../../../core/models';
import { JobService } from '../../../core/services/job.service';
import { RevenueService } from '../../../core/services/revenue.service';
import { formatBaht } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-revenue-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './revenue-detail.component.html',
  styleUrl: './revenue-detail.component.scss',
})
export class RevenueDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly revenueService = inject(RevenueService);
  private readonly jobService = inject(JobService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly item = signal<Revenue | null>(null);
  readonly typeLabels = REVENUE_TYPE_LABELS;
  readonly statusLabels = REVENUE_STATUS_LABELS;

  readonly jobLabel = computed(() => {
    const item = this.item();
    if (!item) {
      return '-';
    }
    const job = this.jobService.jobs().find((row) => row.id === item.jobId);
    return job ? `${job.jobCode} · ${job.jobName}` : item.jobId;
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/revenues');
      return;
    }
    try {
      const item = await this.revenueService.getRevenueById(id);
      if (!item) {
        this.toast.error('ไม่พบรายการรายรับ');
        await this.router.navigateByUrl('/revenues');
        return;
      }
      this.item.set(item);
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดรายรับได้');
    } finally {
      this.loading.set(false);
    }
  }

  money(value: number | undefined): string {
    return formatBaht(value ?? 0);
  }
}
