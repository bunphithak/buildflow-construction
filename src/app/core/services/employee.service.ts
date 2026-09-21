import { computed, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  collectionData,
  deleteField,
  doc,
  Firestore,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import {
  getDownloadURL,
  ref,
  Storage,
  uploadBytes,
} from '@angular/fire/storage';
import { DocumentData } from 'firebase/firestore';
import { map } from 'rxjs';
import { COLLECTIONS } from '../constants/collections';
import {
  Employee,
  EmployeeGender,
  EmployeeNationality,
  EmployeeStatus,
  EmployeeWriteData,
  EmploymentType,
} from '../models';
import { omitUndefined, toDate } from '../utils/form.util';

const CODE_PATTERN = /^EMP-(\d+)$/i;
const MAX_PROFILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  private readonly firestore = inject(Firestore);
  private readonly storage = inject(Storage);
  private readonly employeesRef = collection(this.firestore, COLLECTIONS.employees);

  readonly employees = signal<Employee[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly loaded = signal(false);

  readonly totalCount = computed(() => this.employees().length);
  readonly monthlyCount = computed(
    () => this.employees().filter((item) => item.employmentType === 'MONTHLY').length,
  );
  readonly dailyCount = computed(
    () => this.employees().filter((item) => item.employmentType === 'DAILY').length,
  );
  readonly activeCount = computed(
    () => this.employees().filter((item) => item.status === 'ACTIVE').length,
  );

  constructor() {
    collectionData(this.employeesRef, { idField: 'id' })
      .pipe(map((rows) => rows.map((row) => this.mapEmployee(row))))
      .subscribe({
        next: (employees) => {
          this.employees.set(employees);
          this.loading.set(false);
          this.loaded.set(true);
          this.error.set(null);
        },
        error: (error: unknown) => {
          console.error('Failed to load employees', error);
          this.error.set('ไม่สามารถโหลดข้อมูลพนักงานได้');
          this.loading.set(false);
        },
      });
  }

  getEmployees(): Employee[] {
    return this.employees();
  }

  async getEmployeeById(id: string): Promise<Employee | null> {
    const cached = this.employees().find((item) => item.id === id);
    if (cached) {
      return cached;
    }

    const snapshot = await getDoc(doc(this.firestore, COLLECTIONS.employees, id));
    if (!snapshot.exists()) {
      return null;
    }
    return this.mapEmployee({ id: snapshot.id, ...snapshot.data() });
  }

  async generateNextEmployeeCode(): Promise<string> {
    const codes = await this.getExistingCodes();
    let maxNumber = 0;
    for (const code of codes) {
      const match = CODE_PATTERN.exec(code.trim());
      if (match) {
        maxNumber = Math.max(maxNumber, Number(match[1]));
      }
    }
    return `EMP-${String(maxNumber + 1).padStart(3, '0')}`;
  }

  async createEmployee(
    data: EmployeeWriteData,
    profileFile?: File,
  ): Promise<{ id: string; imageError?: string }> {
    if (profileFile) {
      this.validateProfileFile(profileFile);
    }
    await this.assertUniqueCode(data.employeeCode);
    const employeeRef = doc(this.employeesRef);
    const payload = this.toFirestorePayload(data, employeeRef.id, true);
    await setDoc(employeeRef, payload);

    if (!profileFile) {
      return { id: employeeRef.id };
    }

    try {
      await this.uploadProfileImage(employeeRef.id, profileFile);
      return { id: employeeRef.id };
    } catch (error) {
      console.error('Employee created but image upload failed', error);
      return { id: employeeRef.id, imageError: 'UPLOAD_FAILED' };
    }
  }

  async updateEmployee(
    id: string,
    data: EmployeeWriteData,
    profileFile?: File,
  ): Promise<{ imageError?: string }> {
    if (profileFile) {
      this.validateProfileFile(profileFile);
    }
    await this.assertUniqueCode(data.employeeCode, id);
    const payload = this.toFirestorePayload(data, id, false);
    if (data.employmentType === 'DAILY') {
      payload['monthlySalary'] = deleteField();
    } else {
      payload['dailyRate'] = deleteField();
    }
    await updateDoc(
      doc(this.firestore, COLLECTIONS.employees, id),
      payload as DocumentData,
    );

    if (!profileFile) {
      return {};
    }

    try {
      await this.uploadProfileImage(id, profileFile);
      return {};
    } catch (error) {
      console.error('Employee updated but image upload failed', error);
      return { imageError: 'UPLOAD_FAILED' };
    }
  }

  async changeEmployeeStatus(id: string, status: EmployeeStatus): Promise<void> {
    await updateDoc(doc(this.firestore, COLLECTIONS.employees, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  validateProfileFile(file: File): void {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
      throw new Error('INVALID_IMAGE_TYPE');
    }
    if (file.size > MAX_PROFILE_BYTES) {
      throw new Error('IMAGE_TOO_LARGE');
    }
  }

  async uploadProfileImage(employeeId: string, file: File): Promise<string> {
    this.validateProfileFile(file);
    const extension = this.fileExtension(file);
    const storageRef = ref(
      this.storage,
      `employees/${employeeId}/profile/avatar-${Date.now()}.${extension}`,
    );
    try {
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateDoc(doc(this.firestore, COLLECTIONS.employees, employeeId), {
        profileImageUrl: url,
        updatedAt: serverTimestamp(),
      });
      return url;
    } catch (error) {
      console.error('Failed to upload employee profile image', error);
      throw new Error('UPLOAD_FAILED');
    }
  }

  private fileExtension(file: File): string {
    if (file.type === 'image/png') {
      return 'png';
    }
    if (file.type === 'image/webp') {
      return 'webp';
    }
    return 'jpg';
  }

  private async assertUniqueCode(employeeCode: string, excludeId?: string): Promise<void> {
    const normalized = employeeCode.trim().toUpperCase();
    const cachedDuplicate = this.employees().some(
      (item) => item.employeeCode.trim().toUpperCase() === normalized && item.id !== excludeId,
    );
    if (cachedDuplicate) {
      throw new Error('DUPLICATE_CODE');
    }

    const snapshot = await getDocs(
      query(this.employeesRef, where('employeeCode', '==', employeeCode.trim())),
    );
    const exists = snapshot.docs.some((item) => item.id !== excludeId);
    if (exists) {
      throw new Error('DUPLICATE_CODE');
    }
  }

  private async getExistingCodes(): Promise<string[]> {
    if (this.loaded()) {
      return this.employees().map((item) => item.employeeCode);
    }
    const snapshot = await getDocs(this.employeesRef);
    return snapshot.docs.map((item) => String(item.data()['employeeCode'] ?? ''));
  }

  private toFirestorePayload(
    data: EmployeeWriteData,
    id: string,
    isCreate: boolean,
  ): Record<string, unknown> {
    const payload = omitUndefined({
      employeeId: id,
      employeeCode: data.employeeCode.trim(),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      nickname: data.nickname?.trim(),
      phone: data.phone?.trim(),
      address: data.address?.trim(),
      position: data.position.trim(),
      department: data.department?.trim(),
      nationality: data.nationality,
      gender: data.gender,
      startDate: Timestamp.fromDate(data.startDate),
      employmentType: data.employmentType,
      status: data.status,
      dailyRate: data.employmentType === 'DAILY' ? data.dailyRate : undefined,
      monthlySalary: data.employmentType === 'MONTHLY' ? data.monthlySalary : undefined,
      overtimeRate: data.overtimeRate,
      bankName: data.bankName?.trim(),
      bankAccount: data.bankAccount?.trim(),
      profileImageUrl: data.profileImageUrl,
      note: data.note?.trim(),
      updatedAt: serverTimestamp(),
    });

    if (isCreate) {
      payload['createdAt'] = serverTimestamp();
    }

    return payload;
  }

  private mapEmployee(row: DocumentData): Employee {
    const employmentType: EmploymentType = row['employmentType'] === 'MONTHLY' ? 'MONTHLY' : 'DAILY';
    const status: EmployeeStatus = row['status'] === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const id = String(row['id'] ?? row['employeeId'] ?? '');

    return {
      id,
      employeeId: String(row['employeeId'] ?? id),
      employeeCode: String(row['employeeCode'] ?? ''),
      firstName: String(row['firstName'] ?? ''),
      lastName: String(row['lastName'] ?? ''),
      nickname: row['nickname'] ? String(row['nickname']) : undefined,
      phone: row['phone'] ? String(row['phone']) : undefined,
      address: row['address'] ? String(row['address']) : undefined,
      position: String(row['position'] ?? ''),
      department: row['department'] ? String(row['department']) : undefined,
      nationality: this.mapNationality(row['nationality']),
      gender: this.mapGender(row['gender']),
      startDate: this.mapStartDate(row['startDate']),
      employmentType,
      status,
      dailyRate: this.mapNumber(row['dailyRate']),
      monthlySalary: this.mapNumber(row['monthlySalary']),
      overtimeRate: this.mapNumber(row['overtimeRate']),
      bankName: row['bankName'] ? String(row['bankName']) : undefined,
      bankAccount: row['bankAccount'] ? String(row['bankAccount']) : undefined,
      profileImageUrl: row['profileImageUrl'] ? String(row['profileImageUrl']) : undefined,
      note: row['note'] ? String(row['note']) : undefined,
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }

  private mapGender(value: unknown): EmployeeGender | undefined {
    return value === 'MALE' || value === 'FEMALE' ? value : undefined;
  }

  private mapNationality(value: unknown): EmployeeNationality | undefined {
    return value === 'TH' || value === 'KH' || value === 'MM' || value === 'OTHER' ? value : undefined;
  }

  private mapStartDate(value: unknown): Date | Timestamp | string {
    if (value instanceof Timestamp || value instanceof Date || typeof value === 'string') {
      return value;
    }
    return new Date();
  }

  private mapNumber(value: unknown): number | undefined {
    return typeof value === 'number' && !Number.isNaN(value) ? value : undefined;
  }
}

export function mapEmployeeError(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case 'DUPLICATE_CODE':
        return 'รหัสพนักงานนี้มีอยู่ในระบบแล้ว';
      case 'INVALID_IMAGE_TYPE':
        return 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP';
      case 'IMAGE_TOO_LARGE':
        return 'ขนาดรูปต้องไม่เกิน 5 MB';
      case 'UPLOAD_FAILED':
        return 'บันทึกข้อมูลแล้ว แต่ไม่สามารถอัปโหลดรูปได้';
      default:
        break;
    }
  }
  console.error('Employee operation failed', error);
  return 'ไม่สามารถบันทึกข้อมูลพนักงานได้';
}

export function formatEmployeeWage(employee: Pick<Employee, 'employmentType' | 'dailyRate' | 'monthlySalary'>): string {
  const amount =
    employee.employmentType === 'DAILY' ? employee.dailyRate : employee.monthlySalary;
  const formatted = new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
  return employee.employmentType === 'DAILY'
    ? `${formatted} บาท/วัน`
    : `${formatted} บาท/เดือน`;
}

export function toEmployeeStartDate(value: Date | Timestamp | string): Date {
  return toDate(value);
}
