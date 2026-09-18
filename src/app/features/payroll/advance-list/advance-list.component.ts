import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Employee, EmployeeAdvance } from '../../../core/models';
import { AdvanceService, mapAdvanceError } from '../../../core/services/advance.service';
import { EmployeeService } from '../../../core/services/employee.service';
import { formatBaht, toDateInputValue } from '../../../core/utils/form.util';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date.pipe';
import { ConfirmDialogService } from '../../../shared/services/confirm-dialog.service';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-advance-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    EmptyStateComponent,
    LoadingStateComponent,
    StatusBadgeComponent,
    ThaiDatePipe,
  ],
  templateUrl: './advance-list.component.html',
  styleUrl: './advance-list.component.scss',
})
export class AdvanceListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly advanceService = inject(AdvanceService);
  readonly employeeService = inject(EmployeeService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly advances = signal<EmployeeAdvance[]>([]);

  readonly form = this.fb.nonNullable.group({
    employeeId: ['', Validators.required],
    advanceDate: [toDateInputValue(new Date()), Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: ['เบิกล่วงหน้า'],
    note: [''],
  });

  async ngOnInit(): Promise<void> {
    const employeeId = this.route.snapshot.queryParamMap.get('employeeId');
    if (employeeId) {
      this.form.controls.employeeId.setValue(employeeId);
    }
    await this.reload();
  }

  employeeName(id: string): string {
    const item = this.employeeService.employees().find((row) => row.id === id);
    return item ? `${item.employeeCode} ${item.firstName} ${item.lastName}` : id;
  }

  money(value: number): string {
    return formatBaht(value);
  }

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    try {
      await this.advanceService.createAdvance({
        employeeId: this.form.controls.employeeId.value,
        advanceDate: new Date(this.form.controls.advanceDate.value),
        amount: Number(this.form.controls.amount.value),
        description: this.form.controls.description.value,
        note: this.form.controls.note.value,
      });
      this.toast.success('บันทึกเงินเบิกแล้ว');
      this.form.patchValue({ amount: null, description: 'เบิกล่วงหน้า', note: '' });
      await this.reload();
    } catch (error) {
      this.toast.error(mapAdvanceError(error));
    }
  }

  async cancel(item: EmployeeAdvance): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'ยกเลิกเงินเบิก',
      message: `ยกเลิกรายการ ${this.money(item.amount)} หรือไม่?`,
      confirmLabel: 'ยกเลิกเงินเบิก',
    });
    if (!confirmed) {
      return;
    }
    try {
      await this.advanceService.cancelAdvance(item.id);
      await this.reload();
    } catch (error) {
      this.toast.error(mapAdvanceError(error));
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.advances.set(await this.advanceService.getAdvances());
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดเงินเบิกได้');
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly employees = (): Employee[] =>
    this.employeeService.employees().filter((item) => item.status === 'ACTIVE');
}
