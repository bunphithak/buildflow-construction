import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ROLE_MENUS,
  USER_ROLE_LABELS,
  USER_ROLES,
  UserRole,
} from '../../../core/models';
import { EmployeeService } from '../../../core/services/employee.service';
import { UserService, mapUserError } from '../../../core/services/user.service';
import { loginId, normalizeUsername } from '../../../core/utils/auth-login.util';
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
  private readonly toast = inject(ToastService);

  readonly uid = this.route.snapshot.paramMap.get('uid');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly roles = USER_ROLES;
  readonly roleLabels = USER_ROLE_LABELS;

  readonly form = this.fb.nonNullable.group({
    displayName: ['', Validators.required],
    username: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._-]{3,32}$/)]],
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

  get isEdit(): boolean {
    return !!this.uid;
  }

  menusForRole(): readonly string[] {
    return ROLE_MENUS[this.form.controls.role.value];
  }

  ngOnInit(): void {
    if (!this.isEdit) {
      this.form.controls.password.addValidators([Validators.required, Validators.minLength(6)]);
      this.form.controls.password.updateValueAndValidity();
      return;
    }

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

  hasError(control: 'displayName' | 'username' | 'password', error: string): boolean {
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
      isActive: value.isActive,
      password: value.password,
    };

    this.saving.set(true);
    try {
      if (this.isEdit && this.uid) {
        await this.userService.updateUser(this.uid, payload);
        this.toast.success('บันทึกผู้ใช้แล้ว');
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
    role: UserRole;
    employeeId?: string;
    isActive: boolean;
  }): void {
    this.form.patchValue({
      displayName: user.displayName,
      username: loginId(user),
      role: user.role,
      employeeId: user.employeeId ?? '',
      isActive: user.isActive,
    });
  }
}
