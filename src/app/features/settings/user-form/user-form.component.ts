import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  JOB_STATUS_LABELS,
  ROLE_MENUS,
  USER_ROLE_LABELS,
  USER_ROLES,
  UserRole,
} from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { JobService } from '../../../core/services/job.service';
import { UserService, mapUserError } from '../../../core/services/user.service';
import { loginId, normalizeUsername } from '../../../core/utils/auth-login.util';
import { visibleContactEmail } from '../../../core/utils/contact-email.util';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent, LoadingStateComponent],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly employeeService = inject(EmployeeService);
  private readonly jobService = inject(JobService);
  private readonly toast = inject(ToastService);

  readonly uid = this.route.snapshot.paramMap.get('uid');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;
  readonly jobStatusLabels = JOB_STATUS_LABELS;
  readonly assignedJobIds = signal<string[]>([]);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,32}$/)]],
    email: ['', Validators.email],
    password: [''],
    role: this.fb.nonNullable.control<UserRole>('MANAGER', Validators.required),
    employeeId: [''],
    isActive: [true],
  });

  readonly employeeOptions = computed(() => {
    const used = new Set(
      this.userService
        .users()
        .filter((item) => item.uid !== this.uid && item.employeeId)
        .map((item) => item.employeeId),
    );
    return this.employeeService
      .employees()
      .filter((item) => item.status === 'ACTIVE' && !used.has(item.id));
  });

  readonly jobOptions = computed(() =>
    this.jobService
      .jobs()
      .filter((job) => job.status !== 'CLOSED' && job.status !== 'CANCELLED')
      .sort((a, b) => a.jobCode.localeCompare(b.jobCode, 'th')),
  );

  get isEdit(): boolean {
    return !!this.uid;
  }

  menusForRole(): readonly string[] {
    return ROLE_MENUS[this.form.controls.role.value];
  }

  ngOnInit(): void {
    this.form.controls.password.addValidators(Validators.minLength(6));
    if (!this.isEdit) {
      this.form.controls.password.addValidators(Validators.required);
      this.form.controls.password.updateValueAndValidity();
      return;
    }

    this.form.controls.password.updateValueAndValidity();

    this.form.controls.username.disable();
    const user = this.userService.getUserById(this.uid ?? '');
    if (user) {
      this.patchUser(user);
      return;
    }

    this.loading.set(true);
    const wait = setInterval(() => {
      const found = this.userService.getUserById(this.uid ?? '');
      if (found || !this.userService.loading()) {
        clearInterval(wait);
        this.loading.set(false);
        if (found) {
          this.patchUser(found);
        } else {
          this.toast.error('ไม่พบผู้ใช้');
          void this.router.navigateByUrl('/settings/users');
        }
      }
    }, 80);
  }

  isJobAssigned(jobId: string): boolean {
    return this.assignedJobIds().includes(jobId);
  }

  toggleJob(jobId: string, checked: boolean): void {
    this.assignedJobIds.update((ids) => {
      if (checked) {
        return ids.includes(jobId) ? ids : [...ids, jobId];
      }
      return ids.filter((id) => id !== jobId);
    });
  }

  toggleAllJobs(checked: boolean): void {
    const hidden = this.hiddenAssignedJobIds();
    this.assignedJobIds.set(
      checked ? [...hidden, ...this.jobOptions().map((job) => job.id)] : hidden,
    );
  }

  onToggleJob(jobId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleJob(jobId, target.checked);
  }

  onToggleAllJobs(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.toggleAllJobs(target.checked);
  }

  allJobsAssigned(): boolean {
    const jobs = this.jobOptions();
    return jobs.length > 0 && jobs.every((job) => this.assignedJobIds().includes(job.id));
  }

  private hiddenAssignedJobIds(): string[] {
    const visible = new Set(this.jobOptions().map((job) => job.id));
    return this.assignedJobIds().filter((id) => !visible.has(id));
  }

  hasError(control: 'displayName' | 'username' | 'email' | 'password', error: string): boolean {
    const field = this.form.controls[control];
    return field.touched && field.hasError(error);
  }

  async submit(): Promise<void> {
    this.formError.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      username: normalizeUsername(value.username),
      displayName: value.displayName.trim(),
      role: value.role,
      employeeId: value.employeeId || undefined,
      assignedJobIds: value.role === 'MANAGER' ? this.assignedJobIds() : [],
      contactEmail: value.email.trim() || undefined,
      isActive: value.isActive,
      password: value.password,
    };

    this.saving.set(true);
    try {
      if (this.isEdit && this.uid) {
        await this.userService.updateUser(this.uid, payload);
        this.toast.success(payload.password?.trim() ? 'บันทึกและตั้งรหัสผ่านใหม่แล้ว' : 'บันทึกผู้ใช้แล้ว');
      } else {
        await this.userService.createUser(payload);
        this.toast.success('สร้างผู้ใช้แล้ว สามารถเข้าสู่ระบบได้ทันที');
      }
      await this.router.navigateByUrl('/settings/users');
    } catch (error) {
      this.formError.set(mapUserError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private patchUser(user: {
    displayName: string;
    username?: string;
    email: string;
    contactEmail?: string;
    role: UserRole;
    employeeId?: string;
    assignedJobIds?: string[];
    isActive: boolean;
  }): void {
    this.form.patchValue({
      displayName: user.displayName,
      username: loginId(user),
      email: visibleContactEmail(user),
      role: user.role,
      employeeId: user.employeeId ?? '',
      isActive: user.isActive,
    });
    this.assignedJobIds.set(user.assignedJobIds ?? []);
  }
}
