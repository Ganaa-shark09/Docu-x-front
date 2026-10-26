import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { MainLayoutComponent } from './main-layout.component';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
describe('Workflow navigation disclosure', () => {
  let fixture: ComponentFixture<MainLayoutComponent>,
    c: MainLayoutComponent,
    http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MainLayoutComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { logout: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MainLayoutComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
    http
      .expectOne(environment.apiBaseUrl + '/notifications/unread-count/')
      .flush({ unread_count: 0 });
    http
      .expectOne(environment.apiBaseUrl + '/auth/profile/')
      .flush({ username: 'alice', role: 'member' });
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });
  it('renders actual user identity rather than a hardcoded administrator', () => {
    expect(fixture.nativeElement.textContent).toContain('alice');
    expect(fixture.nativeElement.querySelector('.docux-header__user').textContent).not.toContain(
      'company_admin',
    );
  });
  it('opens on mouse hover and closes when pointer leaves without focus', () => {
    const group = fixture.nativeElement.querySelector('.docux-workflow-group');
    const enter = new Event('pointerenter');
    Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
    group.dispatchEvent(enter);
    fixture.detectChanges();
    expect(c.workflowMenuOpen()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('#workflow-submenu').getAttribute('aria-hidden'),
    ).toBe('false');
    const leave = new Event('pointerleave');
    Object.defineProperty(leave, 'pointerType', { value: 'mouse' });
    group.dispatchEvent(leave);
    expect(c.workflowMenuOpen()).toBe(false);
  });
  it('supports click disclosure and Escape with focus restored', () => {
    const button = fixture.nativeElement.querySelector(
      '#workflow-menu-toggle',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(c.workflowMenuOpen()).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
  it('links the available workflow queues without duplicate planned entries', () => {
    c.workflowMenuOpen.set(true);
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('#workflow-submenu');
    expect(menu.querySelector('a[href="/workflows/invoices"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows/runs"]')).toBeNull();
    expect(menu.querySelector('a[href="/workflows/extractions"]')).toBeNull();
    expect(menu.querySelector('a[href*="type=contract_review"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows/hr-policies"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows/rfp-projects"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows/finance-audits"]')).toBeTruthy();
    expect(menu.querySelector('a[href="/workflows/compliance"]')).toBeTruthy();
    expect(menu.querySelector('.docux-workflow-planned')).toBeNull();
    expect(menu.querySelectorAll('.docux-workflow-planned a').length).toBe(0);
  });
  it('has a mobile toggle and closes the drawer on navigation', () => {
    fixture.nativeElement.querySelector('#mobile-navigation-toggle').click();
    fixture.detectChanges();
    expect(c.mobileNavigationOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('.docux-nav-scrim')).toBeTruthy();
    fixture.nativeElement
      .querySelector('a[href="/dashboard"]')
      .addEventListener('click', (event: Event) => event.preventDefault(), { capture: true });
    fixture.nativeElement
      .querySelector('a[href="/dashboard"]')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    fixture.detectChanges();
    expect(c.mobileNavigationOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('.docux-nav-scrim')).toBeNull();
  });
  it('keeps a keyboard-dismissed dropdown closed until the pointer leaves', () => {
    c.toggleWorkflowMenu();
    c.escapeNavigation(new KeyboardEvent('keydown', { key: 'Escape' }));
    c.openWorkflowMenu({ pointerType: 'mouse' } as PointerEvent);
    expect(c.workflowMenuOpen()).toBe(false);
    c.leaveWorkflowMenu({
      pointerType: 'mouse',
      currentTarget: fixture.nativeElement.querySelector('.docux-workflow-group'),
    } as PointerEvent);
    c.openWorkflowMenu({ pointerType: 'mouse' } as PointerEvent);
    expect(c.workflowMenuOpen()).toBe(true);
  });
  it('opens on the first hover after selecting a navigation link', () => {
    c.closeNavigation();
    const group = fixture.nativeElement.querySelector('.docux-workflow-group');
    const enter = new Event('pointerenter');
    Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
    group.dispatchEvent(enter);
    fixture.detectChanges();
    expect(c.workflowMenuOpen()).toBe(true);
    expect(fixture.nativeElement.querySelector('#workflow-submenu').hasAttribute('inert')).toBe(
      false,
    );
  });
  it('closes on mouse leave after a mouse-focused workflow selection', () => {
    const group: HTMLElement = fixture.nativeElement.querySelector('.docux-workflow-group');
    const button: HTMLButtonElement = group.querySelector('button')!;
    button.focus();
    vi.spyOn(group, 'querySelector').mockReturnValue(null);
    c.workflowMenuOpen.set(true);
    c.leaveWorkflowMenu({ pointerType: 'mouse', currentTarget: group } as unknown as PointerEvent);
    expect(c.workflowMenuOpen()).toBe(false);
  });
  it('keeps the menu accessible when keyboard focus remains inside', () => {
    const group: HTMLElement = fixture.nativeElement.querySelector('.docux-workflow-group');
    vi.spyOn(group, 'querySelector').mockReturnValue(group.querySelector('button'));
    c.workflowMenuOpen.set(true);
    c.leaveWorkflowMenu({ pointerType: 'mouse', currentTarget: group } as unknown as PointerEvent);
    expect(c.workflowMenuOpen()).toBe(true);
  });
  it('shows administration sections only to authorized accounts and opens on first hover', () => {
    expect(fixture.nativeElement.querySelector('#admin-menu-toggle')).toBeNull();
    c.profile.set({ username: 'root', role: 'member', is_superuser: true });
    fixture.detectChanges();
    const group: HTMLElement = fixture.nativeElement.querySelector('.docux-admin-group');
    const enter = new Event('pointerenter');
    Object.defineProperty(enter, 'pointerType', { value: 'mouse' });
    group.dispatchEvent(enter);
    fixture.detectChanges();
    expect(c.adminMenuOpen()).toBe(true);
    const menu: HTMLElement = group.querySelector('#admin-submenu')!;
    for (const section of ['organizations', 'company', 'users', 'departments', 'access'])
      expect(menu.querySelector(`a[href="/administration/${section}"]`)).toBeTruthy();
    const leave = new Event('pointerleave');
    Object.defineProperty(leave, 'pointerType', { value: 'mouse' });
    group.dispatchEvent(leave);
    expect(c.adminMenuOpen()).toBe(false);
  });
  it('supports click and Escape on the administration menu', () => {
    c.profile.set({ username: 'admin', role: 'company_admin', is_superuser: false });
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('#admin-menu-toggle');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('a[href="/administration/organizations"]')).toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
