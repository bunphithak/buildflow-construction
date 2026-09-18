import { Timestamp } from '@angular/fire/firestore';

export type FirestoreTimestamp = Timestamp;

export interface Auditable {
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
}

export interface MonthYearFilter {
  month: number;
  year: number;
}
