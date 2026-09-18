import { Injectable, signal } from '@angular/core';
import { DEFAULT_ATTENDANCE_SETTINGS } from '../constants/attendance-settings';
import { AttendanceSettings } from '../models';

@Injectable({
  providedIn: 'root',
})
export class AttendanceSettingsService {
  readonly settings = signal<AttendanceSettings>({ ...DEFAULT_ATTENDANCE_SETTINGS });

  get(): AttendanceSettings {
    return this.settings();
  }
}
