import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { Employee, EmployeeWriteData, EmploymentType } from '../../../core/models';
import {
  EmployeeService,
  mapEmployeeError,
} from '../../../core/services/employee.service';
import { toDateInputValue, trimValue } from '../../../core/utils/form.util';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ToastService } from '../../../shared/services/toast.service';

function minAmount(control: AbstractControl): ValidationErrors | null {
  const value = control.value as number | null;
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value) >= 0 ? null : { min: true };
}

@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './employee-form.component.html',
  styleUrl: './employee-form.component.scss',
})
export class EmployeeFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly employeeService = inject(EmployeeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy$ = new Subject<void>();
  private hydrating = false;

  @Input() employeeId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly previewUrl = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    employeeCode: ['', Validators.required],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    nickname: [''],
    phone: [''],
    address: [''],
    position: ['', Validators.required],
    department: [''],
    startDate: ['', Validators.required],
    employmentType: this.fb.nonNullable.control<EmploymentType>('DAILY', Validators.required),
    dailyRate: this.fb.control<number | null>(null, [Validators.required, minAmount]),
    monthlySalary: this.fb.control<number | null>(null, minAmount),
    overtimeRate: this.fb.control<number | null>(null, minAmount),
    bankName: [''],
    bankAccount: [''],
    status: this.fb.nonNullable.control<'ACTIVE' | 'INACTIVE'>('ACTIVE'),
    note: [''],
  });

  get isEdit(): boolean {
    return !!this.employeeId;
  }

  get title(): string {
    return this.isEdit ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน';
  }

  get employmentType(): EmploymentType {
    return this.form.controls.employmentType.value;
  }

  ngOnInit(): void {
    this.form.controls.employmentType.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((type) => this.applyRateValidators(type, !this.hydrating));

    this.employeeId = this.employeeId ?? this.route.snapshot.paramMap.get('id');

    if (this.employeeId) {
      void this.loadEmployee(this.employeeId);
    } else {
      void this.prefillCode();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async prefillCode(): Promise<void> {
    try {
      const code = await this.employeeService.generateNextEmployeeCode();
      if (!this.form.controls.employeeCode.value) {
        this.form.controls.employeeCode.setValue(code);
      }
    } catch (error) {
      console.error('Failed to generate employee code', error);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.formError.set(null);
    if (!file) {
      return;
    }

    try {
      this.employeeService.validateProfileFile(file);
    } catch (error) {
      this.formError.set(mapEmployeeError(error));
      input.value = '';
      return;
    }

    this.selectedFile.set(file);
    const reader = new FileReader();
    reader.onload = () => this.previewUrl.set(String(reader.result));
    reader.readAsDataURL(file);
  }

  async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const payload = this.toWriteData();
      if (this.employeeId) {
        const result = await this.employeeService.updateEmployee(
          this.employeeId,
          payload,
          this.selectedFile() ?? undefined,
        );
        this.toast.success('แก้ไขข้อมูลพนักงานสำเร็จ');
        if (result.imageError) {
          this.toast.warning(mapEmployeeError(new Error(result.imageError)));
        }
      } else {
        const result = await this.employeeService.createEmployee(
          payload,
          this.selectedFile() ?? undefined,
        );
        this.toast.success('เพิ่มพนักงานสำเร็จ');
        if (result.imageError) {
          this.toast.warning(mapEmployeeError(new Error(result.imageError)));
        }
      }
      await this.router.navigateByUrl('/employees');
    } catch (error) {
      this.formError.set(mapEmployeeError(error));
    } finally {
      this.saving.set(false);
    }
  }

  hasError(controlName: keyof typeof this.form.controls, errorCode: string): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.hasError(errorCode);
  }

  private async loadEmployee(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const employee = await this.employeeService.getEmployeeById(id);
      if (!employee) {
        this.toast.error('ไม่พบข้อมูลพนักงาน');
        await this.router.navigateByUrl('/employees');
        return;
      }
      this.patchForm(employee);
    } catch (error) {
      console.error('Failed to load employee', error);
      this.toast.error('ไม่สามารถโหลดข้อมูลพนักงานได้');
    } finally {
      this.loading.set(false);
    }
  }

  private patchForm(employee: Employee): void {
    this.hydrating = true;
    this.form.patchValue({
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      nickname: employee.nickname ?? '',
      phone: employee.phone ?? '',
      address: employee.address ?? '',
      position: employee.position,
      department: employee.department ?? '',
      startDate: toDateInputValue(employee.startDate),
      employmentType: employee.employmentType,
      dailyRate: employee.dailyRate ?? null,
      monthlySalary: employee.monthlySalary ?? null,
      overtimeRate: employee.overtimeRate ?? null,
      bankName: employee.bankName ?? '',
      bankAccount: employee.bankAccount ?? '',
      status: employee.status,
      note: employee.note ?? '',
    });
    this.previewUrl.set(employee.profileImageUrl ?? null);
    this.applyRateValidators(employee.employmentType, false);
    this.hydrating = false;
  }

  private applyRateValidators(type: EmploymentType, resetOpposite: boolean): void {
    const dailyCtrl = this.form.controls.dailyRate;
    const monthlyCtrl = this.form.controls.monthlySalary;

    if (type === 'DAILY') {
      dailyCtrl.setValidators([Validators.required, minAmount]);
      monthlyCtrl.setValidators([minAmount]);
      if (resetOpposite) {
        monthlyCtrl.setValue(null);
      }
    } else {
      monthlyCtrl.setValidators([Validators.required, minAmount]);
      dailyCtrl.setValidators([minAmount]);
      if (resetOpposite) {
        dailyCtrl.setValue(null);
      }
    }

    dailyCtrl.updateValueAndValidity({ emitEvent: false });
    monthlyCtrl.updateValueAndValidity({ emitEvent: false });
  }

  private toWriteData(): EmployeeWriteData {
    const value = this.form.getRawValue();
    const startDate = new Date(`${value.startDate}T00:00:00`);
    const data: EmployeeWriteData = {
      employeeCode: value.employeeCode,
      firstName: value.firstName,
      lastName: value.lastName,
      nickname: trimValue(value.nickname),
      phone: trimValue(value.phone),
      address: trimValue(value.address),
      position: value.position,
      department: trimValue(value.department),
      startDate,
      employmentType: value.employmentType,
      status: value.status,
      overtimeRate: value.overtimeRate ?? undefined,
      bankName: trimValue(value.bankName),
      bankAccount: trimValue(value.bankAccount),
      note: trimValue(value.note),
    };

    if (value.employmentType === 'DAILY') {
      data.dailyRate = Number(value.dailyRate);
    } else {
      data.monthlySalary = Number(value.monthlySalary);
    }

    return data;
  }
}
