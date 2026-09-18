import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Employee, JOB_STATUS_LABELS, Job, JobStatus, JobWriteData } from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService, mapJobError } from '../../../core/services/job.service';
import { formatBaht, toDateInputValue, trimValue } from '../../../core/utils/form.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

function minAmount(control: AbstractControl): ValidationErrors | null {
  const value = control.value as number | null;
  if (value === null || value === undefined) {
    return null;
  }
  return Number(value) >= 0 ? null : { min: true };
}

function endAfterStart(group: AbstractControl): ValidationErrors | null {
  const start = group.get('startDate')?.value as string;
  const end = group.get('expectedEndDate')?.value as string;
  if (!start || !end) {
    return null;
  }
  return end < start ? { endBeforeStart: true } : null;
}

@Component({
  selector: 'app-job-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './job-form.component.html',
  styleUrl: './job-form.component.scss',
})
export class JobFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly jobService = inject(JobService);
  private readonly employeeService = inject(EmployeeService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  @Input() jobId: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly statusLabels = JOB_STATUS_LABELS;
  readonly statuses: JobStatus[] = ['DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'];

  readonly form = this.fb.nonNullable.group(
    {
      jobCode: ['', Validators.required],
      jobName: ['', Validators.required],
      description: [''],
      customerName: ['', Validators.required],
      customerPhone: [''],
      location: [''],
      contractValue: this.fb.control<number | null>(null, [Validators.required, minAmount]),
      estimatedBudget: this.fb.control<number | null>(null, minAmount),
      startDate: ['', Validators.required],
      expectedEndDate: [''],
      supervisorId: [''],
      status: this.fb.nonNullable.control<JobStatus>('OPEN'),
      note: [''],
    },
    { validators: endAfterStart },
  );

  readonly activeEmployees = computed(() =>
    this.employeeService.employees().filter((item) => item.status === 'ACTIVE'),
  );

  get isEdit(): boolean {
    return !!this.jobId;
  }

  ngOnInit(): void {
    this.jobId = this.jobId ?? this.route.snapshot.paramMap.get('id');

    if (this.jobId) {
      void this.loadJob(this.jobId);
    } else {
      void this.prefillCode();
    }
  }

  contractHint(): string {
    return formatBaht(Number(this.form.controls.contractValue.value) || 0);
  }

  budgetHint(): string {
    const value = this.form.controls.estimatedBudget.value;
    return value === null || value === undefined ? '-' : formatBaht(Number(value));
  }

  employeeName(employee: Employee): string {
    return `${employee.firstName} ${employee.lastName}`.trim();
  }

  hasError(controlName: keyof typeof this.form.controls, errorCode: string): boolean {
    const control = this.form.controls[controlName];
    return control.touched && control.hasError(errorCode);
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
      if (this.jobId) {
        await this.jobService.updateJob(this.jobId, payload);
        this.toast.success('แก้ไขข้อมูลงานสำเร็จ');
      } else {
        await this.jobService.createJob(payload);
        this.toast.success('สร้าง Job สำเร็จ');
      }
      await this.router.navigateByUrl('/jobs');
    } catch (error) {
      this.formError.set(mapJobError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async prefillCode(): Promise<void> {
    try {
      const code = await this.jobService.generateNextJobCode();
      if (!this.form.controls.jobCode.value) {
        this.form.controls.jobCode.setValue(code);
      }
    } catch (error) {
      console.error('Failed to generate job code', error);
    }
  }

  private async loadJob(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const job = await this.jobService.getJobById(id);
      if (!job) {
        this.toast.error('ไม่พบข้อมูลงานก่อสร้าง');
        await this.router.navigateByUrl('/jobs');
        return;
      }
      this.patchForm(job);
    } catch (error) {
      console.error('Failed to load job', error);
      this.toast.error('ไม่สามารถโหลดข้อมูลงานได้');
    } finally {
      this.loading.set(false);
    }
  }

  private patchForm(job: Job): void {
    this.form.patchValue({
      jobCode: job.jobCode,
      jobName: job.jobName,
      description: job.description ?? '',
      customerName: job.customerName,
      customerPhone: job.customerPhone ?? '',
      location: job.location ?? '',
      contractValue: job.contractValue,
      estimatedBudget: job.estimatedBudget ?? null,
      startDate: toDateInputValue(job.startDate),
      expectedEndDate: job.expectedEndDate ? toDateInputValue(job.expectedEndDate) : '',
      supervisorId: job.supervisorId ?? '',
      status: job.status,
      note: job.note ?? '',
    });
  }

  private toWriteData(): JobWriteData {
    const value = this.form.getRawValue();
    return {
      jobCode: value.jobCode,
      jobName: value.jobName,
      customerName: value.customerName,
      customerPhone: trimValue(value.customerPhone),
      location: trimValue(value.location),
      description: trimValue(value.description),
      contractValue: Number(value.contractValue),
      estimatedBudget:
        value.estimatedBudget === null || value.estimatedBudget === undefined
          ? undefined
          : Number(value.estimatedBudget),
      startDate: new Date(`${value.startDate}T00:00:00`),
      expectedEndDate: value.expectedEndDate
        ? new Date(`${value.expectedEndDate}T00:00:00`)
        : undefined,
      supervisorId: trimValue(value.supervisorId),
      status: value.status,
      note: trimValue(value.note),
    };
  }
}
