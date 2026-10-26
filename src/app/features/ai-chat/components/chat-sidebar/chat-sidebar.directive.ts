import { Directive, ElementRef, inject, HostListener, signal } from '@angular/core';
@Directive({
  selector: '[appChatNavigation]',
  standalone: true,
  exportAs: 'chatNavigation',
  host: { '[class.chat-navigation-open]': 'open()' },
})
export class ChatSidebarDirective {
  readonly open = signal(false);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  toggle(): void {
    this.open() ? this.close() : this.open.set(true);
  }
  close(): void {
    this.open.set(false);
    this.element.nativeElement.querySelector<HTMLButtonElement>('.chat-navigation-toggle')?.focus();
  }
  @HostListener('keydown', ['$event']) keydown(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      this.element.nativeElement.querySelectorAll<HTMLElement>(
        '.chat-navigation-toggle, .chat-sidebar button:not(:disabled)',
      ),
    ).filter((el) => el.getClientRects().length > 0);
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
