import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

  readonly categories = computed(() => this.categoryService.categories());

  readonly filtered = computed(() => {
    const keyword = this.search().trim().toLowerCase();
    const jobId = this.jobFilter();
    const categoryId = this.categoryFilter();
    return this.expenses().filter((item) => {
      const matchesJob = !jobId || item.jobId === jobId;
      const matchesCategory = !categoryId || item.categoryId === categoryId;
      const matchesKeyword =
        !keyword ||
        [item.description, item.vendor ?? '', item.documentNo ?? '']
          .join(' ')
          .toLowerCase()
          .includes(keyword);
      return matchesJob && matchesCategory && matchesKeyword;
    });
  });

  readonly totals = computed(() => this.expenseService.summarizeFilterTotals(this.filtered()));

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
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
      this.expenses.set(rows);
    } catch (error) {
      console.error('Failed to load expenses', error);
      this.toast.error('ไม่สามารถโหลดค่าใช้จ่ายได้');
    } finally {
      this.loading.set(false);
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
  }

  onRangeChange(): void {
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
