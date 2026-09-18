import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'thaiCurrency',
  standalone: true,
})
export class ThaiCurrencyPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '฿0.00';
    }

    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
    }).format(value);
  }
}
