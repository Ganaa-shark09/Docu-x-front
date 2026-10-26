import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
  exiting?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly messages = signal<ToastMessage[]>([]);
  private nextId = 0;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly removalTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly createdAt = new Map<number, number>();

  success(message: string): void { this.show(message, 'success'); }
  error(message: string): void { this.show(message, 'error'); }
  info(message: string): void { this.show(message, 'info'); }
  warning(message: string): void { this.show(message, 'warning'); }

  show(message: string, kind: ToastKind = 'info'): void {
    const clean = message.trim();
    if (!clean) return;
    const id = ++this.nextId;
    const current = this.messages();
    const last = current.at(-1);
    // A workflow page can replace the interceptor's generic result with its
    // more useful, operation-specific result in the same response turn.
    if (kind === 'success' && last?.message === 'Workflow action completed.'
      && clean !== last.message && Date.now() - (this.createdAt.get(last.id) ?? 0) < 500) {
      this.remove(last.id);
    }
    if (this.messages().length >= 3) this.remove(this.messages()[0].id);
    this.messages.update((items) => [...items, { id, kind, message: clean }]);
    this.createdAt.set(id, Date.now());
    this.timers.set(id, setTimeout(() => this.dismiss(id), 2500));
  }

  dismiss(id: number): void {
    if (!this.messages().some((item) => item.id === id && !item.exiting)) return;
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.messages.update((items) => items.map((item) => item.id === id ? { ...item, exiting: true } : item));
    this.removalTimers.set(id, setTimeout(() => this.remove(id), 350));
  }

  private remove(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const removalTimer = this.removalTimers.get(id);
    if (removalTimer) clearTimeout(removalTimer);
    this.removalTimers.delete(id);
    this.createdAt.delete(id);
    this.messages.update((items) => items.filter((item) => item.id !== id));
  }
}
