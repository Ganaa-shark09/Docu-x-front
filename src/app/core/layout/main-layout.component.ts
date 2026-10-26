import { appearance, setAppearance } from '../theme/theme.service';
import { NotificationBellComponent } from '../notifications/notification-bell.component';
import { NgIf, NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationError,
  NavigationStart,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter, timeout } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { DestroyRef, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../environments/environment';

import { WorkflowBreadcrumbsComponent } from './workflow-breadcrumbs.component';
import { AuthService } from '../auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: 'dashboard' | 'documents' | 'approvals' | 'workflows' | 'notifications';
}

type FloatingAiVisual =
  { kind: 'image'; value: string; alt: string } | { kind: 'emoji'; value: string; alt: string };

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    NgIf,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    WorkflowBreadcrumbsComponent,
    NotificationBellComponent,
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);

  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly destroy = inject(DestroyRef);
  readonly profile = signal<{ username: string; role: string; is_superuser: boolean } | null>(null);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Documents', path: '/documents/internal', icon: 'documents' },
    { label: 'Approvals', path: '/approvals', icon: 'approvals' },
    { label: 'Workflows', path: '/workflows', icon: 'workflows' },
  ];

  floatingAiVisuals: FloatingAiVisual[] = [
    {
      kind: 'emoji',
      value: '✧',
      alt: 'AI assistant',
    },
    {
      kind: 'emoji',
      value: '✦',
      alt: 'AI assistant',
    },
    {
      kind: 'emoji',
      value: '✷',
      alt: 'AI assistant',
    },
    {
      kind: 'emoji',
      value: '✹',
      alt: 'AI assistant',
    },
  ];

  readonly appearance = signal(appearance());
  changeAppearance(value: string) {
    setAppearance(value);
    this.appearance.set(appearance());
  }
  readonly contextTitle = signal('Workspace');
  readonly navigating = signal(false);
  readonly workflowMenuOpen = signal(false);
  readonly adminMenuOpen = signal(false);
  private hoverDismissed = false;
  private adminHoverDismissed = false;
  toggleWorkflowMenu(): void {
    this.workflowMenuOpen.set(!this.workflowMenuOpen());
    this.hoverDismissed = !this.workflowMenuOpen();
    if (this.workflowMenuOpen()) this.adminMenuOpen.set(false);
  }
  readonly mobileNavigationOpen = signal(false);
  workflowActive(): boolean {
    return this.router.url.startsWith('/workflows');
  }
  adminActive(): boolean {
    return this.router.url.startsWith('/administration');
  }
  toggleAdminMenu(): void {
    this.adminMenuOpen.set(!this.adminMenuOpen());
    this.adminHoverDismissed = !this.adminMenuOpen();
    if (this.adminMenuOpen()) this.workflowMenuOpen.set(false);
  }
  openAdminMenu(event: PointerEvent): void {
    if (
      event.pointerType === 'mouse' &&
      window.innerWidth > 640 &&
      !this.adminHoverDismissed &&
      (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true)
    ) {
      this.adminMenuOpen.set(true);
      this.workflowMenuOpen.set(false);
    }
  }
  leaveAdminMenu(event: PointerEvent): void {
    this.adminHoverDismissed = false;
    if (
      event.pointerType === 'mouse' &&
      !(event.currentTarget as HTMLElement).querySelector(':focus-visible')
    ) this.adminMenuOpen.set(false);
  }
  adminFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      this.adminMenuOpen.set(false);
  }
  openWorkflowMenu(event: PointerEvent): void {
    if (
      event.pointerType === 'mouse' &&
      window.innerWidth > 640 &&
      !this.hoverDismissed &&
      (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true)
    ) {
      this.workflowMenuOpen.set(true);
      this.adminMenuOpen.set(false);
    }
  }
  leaveWorkflowMenu(event: PointerEvent): void {
    this.hoverDismissed = false;
    if (
      event.pointerType === 'mouse' &&
      !(event.currentTarget as HTMLElement).querySelector(':focus-visible')
    )
      this.workflowMenuOpen.set(false);
  }
  workflowFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null))
      this.workflowMenuOpen.set(false);
  }
  toggleMobileNavigation(): void {
    this.mobileNavigationOpen.set(!this.mobileNavigationOpen());
    if (this.mobileNavigationOpen())
      requestAnimationFrame(() => {
        if (this.destroy.destroyed || !this.mobileNavigationOpen()) return;
        this.cdr.detectChanges();
        setTimeout(() => {
          if (this.destroy.destroyed || !this.mobileNavigationOpen()) return;
          const sidebar = document.getElementById('main-sidebar');
          if (!sidebar?.contains(document.activeElement))
            sidebar?.querySelector<HTMLAnchorElement>('nav a')?.focus();
        }, 200);
      });
  }
  closeNavigation(): void {
    const wasMobileOpen = this.mobileNavigationOpen();
    this.mobileNavigationOpen.set(false);
    if (wasMobileOpen) document.getElementById('mobile-navigation-toggle')?.focus();
    this.workflowMenuOpen.set(false);
    this.adminMenuOpen.set(false);
    this.hoverDismissed = false;
    this.adminHoverDismissed = false;
  }
  escapeNavigation(event: KeyboardEvent): void {
    if (event.key === 'Tab' && this.mobileNavigationOpen()) {
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>('.docux-sidebar a, .docux-sidebar button'),
      ).filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.workflowMenuOpen()) {
      this.hoverDismissed = true;
      this.workflowMenuOpen.set(false);
      document.getElementById('workflow-menu-toggle')?.focus();
    } else if (this.adminMenuOpen()) {
      this.adminHoverDismissed = true;
      this.adminMenuOpen.set(false);
      document.getElementById('admin-menu-toggle')?.focus();
    } else {
      this.mobileNavigationOpen.set(false);
      document.getElementById('mobile-navigation-toggle')?.focus();
    }
  }
  activeFloatingAiVisualIndex = 0;
  isAiIntroVisible = false;
  isLaunchingAi = false;

  private aiFabCycleHandle: number | null = null;
  private routerEventsSubscription?: Subscription;

  private readonly aiFabCycleMs = 5000;
  private readonly introStorageKey = 'docux_ai_intro_seen_v3';

  ngOnInit(): void {
    this.router.events.pipe(takeUntilDestroyed(this.destroy)).subscribe((event) => {
      if (event instanceof NavigationStart) this.navigating.set(true);
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      )
        this.navigating.set(false);
    });
    this.http
      .get<{ username: string; role: string; is_superuser: boolean }>(environment.apiBaseUrl + '/auth/profile/')
      .pipe(timeout(15000), takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (profile) => this.profile.set(profile),
        error: () => this.profile.set(null),
      });

    const updateTitle = () => {
      const path = this.router.url;
      const labels: [string, string][] = [
        ['/dashboard', 'Overview'],
        ['/administration/organizations', 'Organizations'],
        ['/administration/company', 'Company settings'],
        ['/administration/users', 'Users'],
        ['/administration/departments', 'Departments'],
        ['/administration/access', 'Department access'],
        ['/administration', 'Administration'],
        ['/documents', 'Documents'],
        ['/approvals', 'Approvals'],
        ['/workflows/compliance', 'Compliance'],
        ['/workflows/finance', 'Finance audit'],
        ['/workflows/rfp', 'RFP & proposals'],
        ['/workflows/hr', 'HR policies'],
        ['/workflows/legal', 'Legal intelligence'],
        ['/workflows', 'Workflows'],
      ];
      this.contextTitle.set(labels.find(([prefix]) => path.startsWith(prefix))?.[1] || 'Workspace');
    };
    updateTitle();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroy),
      )
      .subscribe(updateTitle);
    this.registerDashboardIntro();
  }

  ngOnDestroy(): void {
    this.stopAiFabCycle();
    this.routerEventsSubscription?.unsubscribe();
  }

  private registerDashboardIntro(): void {
    this.showIntroWhenDashboardIsReady();

    this.routerEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.showIntroWhenDashboardIsReady();
      });
  }

  private showIntroWhenDashboardIsReady(): void {
    window.setTimeout(() => {
      const alreadySeen = localStorage.getItem(this.introStorageKey) === 'true';
      const isDashboard = this.router.url.startsWith('/dashboard');

      if (!alreadySeen && isDashboard) {
        this.isAiIntroVisible = true;
        this.cdr.detectChanges();
      }
    }, 650);
  }

  startAiFabCycle(): void {
    this.stopAiFabCycle();

    this.ngZone.runOutsideAngular(() => {
      this.aiFabCycleHandle = window.setInterval(() => {
        this.ngZone.run(() => {
          this.activeFloatingAiVisualIndex =
            (this.activeFloatingAiVisualIndex + 1) % this.floatingAiVisuals.length;

          this.cdr.detectChanges();
        });
      }, this.aiFabCycleMs);
    });
  }

  stopAiFabCycle(): void {
    if (this.aiFabCycleHandle !== null) {
      window.clearInterval(this.aiFabCycleHandle);
      this.aiFabCycleHandle = null;
    }
  }

  trackFloatingAiVisual(index: number): number {
    return index;
  }

  closeAiIntro(): void {
    this.isAiIntroVisible = false;
    localStorage.setItem(this.introStorageKey, 'true');
    this.cdr.detectChanges();
  }

  openAiChat(): void {
    if (this.isLaunchingAi) {
      return;
    }

    this.closeAiIntro();
    this.isLaunchingAi = true;
    document.body.classList.add('docux-ai-route-opening');
    this.cdr.detectChanges();

    void this.router.navigate(['/ai/internal']).finally(() => {
      document.body.classList.remove('docux-ai-route-opening');
      this.isLaunchingAi = false;
    });
  }

  focusWorkspace(): void {
    requestAnimationFrame(() => {
      if (this.destroy.destroyed) return;
      const main = document.getElementById('workspace-main');
      main?.focus({ preventScroll: true });
    });
  }

  logout(): void {
    this.authService.logout();
  }
}
