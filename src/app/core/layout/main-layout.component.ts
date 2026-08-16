import {
  NgFor,
  NgIf,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault,
} from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { AuthService } from '../auth/auth.service';

interface NavItem {
  label: string;
  path: string;
  icon: 'dashboard' | 'documents' | 'approvals' | 'workflows' | 'notifications';
}

type FloatingAiVisual =
  | { kind: 'image'; value: string; alt: string }
  | { kind: 'emoji'; value: string; alt: string };

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    NgFor,
    NgIf,
    NgSwitch,
    NgSwitchCase,
    NgSwitchDefault,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);

  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'dashboard' },
    { label: 'Documents', path: '/documents/internal', icon: 'documents' },
    { label: 'Approvals', path: '/approvals', icon: 'approvals' },
    { label: 'Workflows', path: '/workflows', icon: 'workflows' },
    { label: 'Notifications', path: '/notifications', icon: 'notifications' },
  ];

  floatingAiVisuals: FloatingAiVisual[] = [
    {
      kind: 'image',
      value: 'assets/branding/docux-ai-signature-icon.png',
      alt: 'DocuX AI signature',
    },
    {
      kind: 'emoji',
      value: '✦',
      alt: 'AI assistant',
    },
    {
      kind: 'emoji',
      value: '🌍',
      alt: 'Global AI',
    },
  ];

  activeFloatingAiVisualIndex = 0;
  isAiIntroVisible = false;
  isLaunchingAi = false;

  private aiFabCycleHandle: number | null = null;
  private routerEventsSubscription?: Subscription;

  private readonly aiFabCycleMs = 5000;
  private readonly introStorageKey = 'docux_ai_intro_seen_v3';

  ngOnInit(): void {
    this.startAiFabCycle();
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

    window.setTimeout(() => {
      this.router.navigate(['/ai/internal']);
    }, 80);

    window.setTimeout(() => {
      document.body.classList.remove('docux-ai-route-opening');
      this.isLaunchingAi = false;
    }, 1400);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
