import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ChatSidebarDirective } from './chat-sidebar.directive';
@Component({
  standalone: true,
  imports: [ChatSidebarDirective],
  template: `<section appChatNavigation #navigation="chatNavigation">
    <button class="chat-navigation-toggle" (click)="navigation.toggle()">Navigation</button>
    <aside class="chat-sidebar"><button>Exit</button><button>New chat</button></aside>
  </section>`,
})
class HostComponent {}
describe('ChatSidebarDirective', () => {
  it('opens and closes touch navigation and restores focus on Escape', async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const section: HTMLElement = fixture.nativeElement.querySelector('section');
    const toggle: HTMLButtonElement = section.querySelector('.chat-navigation-toggle')!;
    toggle.click();
    fixture.detectChanges();
    expect(section.classList.contains('chat-navigation-open')).toBe(true);
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(section.classList.contains('chat-navigation-open')).toBe(false);
    expect(document.activeElement).toBe(toggle);
    toggle.click();
    fixture.detectChanges();
    toggle.click();
    fixture.detectChanges();
    expect(section.classList.contains('chat-navigation-open')).toBe(false);
  });
});
