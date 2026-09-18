const BANGKOK_OFFSET = '+07:00';

export function bangkokDateKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function startOfDayBangkok(value: Date | string): Date {
  const key = typeof value === 'string' ? value : bangkokDateKey(value);
  return new Date(`${key}T00:00:00${BANGKOK_OFFSET}`);
}

export function nextDayBangkok(value: Date | string): Date {
  return new Date(startOfDayBangkok(value).getTime() + 24 * 60 * 60 * 1000);
}

export function combineBangkokDateAndTime(dateValue: Date | string, time: string): Date {
  const key = typeof dateValue === 'string' ? dateValue : bangkokDateKey(dateValue);
  return new Date(`${key}T${time}:00${BANGKOK_OFFSET}`);
}

export function formatBangkokTime(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(value);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

export function monthRangeBangkok(year: number, month: number): { start: Date; end: Date } {
  const mm = String(month).padStart(2, '0');
  const start = startOfDayBangkok(`${year}-${mm}-01`);
  const lastDay = new Date(year, month, 0).getDate();
  const end = startOfDayBangkok(`${year}-${mm}-${String(lastDay).padStart(2, '0')}`);
  return { start, end };
}

export function weekRangeBangkok(now = new Date()): { start: Date; end: Date } {
  const noon = new Date(`${bangkokDateKey(now)}T12:00:00${BANGKOK_OFFSET}`);
  const mondayOffset = (noon.getUTCDay() + 6) % 7;
  const monday = new Date(noon.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
  return { start: startOfDayBangkok(monday), end: startOfDayBangkok(sunday) };
}

export function yearRangeBangkok(now = new Date()): { start: Date; end: Date } {
  const year = Number(bangkokDateKey(now).slice(0, 4));
  return {
    start: startOfDayBangkok(`${year}-01-01`),
    end: startOfDayBangkok(`${year}-12-31`),
  };
}

export function inclusiveCalendarDays(start: Date, end: Date): number {
  const startMs = startOfDayBangkok(start).getTime();
  const endMs = startOfDayBangkok(end).getTime();
  return Math.max(1, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)) + 1);
}

export function daysInBangkokMonth(year: number, month: number): number {
  const { start, end } = monthRangeBangkok(year, month);
  return inclusiveCalendarDays(start, end);
}

export function payrollPeriodKey(start: Date, end: Date): string {
  return `${bangkokDateKey(start)}_${bangkokDateKey(end)}`;
}

export type PayrollCutPreset = 'first_half' | 'second_half' | 'full_month' | 'custom';

export function payrollCutRange(
  year: number,
  month: number,
  preset: PayrollCutPreset,
  customStart?: string,
  customEnd?: string,
): { start: Date; end: Date } {
  const { start, end } = monthRangeBangkok(year, month);
  if (preset === 'first_half') {
    return { start, end: startOfDayBangkok(`${year}-${String(month).padStart(2, '0')}-15`) };
  }
  if (preset === 'second_half') {
    return {
      start: startOfDayBangkok(`${year}-${String(month).padStart(2, '0')}-16`),
      end,
    };
  }
  if (preset === 'custom' && customStart && customEnd) {
    return { start: startOfDayBangkok(customStart), end: startOfDayBangkok(customEnd) };
  }
  return { start, end };
}

export function defaultPayDate(end: Date, preset: PayrollCutPreset): Date {
  const key = bangkokDateKey(end);
  const [year, month] = key.split('-').map(Number);
  if (preset === 'first_half') {
    return startOfDayBangkok(`${year}-${String(month).padStart(2, '0')}-20`);
  }
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  if (preset === 'second_half' || preset === 'full_month') {
    return startOfDayBangkok(`${nextYear}-${String(nextMonth).padStart(2, '0')}-05`);
  }
  const plusFive = new Date(startOfDayBangkok(end).getTime() + 5 * 24 * 60 * 60 * 1000);
  return startOfDayBangkok(plusFive);
}

export function formatThaiDateShort(value: Date): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

export function formatPayrollRangeLabel(start: Date, end: Date, payDate?: Date): string {
  const range = `${formatThaiDateShort(start)} – ${formatThaiDateShort(end)}`;
  return payDate ? `${range} · จ่าย ${formatThaiDateShort(payDate)}` : range;
}

export function formatPayrollPeriod(year: number, month: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}

export function roundMoney(value: number | null | undefined): number {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) {
    return 0;
  }
  return Math.round(amount * 100) / 100;
}

export function parseTimeToMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function hasTimeOverlap(
  startA: Date,
  endA: Date,
  startB: Date,
  endB: Date,
): boolean {
  return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
}
