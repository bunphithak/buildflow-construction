import { AttendanceSettings } from '../models/attendance.model';

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettings = {
  defaultClockIn: '08:00',
  defaultClockOut: '17:00',
  defaultBreakMinutes: 60,
  monthlyWorkingDays: 26,
  paidHolidayEnabled: false,
};
