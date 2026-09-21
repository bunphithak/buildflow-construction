import { inject, Injectable, signal } from '@angular/core';
import { doc, docData, Firestore, serverTimestamp, setDoc } from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { COMPANY_LOGO_PATH } from '../constants/brand';
import { COLLECTIONS } from '../constants/collections';
import { CompanySettings } from '../models';
import { environment } from '../../../environments/environment';
import { omitUndefined } from '../utils/form.util';

const COMPANY_DOC = 'company';

const DEFAULT_COMPANY: CompanySettings = {
  companyName: environment.companyName,
  logoUrl: COMPANY_LOGO_PATH,
  monthlyAbsenceDeductionEnabled: false,
};

@Injectable({
  providedIn: 'root',
})
export class CompanySettingsService {
  private readonly firestore = inject(Firestore);
  private readonly docRef = doc(this.firestore, COLLECTIONS.settings, COMPANY_DOC);

  readonly settings = signal<CompanySettings>(DEFAULT_COMPANY);
  readonly loading = signal(true);

  constructor() {
    docData(this.docRef).subscribe({
      next: (row) => {
        this.settings.set(this.mapSettings(row));
        this.loading.set(false);
      },
      error: (error: unknown) => {
        console.error('Failed to load company settings', error);
        this.loading.set(false);
      },
    });
  }

  async save(data: CompanySettings): Promise<void> {
    await setDoc(
      this.docRef,
      omitUndefined({
        companyName: data.companyName.trim(),
        address: data.address?.trim(),
        phone: data.phone?.trim(),
        taxId: data.taxId?.trim(),
        logoUrl: data.logoUrl?.trim(),
        monthlyAbsenceDeductionEnabled: data.monthlyAbsenceDeductionEnabled === true,
        updatedAt: serverTimestamp(),
      }),
      { merge: true },
    );
  }

  private mapSettings(row: DocumentData | undefined): CompanySettings {
    if (!row) {
      return DEFAULT_COMPANY;
    }
    return {
      companyName: String(row['companyName'] ?? environment.companyName),
      address: row['address'] ? String(row['address']) : undefined,
      phone: row['phone'] ? String(row['phone']) : undefined,
      taxId: row['taxId'] ? String(row['taxId']) : undefined,
      logoUrl: row['logoUrl'] ? String(row['logoUrl']) : DEFAULT_COMPANY.logoUrl,
      monthlyAbsenceDeductionEnabled: row['monthlyAbsenceDeductionEnabled'] === true,
    };
  }
}
