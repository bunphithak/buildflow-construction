import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  REVENUE_STATUS_LABELS,
  REVENUE_TYPE_LABELS,
  REVENUE_TYPES,
  Revenue,
  RevenueType,
  summarizeRevenues,
} from '../../../core/models';
import { JobService } from '../../../core/services/job.service';
import { mapRevenueError, RevenueService } from '../../../core/services/revenue.service';
import { formatBaht } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

type DatePreset = 'all' | 'today' | 'month' | 'range';

@Component({
  selector: 'app-revenue-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './revenue-list.component.html',
  styleUrl: './revenue-list.component.scss',
})
export class RevenueListComponent implements OnInit {
  private readonly revenueService = inject(RevenueService);
  readonly jobService = inject(JobService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly items = signal<Revenue[]>([]);
  readonly search = signal('');
  readonly jobFilter = signal('');
  readonly typeFilter = signal<RevenueType | ''>('');
  readonly datePreset = signal<DatePreset>('month');
  readonly startDate = signal(this.monthStart());
  readonly endDate = signal(this.todayInput());
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizes = [10, 20, 50] as const;
  readonly types = REVENUE_TYPES;
  readonly typeLabels = REVENUE_TYPE_LABELS;
  readonly statusLabels = REVENUE_STATUS_LABELS;
  private reloadRequest = 0;

  readonly jobOptions = computed(() => this.jobService.jobs());

  readonly filtered = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const jobId = this.jobFilter();
    const type = this.typeFilter();
    return this.items().filter((item) => {
      const matchesJob = !jobId || item.jobId === jobId;
      const matchesType = !type || item.type === type;
      const matchesKeyword =
        !keyword ||
        [item.description, item.documentNo ?? '', item.note ?? ''].join(' ').toLowerCase().includes(keyword);
      return matchesJob && matchesType && matchesKeyword;
    });
  });

  readonly totals = computed(() => summarizeRevenues(this.filtered()));
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pagedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
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
    const total = this.filtered().length;
    if (total === 0) {
      return 'ไม่พบรายการ';
    }
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(total, start + this.pageSize() - 1);
    return `แสดง ${start}-${end} จาก ${total} รายการ`;
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    const request = ++this.reloadRequest;
    this.loading.set(true);
    try {
      const preset = this.datePreset();
      const jobId = this.jobFilter();
      const range = this.rangeForPreset(preset);
      let rows: Revenue[];
      if (jobId && range) {
        rows = await this.revenueService.getRevenuesByJobAndDateRange(jobId, range.start, range.end);
      } else if (range) {
        rows = await this.revenueService.getRevenuesByDateRange(range.start, range.end);
      } else if (jobId) {
        rows = await this.revenueService.getRevenuesByJob(jobId);
      } else {
        rows = await this.revenueService.getRevenues();
      }
      if (request !== this.reloadRequest) {
        return;
      }
      this.items.set(rows);
      this.page.set(1);
    } catch (error) {
      if (request !== this.reloadRequest) {
        return;
      }
      console.error(error);
      this.toast.error('ไม่สามารถโหลดรายรับได้');
    } finally {
      if (request === this.reloadRequest) {
        this.loading.set(false);
      }
    }
  }

  onPresetChange(value: string): void {
    const preset = value as DatePreset;
    this.datePreset.set(preset);
    if (preset === 'today') {
      const today = this.todayInput();
      this.startDate.set(today);
      this.endDate.set(today);
    }
    if (preset === 'month') {
      this.startDate.set(this.monthStart());
      this.endDate.set(this.todayInput());
    }
    void this.reload();
  }

  onStartDateChange(value: string): void {
    this.startDate.set(value);
    this.datePreset.set('range');
    void this.reload();
  }

  onEndDateChange(value: string): void {
    this.endDate.set(value);
    this.datePreset.set('range');
    void this.reload();
  }

  onJobChange(value: string): void {
    this.jobFilter.set(value);
    void this.reload();
  }

  onTypeChange(value: string): void {
    this.typeFilter.set((value || '') as RevenueType | '');
    this.page.set(1);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  jobLabel(id: string): string {
    const job = this.jobService.jobs().find((item) => item.id === id);
    return job ? `${job.jobCode} · ${job.jobName}` : id;
  }

  money(value: number): string {
    return formatBaht(value);
  }

  async remove(item: Revenue): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'ลบรายรับ',
      message: `ต้องการลบ ${item.description} หรือไม่?`,
      confirmLabel: 'ลบ',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.revenueService.deleteRevenue(item.id);
      this.toast.success('ลบรายรับแล้ว');
      await this.reload();
    } catch (error) {
      this.toast.error(mapRevenueError(error));
    }
  }

  private rangeForPreset(preset: DatePreset): { start: Date; end: Date } | null {
    if (preset === 'all') {
      return null;
    }
    return {
      start: new Date(this.startDate()),
      end: new Date(this.endDate()),
    };
  }

  private todayInput(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private monthStart(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
