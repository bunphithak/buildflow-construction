import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  private resolver: ((confirmed: boolean) => void) | null = null;
  readonly options = signal<ConfirmOptions | null>(null);

  confirm(options: ConfirmOptions): Promise<boolean> {
    this.options.set({
      confirmLabel: 'ยืนยัน',
      cancelLabel: 'ยกเลิก',
      ...options,
    });

    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  close(confirmed: boolean): void {
    if (!this.resolver) {
      return;
    }
    const resolve = this.resolver;
    this.resolver = null;
    // Unmount after the originating click finishes so it cannot hit the page underneath.
    window.setTimeout(() => {
      this.options.set(null);
      resolve(confirmed);
    }, 0);
  }
}
