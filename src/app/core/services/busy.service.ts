import { computed, inject, Injectable, signal } from '@angular/core';
import { NgxSpinnerService } from 'ngx-spinner';

@Injectable({
  providedIn: 'root',
})
export class BusyService {
  private readonly spinner = inject(NgxSpinnerService);
  private readonly pending = signal(0);
  readonly active = computed(() => this.pending() > 0);

  track<T>(work: Promise<T>): Promise<T> {
    const wasIdle = this.pending() === 0;
    this.pending.update((count) => count + 1);
    if (wasIdle) {
      void this.spinner.show();
    }
    return work.finally(() => {
      this.pending.update((count) => Math.max(0, count - 1));
      if (this.pending() === 0) {
        void this.spinner.hide();
      }
    });
  }

  guard<T extends object>(target: T, methodNames: readonly (keyof T)[]): void {
    for (const name of methodNames) {
      const original = (target[name] as (...args: never[]) => Promise<unknown>).bind(target);
      Object.assign(target, {
        [name]: (...args: never[]) => this.track(Promise.resolve(original(...args))),
      });
    }
  }
}
