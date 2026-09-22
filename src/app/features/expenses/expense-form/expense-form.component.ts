import { Component, computed, inject, Input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  EXPENSE_UNITS,
  Expense,
  PAYMENT_METHODS,
} from '../../../core/models';
import { AuthService } from '../../../core/auth/auth.service';
import { ExpenseCategoryService } from '../../../core/services/expense-category.service';
import { ExpenseService, mapExpenseError, UploadFailedError } from '../../../core/services/expense.service';
import { JobService } from '../../../core/services/job.service';
import { roundMoney } from '../../../core/utils/datetime.util';
import { canCreateJobExpense, isJobExpenseLocked } from '../../../core/utils/expense.util';
import { toDateInputValue, trimValue } from '../../../core/utils/form.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './expense-form.component.html',
  styleUrl: './expense-form.component.scss',
})
export class ExpenseFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly expenseService = inject(ExpenseService);
  private readonly categoryService = inject(ExpenseCategoryService);
  private readonly jobService = inject(JobService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();

  @Input() id: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly current = signal<Expense | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);
  readonly units = EXPENSE_UNITS;
  readonly paymentMethods = PAYMENT_METHODS;

  readonly form = this.fb.nonNullable.group({
    jobId: ['', Validators.required],
    expenseDate: [toDateInputValue(new Date()), Validators.required],
    categoryId: ['', Validators.required],
    description: ['', Validators.required],
    quantity: this.fb.control<number | null>(null),
    unit: [''],
    unitPrice: this.fb.control<number | null>(null),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    autoCalculate: [true],
    vendor: [''],
    documentNo: [''],
    paymentMethod: [''],
    note: [''],
  });

  readonly selectedJobId = signal('');
  readonly quantityValue = signal<number | null>(null);
  readonly unitPriceValue = signal<number | null>(null);
  readonly autoCalculate = signal(true);

  readonly categories = computed(() => {
    const currentId = this.current()?.categoryId;
    const active = this.categoryService.activeCategories();
    const current = currentId ? this.categoryService.getById(currentId) : undefined;
    if (current && !active.some((item) => item.id === current.id)) {
      return [current, ...active];
    }
    return active;
  });

  readonly selectableJobs = computed(() => {
    const jobs = this.authService.filterManagedJobs(this.jobService.jobs());
    const selectedId = this.selectedJobId();
    if (this.isEdit) {
      return jobs;
    }
    return jobs.filter((job) => canCreateJobExpense(job.status) || job.id === selectedId);
  });

  readonly calculatedAmount = computed(() => {
    const quantity = Number(this.quantityValue());
    const unitPrice = Number(this.unitPriceValue());
    if (!(quantity > 0) || Number.isNaN(unitPrice) || this.unitPriceValue() === null) {
      return null;
    }
    return roundMoney(quantity * unitPrice);
  });

  get isEdit(): boolean {
    return !!this.id;
  }

  get title(): string {
    return this.isEdit ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย';
  }

  get amountLocked(): boolean {
    return this.autoCalculate() && this.calculatedAmount() !== null;
  }

  ngOnInit(): void {
    this.id = this.id ?? this.route.snapshot.paramMap.get('id');
    const queryJobId = this.route.snapshot.queryParamMap.get('jobId');
    if (queryJobId && !this.isEdit) {
      this.form.controls.jobId.setValue(queryJobId);
      this.selectedJobId.set(queryJobId);
    }

    this.form.controls.jobId.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => this.selectedJobId.set(value));
    this.form.controls.quantity.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.quantityValue.set(value);
      this.applyAutoAmount();
    });
    this.form.controls.unitPrice.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.unitPriceValue.set(value);
      this.applyAutoAmount();
    });
    this.form.controls.autoCalculate.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((value) => {
      this.autoCalculate.set(value);
      this.applyAutoAmount();
    });

    if (this.id) {
      void this.loadExpense(this.id);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    const url = this.previewUrl();
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  onAmountInput(): void {
    this.form.controls.autoCalculate.setValue(false);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.formError.set(null);
    if (!file) {
      return;
    }
    try {
      this.expenseService.validateReceipt(file);
      this.selectedFile.set(file);
      if (this.expenseService.isImageReceipt(file.type)) {
        this.previewUrl.set(URL.createObjectURL(file));
      } else {
        this.previewUrl.set(null);
      }
    } catch (error) {
      input.value = '';
      this.toast.error(mapExpenseError(error));
    }
  }

  clearSelectedFile(): void {
    this.selectedFile.set(null);
    const url = this.previewUrl();
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    const current = this.current();
    this.previewUrl.set(current?.receiptUrl && this.expenseService.isImageReceipt(current.receiptFileName ?? current.receiptUrl) ? current.receiptUrl : null);
  }

  async removeExistingReceipt(): Promise<void> {
    const current = this.current();
    if (!current) {
      this.clearSelectedFile();
      return;
    }
    try {
      await this.expenseService.removeReceipt(current.id);
      this.current.set({ ...current, receiptUrl: undefined, receiptStoragePath: undefined, receiptFileName: undefined });
      this.clearSelectedFile();
      this.toast.success('ลบไฟล์แนบแล้ว');
    } catch (error) {
      this.toast.error(mapExpenseError(error));
    }
  }

  hasError(controlName: 'jobId' | 'expenseDate' | 'categoryId' | 'description' | 'amount', error: string): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.hasError(error);
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid) {
      return;
    }

    const job = await this.jobService.getJobById(this.form.controls.jobId.value);
    if (!job) {
      this.formError.set('ไม่พบงานที่เลือก');
      return;
    }
    if (!this.isEdit && !canCreateJobExpense(job.status)) {
      this.formError.set('เลือกได้เฉพาะงานที่เปิดหรือกำลังดำเนินการ');
      return;
    }
    if (this.isEdit && isJobExpenseLocked(job.status) && !this.authService.hasRole(['ADMIN'])) {
      this.formError.set('งานนี้ปิดหรือยกเลิกแล้ว เฉพาะผู้ดูแลระบบที่แก้ไขข้อมูลเก่าได้');
      return;
    }

    const category = this.categoryService.getById(this.form.controls.categoryId.value);
    if (!category) {
      this.formError.set('กรุณาเลือกหมวดค่าใช้จ่าย');
      return;
    }

    const quantity = this.toOptionalNumber(this.form.controls.quantity.value);
    const unitPrice = this.toOptionalNumber(this.form.controls.unitPrice.value);
    const amount = this.amountLocked
      ? this.calculatedAmount() ?? 0
      : Number(this.form.controls.amount.value);

    this.saving.set(true);
    try {
      const payload = {
        jobId: this.form.controls.jobId.value,
        expenseDate: new Date(this.form.controls.expenseDate.value),
        categoryId: category.id,
        categoryNameSnapshot: category.name,
        description: this.form.controls.description.value.trim(),
        quantity,
        unit: trimValue(this.form.controls.unit.value),
        unitPrice,
        amount,
        vendor: trimValue(this.form.controls.vendor.value),
        documentNo: trimValue(this.form.controls.documentNo.value),
        paymentMethod: trimValue(this.form.controls.paymentMethod.value),
        note: trimValue(this.form.controls.note.value),
      };
      const file = this.selectedFile() ?? undefined;
      if (this.isEdit && this.id) {
        await this.expenseService.updateExpense(this.id, payload, file);
        this.toast.success('บันทึกค่าใช้จ่ายแล้ว');
        await this.router.navigate(['/expenses', this.id]);
      } else {
        const id = await this.expenseService.createExpense(payload, file);
        this.toast.success('เพิ่มค่าใช้จ่ายแล้ว');
        await this.router.navigate(['/expenses', id]);
      }
    } catch (error) {
      const message = mapExpenseError(error);
      this.formError.set(message);
      this.toast.error(message);
      if (error instanceof UploadFailedError) {
        await this.router.navigate(['/expenses', error.expenseId]);
      }
    } finally {
      this.saving.set(false);
    }
  }

  private applyAutoAmount(): void {
    if (!this.autoCalculate()) {
      return;
    }
    const amount = this.calculatedAmount();
    if (amount !== null) {
      this.form.controls.amount.setValue(amount, { emitEvent: false });
    }
  }

  private toOptionalNumber(value: number | null): number | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    const numberValue = Number(value);
    return Number.isNaN(numberValue) ? undefined : numberValue;
  }

  private async loadExpense(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const expense = await this.expenseService.getExpenseById(id);
      if (!expense) {
        this.toast.error('ไม่พบรายการค่าใช้จ่าย');
        await this.router.navigateByUrl('/expenses');
        return;
      }
      this.current.set(expense);
      const auto =
        expense.quantity !== undefined &&
        expense.unitPrice !== undefined &&
        roundMoney((expense.quantity ?? 0) * (expense.unitPrice ?? 0)) === roundMoney(expense.amount);
      this.selectedJobId.set(expense.jobId);
      this.quantityValue.set(expense.quantity ?? null);
      this.unitPriceValue.set(expense.unitPrice ?? null);
      this.autoCalculate.set(auto);
      this.form.patchValue({
        jobId: expense.jobId,
        expenseDate: toDateInputValue(expense.expenseDate),
        categoryId: expense.categoryId,
        description: expense.description,
        quantity: expense.quantity ?? null,
        unit: expense.unit ?? '',
        unitPrice: expense.unitPrice ?? null,
        amount: expense.amount,
        autoCalculate: auto,
        vendor: expense.vendor ?? '',
        documentNo: expense.documentNo ?? '',
        paymentMethod: expense.paymentMethod ?? '',
        note: expense.note ?? '',
      });
      if (expense.receiptUrl && this.expenseService.isImageReceipt(expense.receiptFileName ?? expense.receiptUrl)) {
        this.previewUrl.set(expense.receiptUrl);
      }
    } catch (error) {
      console.error('Failed to load expense', error);
      this.toast.error('ไม่สามารถโหลดค่าใช้จ่ายได้');
    } finally {
      this.loading.set(false);
    }
  }
}
