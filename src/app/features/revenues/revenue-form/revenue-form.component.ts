import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  canCreateJobRevenue,
  REVENUE_PAYMENT_METHODS,
  REVENUE_STATUS_LABELS,
  REVENUE_STATUSES,
  REVENUE_TYPE_LABELS,
  REVENUE_TYPES,
  Revenue,
  RevenueStatus,
  RevenueType,
} from '../../../core/models';
import { JobService } from '../../../core/services/job.service';
import { mapRevenueError, RevenueService } from '../../../core/services/revenue.service';
import { toDateInputValue, trimValue } from '../../../core/utils/form.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-revenue-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './revenue-form.component.html',
  styleUrl: './revenue-form.component.scss',
})
export class RevenueFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly revenueService = inject(RevenueService);
  private readonly jobService = inject(JobService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  @Input() id: string | null = null;

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly current = signal<Revenue | null>(null);
  readonly types = REVENUE_TYPES;
  readonly statuses = REVENUE_STATUSES;
  readonly typeLabels = REVENUE_TYPE_LABELS;
  readonly statusLabels = REVENUE_STATUS_LABELS;
  readonly paymentMethods = REVENUE_PAYMENT_METHODS;

  readonly form = this.fb.nonNullable.group({
    jobId: ['', Validators.required],
    revenueDate: [toDateInputValue(new Date()), Validators.required],
    type: this.fb.nonNullable.control<RevenueType>('CONTRACT'),
    status: this.fb.nonNullable.control<RevenueStatus>('RECEIVED'),
    description: ['', Validators.required],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    paymentMethod: [''],
    documentNo: [''],
    note: [''],
  });

  readonly selectableJobs = computed(() => {
    const jobs = this.jobService.jobs();
    if (this.isEdit) {
      return jobs;
    }
    return jobs.filter((job) => canCreateJobRevenue(job.status));
  });

  get isEdit(): boolean {
    return !!this.id;
  }

  get title(): string {
    return this.isEdit ? 'แก้ไขรายรับ' : 'เพิ่มรายรับ';
  }

  async ngOnInit(): Promise<void> {
    this.id = this.id ?? this.route.snapshot.paramMap.get('id');
    const queryJobId = this.route.snapshot.queryParamMap.get('jobId');
    if (queryJobId && !this.isEdit) {
      this.form.controls.jobId.setValue(queryJobId);
    }
    if (!this.isEdit || !this.id) {
      return;
    }
    this.loading.set(true);
    try {
      const item = await this.revenueService.getRevenueById(this.id);
      if (!item) {
        this.toast.error('ไม่พบรายการรายรับ');
        await this.router.navigateByUrl('/revenues');
        return;
      }
      this.current.set(item);
      this.form.patchValue({
        jobId: item.jobId,
        revenueDate: toDateInputValue(item.revenueDate.toDate()),
        type: item.type,
        status: item.status,
        description: item.description,
        amount: item.amount,
        paymentMethod: item.paymentMethod ?? '',
        documentNo: item.documentNo ?? '',
        note: item.note ?? '',
      });
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถโหลดรายรับได้');
    } finally {
      this.loading.set(false);
    }
  }

  hasError(control: 'jobId' | 'revenueDate' | 'description' | 'amount', error: string): boolean {
    const field = this.form.controls[control];
    return field.touched && field.hasError(error);
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid) {
      return;
    }
    const jobId = this.form.controls.jobId.value;
    const job = await this.jobService.getJobById(jobId);
    if (!job) {
      this.formError.set('ไม่พบงานที่เลือก');
      return;
    }
    if (!this.isEdit && !canCreateJobRevenue(job.status)) {
      this.formError.set('งานนี้ถูกยกเลิกแล้ว ไม่สามารถเพิ่มรายรับได้');
      return;
    }
    this.saving.set(true);
    try {
      const payload = {
        jobId,
        revenueDate: new Date(this.form.controls.revenueDate.value),
        type: this.form.controls.type.value,
        status: this.form.controls.status.value,
        description: this.form.controls.description.value.trim(),
        amount: Number(this.form.controls.amount.value),
        paymentMethod: trimValue(this.form.controls.paymentMethod.value),
        documentNo: trimValue(this.form.controls.documentNo.value),
        note: trimValue(this.form.controls.note.value),
      };
      if (this.isEdit && this.id) {
        await this.revenueService.updateRevenue(this.id, payload);
        this.toast.success('บันทึกรายรับแล้ว');
        await this.router.navigate(['/revenues', this.id]);
      } else {
        await this.revenueService.createRevenue(payload);
        this.toast.success('เพิ่มรายรับแล้ว');
        this.form.patchValue({
          description: '',
          amount: null,
          documentNo: '',
          note: '',
        });
        this.form.markAsUntouched();
      }
    } catch (error) {
      const message = mapRevenueError(error);
      this.formError.set(message);
      this.toast.error(message);
    } finally {
      this.saving.set(false);
    }
  }
}
