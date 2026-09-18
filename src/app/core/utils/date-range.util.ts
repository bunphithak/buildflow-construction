import { bangkokDateKey, monthRangeBangkok, startOfDayBangkok, weekRangeBangkok, yearRangeBangkok } from './datetime.util';

export type DashboardPreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
}

export function resolveDashboardRange(
  preset: DashboardPreset,
  customStart?: string,
  customEnd?: string,
  now = new Date(),
): DateRange {
  if (preset === 'today') {
    const today = startOfDayBangkok(now);
    return { start: today, end: today };
  }
  if (preset === 'week') {
    return weekRangeBangkok(now);
  }
  if (preset === 'month') {
    const key = bangkokDateKey(now);
    return monthRangeBangkok(Number(key.slice(0, 4)), Number(key.slice(5, 7)));
  }
  if (preset === 'year') {
    return yearRangeBangkok(now);
  }
  const start = customStart ? startOfDayBangkok(customStart) : startOfDayBangkok(now);
  const end = customEnd ? startOfDayBangkok(customEnd) : start;
  return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
}

export function formatDateRangeLabel(range: DateRange): string {
  const fmt = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${fmt.format(range.start)} - ${fmt.format(range.end)}`;
}

export function monthKeyFromDate(value: Date): string {
  return bangkokDateKey(value).slice(0, 7);
}

export function formatMonthKey(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
}
