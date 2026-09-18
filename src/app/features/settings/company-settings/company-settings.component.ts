import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CompanySettingsService } from '../../../core/services/company-settings.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { ToastService } from '../../../shared/services/toast.service';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PageHeaderComponent],
  templateUrl: './company-settings.component.html',
  styleUrl: './company-settings.component.scss',
})
export class CompanySettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly companySettings = inject(CompanySettingsService);
  private readonly toast = inject(ToastService);

  readonly form = this.fb.nonNullable.group({
    companyName: [this.companySettings.settings().companyName, Validators.required],
    address: [this.companySettings.settings().address ?? ''],
    phone: [this.companySettings.settings().phone ?? ''],
    taxId: [this.companySettings.settings().taxId ?? ''],
    logoUrl: [this.companySettings.settings().logoUrl ?? ''],
    monthlyAbsenceDeductionEnabled: [this.companySettings.settings().monthlyAbsenceDeductionEnabled],
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    try {
      await this.companySettings.save({
        companyName: this.form.controls.companyName.value,
        address: this.form.controls.address.value,
        phone: this.form.controls.phone.value,
        taxId: this.form.controls.taxId.value,
        logoUrl: this.form.controls.logoUrl.value,
        monthlyAbsenceDeductionEnabled: this.form.controls.monthlyAbsenceDeductionEnabled.value,
      });
      this.toast.success('บันทึกข้อมูลกิจการแล้ว');
    } catch (error) {
      console.error(error);
      this.toast.error('ไม่สามารถบันทึกข้อมูลกิจการได้');
    }
  }
}
