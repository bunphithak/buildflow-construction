import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Expense } from '../../../core/models';
import { ExpenseCategoryService } from '../../../core/services/expense-category.service';
import { ExpenseService, mapExpenseError } from '../../../core/services/expense.service';
import { JobService } from '../../../core/services/job.service';
import { formatAmount, formatBaht } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-expense-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    ThaiDatePipe,
  ],
  templateUrl: './expense-detail.component.html',
  styleUrl: './expense-detail.component.scss',
})
export class ExpenseDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly expenseService = inject(ExpenseService);
  private readonly jobService = inject(JobService);
  private readonly categoryService = inject(ExpenseCategoryService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly expense = signal<Expense | null>(null);

  readonly jobLabel = computed(() => {
    const expense = this.expense();
    if (!expense) {
      return '-';
    }
    const job = this.jobService.jobs().find((item) => item.id === expense.jobId);
    return job ? `${job.jobCode} · ${job.jobName}` : expense.jobId;
  });

  readonly isImage = computed(() => {
    const expense = this.expense();
    return !!expense?.receiptUrl && this.expenseService.isImageReceipt(expense.receiptFileName ?? expense.receiptUrl);
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      await this.router.navigateByUrl('/expenses');
      return;
    }
    try {
      const expense = await this.expenseService.getExpenseById(id);
      if (!expense) {
        this.toast.error('ไม่พบรายการค่าใช้จ่าย');
        await this.router.navigateByUrl('/expenses');
        return;
      }
      this.expense.set(expense);
    } catch (error) {
      console.error('Failed to load expense', error);
      this.toast.error('ไม่สามารถโหลดค่าใช้จ่ายได้');
    } finally {
      this.loading.set(false);
    }
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
}
