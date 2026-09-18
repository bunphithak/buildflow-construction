import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ExpenseCategory } from '../../../core/models';
import { ExpenseCategoryService } from '../../../core/services/expense-category.service';
import { mapExpenseError } from '../../../core/services/expense.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-expense-categories',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './expense-categories.component.html',
  styleUrl: './expense-categories.component.scss',
})
export class ExpenseCategoriesComponent {
  private readonly fb = inject(FormBuilder);
  readonly categoryService = inject(ExpenseCategoryService);
  private readonly toast = inject(ToastService);

  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    code: ['', Validators.required],
    name: ['', Validators.required],
    sortOrder: this.fb.control<number | null>(null),
  });

  startEdit(item: ExpenseCategory): void {
    this.editingId.set(item.id);
    this.form.setValue({
      code: item.code,
      name: item.name,
      sortOrder: item.sortOrder,
    });
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ code: '', name: '', sortOrder: null });
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    try {
      const data = {
        code: this.form.controls.code.value,
        name: this.form.controls.name.value,
        sortOrder: this.form.controls.sortOrder.value ?? undefined,
      };
      const id = this.editingId();
      if (id) {
        await this.categoryService.updateCategory(id, data);
        this.toast.success('บันทึกหมวดค่าใช้จ่ายแล้ว');
      } else {
        await this.categoryService.createCategory(data);
        this.toast.success('เพิ่มหมวดค่าใช้จ่ายแล้ว');
      }
      this.cancelEdit();
    } catch (error) {
      this.toast.error(mapExpenseError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async toggle(item: ExpenseCategory): Promise<void> {
    const next = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await this.categoryService.changeCategoryStatus(item.id, next);
      this.toast.success(next === 'INACTIVE' ? 'ปิดใช้งานหมวดแล้ว' : 'เปิดใช้งานหมวดแล้ว');
    } catch (error) {
      this.toast.error(mapExpenseError(error));
    }
  }
}
