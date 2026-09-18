import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'warning';
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private nextId = 1;
  readonly messages = signal<ToastMessage[]>([]);

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.show(text, 'error');
  }

  warning(text: string): void {
    this.show(text, 'warning');
  }

  private show(text: string, type: ToastMessage['type']): void {
    const id = this.nextId++;
    this.messages.update((items) => [...items, { id, text, type }]);
    window.setTimeout(() => this.dismiss(id), 3500);
  }

  dismiss(id: number): void {
    this.messages.update((items) => items.filter((item) => item.id !== id));
  }
}
