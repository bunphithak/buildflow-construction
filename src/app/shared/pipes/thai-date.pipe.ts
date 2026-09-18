import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';

@Pipe({
  name: 'thaiDate',
  standalone: true,
})
export class ThaiDatePipe implements PipeTransform {
  transform(
    value: Date | Timestamp | string | null | undefined,
    options: Intl.DateTimeFormatOptions | 'short' = { dateStyle: 'medium' },
  ): string {
    if (!value) {
      return '-';
    }

    const date = this.toDate(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      ...this.resolveOptions(options),
    }).format(date);
  }

  private resolveOptions(
    options: Intl.DateTimeFormatOptions | 'short',
  ): Intl.DateTimeFormatOptions {
    if (options === 'short') {
      return { day: '2-digit', month: '2-digit', year: 'numeric' };
    }
    return options;
  }

  private toDate(value: Date | Timestamp | string): Date {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value.toDate();
  }
}
