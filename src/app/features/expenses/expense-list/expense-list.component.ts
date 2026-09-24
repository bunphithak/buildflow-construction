import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Expense } from '../../../core/models';
import { ExpenseCategoryService } from '../../../core/services/expense-category.service';
import { ExpenseService, mapExpenseError } from '../../../core/services/expense.service';
import { JobService } from '../../../core/services/job.service';
import { formatBaht, formatAmount } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

type DatePreset = 'all' | 'today' | 'month' | 'range';

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    ThaiDatePipe,
  ],
  templateUrl: './expense-list.component.html',
  styleUrl: './expense-list.component.scss',
})
export class ExpenseListComponent implements OnInit {
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(ExpenseCategoryService);
  readonly jobService = inject(JobService);
  private readonly authService = inject(AuthService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly expenses = signal<Expense[]>([]);
  readonly search = signal('');
  readonly jobFilter = signal('');
  readonly categoryFilter = signal('');
  readonly datePreset = signal<DatePreset>('month');
  readonly startDate = signal(this.monthStart());
  readonly endDate = signal(this.todayInput());
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly pageSizes = [10, 20, 50] as const;
  private reloadRequest = 0;

  readonly categories = computed(() => this.categoryService.categories());

  readonly jobOptions = computed(() => this.authService.filterManagedJobs(this.jobService.jobs()));

  readonly filtered = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const jobId = this.jobFilter();
    const categoryId = this.categoryFilter();
    return this.expenses().filter((item) => {
      const matchesJob = !jobId || item.jobId === jobId;
      const matchesManaged = this.authService.canManageJob(item.jobId);
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      const matchesKeyword =
        !keyword ||
        [item.description, item.vendor ?? '', item.documentNo ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      return matchesJob && matchesManaged && matchesCategory && matchesKeyword;
    });
  });

  readonly totals = computed(() => this.expenseService.summarizeFilterTotals(this.filtered()));

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize())));
  readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));
  readonly pagedExpenses = computed(() => {
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
      let rows: Expense[];
      if (jobId && range) {
        rows = await this.expenseService.getExpensesByJobAndDateRange(jobId, range.start, range.end);
      } else if (range) {
        rows = await this.expenseService.getExpensesByDateRange(range.start, range.end);
      } else if (jobId) {
        rows = await this.expenseService.getExpensesByJob(jobId);
      } else {
        rows = await this.expenseService.getExpenses();
      }
      if (request !== this.reloadRequest) {
        return;
      }
      this.expenses.set(rows);
      this.page.set(1);
    } catch (error) {
      if (request !== this.reloadRequest) {
        return;
      }
      console.error('Failed to load expenses', error);
      this.toast.error('ไม่สามารถโหลดค่าใช้จ่ายได้');
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

  onJobChange(value: string): void {
    this.jobFilter.set(value);
    void this.reload();
  }

  onCategoryChange(value: string): void {
    this.categoryFilter.set(value);
    this.page.set(1);
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  setPageSize(value: number): void {
    this.pageSize.set(value);
    this.page.set(1);
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
  }

  onStartDateChange(value: string): void {
    if (!value || value === this.startDate()) {
      return;
    }
    this.startDate.set(value);
    this.datePreset.set('range');
    void this.reload();
  }

  onEndDateChange(value: string): void {
    if (!value || value === this.endDate()) {
      return;
    }
    this.endDate.set(value);
    this.datePreset.set('range');
    void this.reload();
  }

  jobLabel(jobId: string): string {
    const job = this.jobService.jobs().find((item) => item.id === jobId);
    return job ? `${job.jobCode} · ${job.jobName}` : jobId;
  }

  money(value: number | undefined): string {
    return formatBaht(value ?? 0);
  }

  amount(value: number | undefined): string {
    return formatAmount(value ?? 0);
  }

  categoryName(item: Expense): string {
    return item.categoryNameSnapshot || this.categoryService.getById(item.categoryId)?.name || '-';
  }

  async remove(item: Expense): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'ลบค่าใช้จ่าย',
      message: `ต้องการลบค่าใช้จ่ายรายการนี้หรือไม่?\n${item.description}\nยอดเงิน ${this.money(item.amount)}\nงาน ${this.jobLabel(item.jobId)}`,
      confirmLabel: 'ลบ',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.expenseService.deleteExpense(item.id);
      this.expenses.update((rows) => rows.filter((row) => row.id !== item.id));
      this.toast.success('ลบค่าใช้จ่ายแล้ว');
    } catch (error) {
      this.toast.error(mapExpenseError(error));
    }
  }

  private rangeForPreset(preset: DatePreset): { start: Date; end: Date } | null {
    if (preset === 'all') {
      return null;
    }
    if (preset === 'today') {
      const today = new Date();
      return { start: today, end: today };
    }
    if (preset === 'month') {
      const now = new Date();
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
    }
    if (!this.startDate() || !this.endDate()) {
      return null;
    }
    return { start: new Date(this.startDate()), end: new Date(this.endDate()) };
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
