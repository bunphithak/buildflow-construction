import { computed, inject, Injectable, signal } from '@angular/core';
import {
  collection,
  collectionData,
  doc,
  Firestore,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { DocumentData } from 'firebase/firestore';
import { COLLECTIONS } from '../constants/collections';
import {
  DEFAULT_EXPENSE_CATEGORY_SEEDS,
  ExpenseCategory,
  ExpenseCategoryStatus,
} from '../models';
import { omitUndefined } from '../utils/form.util';

@Injectable({
  providedIn: 'root',
})
export class ExpenseCategoryService {
  private readonly firestore = inject(Firestore);
  private readonly categoriesRef = collection(this.firestore, COLLECTIONS.expenseCategories);
  private readonly expensesRef = collection(this.firestore, COLLECTIONS.expenses);
  private seeding = false;

  readonly categories = signal<ExpenseCategory[]>([]);
  readonly loading = signal(true);
  readonly loaded = signal(false);

  readonly activeCategories = computed(() =>
    this.categories()
      .filter((item) => item.status === 'ACTIVE')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'th')),
  );

  constructor() {
    collectionData(this.categoriesRef, { idField: 'id' })
      .subscribe({
        next: (rows) => {
          const categories = rows
            .map((row) => this.mapCategory(row))
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'th'));
          this.categories.set(categories);
          this.loading.set(false);
          this.loaded.set(true);
          if (categories.length === 0) {
            void this.seedDefaults();
          }
        },
        error: (error: unknown) => {
          console.error('Failed to load expense categories', error);
          this.loading.set(false);
        },
      });
  }

  getCategories(): ExpenseCategory[] {
    return this.categories();
  }

  getActiveCategories(): ExpenseCategory[] {
    return this.activeCategories();
  }

  getById(id: string): ExpenseCategory | undefined {
    return this.categories().find((item) => item.id === id);
  }

  async createCategory(data: {
    code: string;
    name: string;
    sortOrder?: number;
  }): Promise<string> {
    await this.assertUniqueCode(data.code);
    const ref = doc(this.categoriesRef);
    await setDoc(ref, {
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      status: 'ACTIVE',
      sortOrder: data.sortOrder ?? this.nextSortOrder(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateCategory(
    id: string,
    data: { code: string; name: string; sortOrder?: number },
  ): Promise<void> {
    await this.assertUniqueCode(data.code, id);
    await updateDoc(
      doc(this.firestore, COLLECTIONS.expenseCategories, id),
      omitUndefined({
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        sortOrder: data.sortOrder,
        updatedAt: serverTimestamp(),
      }) as DocumentData,
    );
  }

  async changeCategoryStatus(id: string, status: ExpenseCategoryStatus): Promise<void> {
    await updateDoc(doc(this.firestore, COLLECTIONS.expenseCategories, id), {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  async isCategoryUsed(categoryId: string): Promise<boolean> {
    const snapshot = await getDocs(
      query(this.expensesRef, where('categoryId', '==', categoryId), limit(1)),
    );
    return !snapshot.empty;
  }

  private nextSortOrder(): number {
    const max = this.categories().reduce((current, item) => Math.max(current, item.sortOrder), 0);
    return max + 10;
  }

  private async assertUniqueCode(code: string, excludeId?: string): Promise<void> {
    const normalized = code.trim().toUpperCase();
    const exists = this.categories().some(
      (item) => item.code.toUpperCase() === normalized && item.id !== excludeId,
    );
    if (exists) {
      throw new Error('DUPLICATE_CATEGORY');
    }
    const snapshot = await getDocs(query(this.categoriesRef, where('code', '==', normalized)));
    if (snapshot.docs.some((item) => item.id !== excludeId)) {
      throw new Error('DUPLICATE_CATEGORY');
    }
  }

  private async seedDefaults(): Promise<void> {
    if (this.seeding) {
      return;
    }
    this.seeding = true;
    try {
      const existing = await getDocs(this.categoriesRef);
      if (!existing.empty) {
        return;
      }
      for (const seed of DEFAULT_EXPENSE_CATEGORY_SEEDS) {
        const ref = doc(this.categoriesRef);
        await setDoc(ref, {
          ...seed,
          status: 'ACTIVE',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Failed to seed expense categories', error);
    } finally {
      this.seeding = false;
    }
  }

  private mapCategory(row: DocumentData): ExpenseCategory {
    return {
      id: String(row['id'] ?? ''),
      code: String(row['code'] ?? ''),
      name: String(row['name'] ?? row['nameTh'] ?? ''),
      status: row['status'] === 'INACTIVE' || row['isActive'] === false ? 'INACTIVE' : 'ACTIVE',
      sortOrder: Number(row['sortOrder'] ?? 0),
      createdAt: row['createdAt'] instanceof Timestamp ? row['createdAt'] : undefined,
      updatedAt: row['updatedAt'] instanceof Timestamp ? row['updatedAt'] : undefined,
    };
  }
}
