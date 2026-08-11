import {
  NgFor,
  NgIf,
  NgSwitch,
  NgSwitchCase,
  NgSwitchDefault,
} from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

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
  isAiFabHovered = false;

  private aiFabCycleHandle: number | null = null;
  private readonly aiFabCycleMs = 3600;

  ngOnInit(): void {
    this.startAiFabCycle();
  }

  ngOnDestroy(): void {
    this.stopAiFabCycle();
  }

  startAiFabCycle(): void {
    this.stopAiFabCycle();

    this.aiFabCycleHandle = window.setInterval(() => {
      if (this.isAiFabHovered) {
        return;
      }

      this.activeFloatingAiVisualIndex =
        (this.activeFloatingAiVisualIndex + 1) % this.floatingAiVisuals.length;
    }, this.aiFabCycleMs);
  }

  stopAiFabCycle(): void {
    if (this.aiFabCycleHandle !== null) {
      window.clearInterval(this.aiFabCycleHandle);
      this.aiFabCycleHandle = null;
    }
  }

  handleAiFabMouseEnter(): void {
    this.isAiFabHovered = true;
  }

  handleAiFabMouseLeave(): void {
    this.isAiFabHovered = false;
  }

  trackFloatingAiVisual(index: number): number {
    return index;
  }

  openAiChat(): void {
    this.router.navigate(['/ai/internal']);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
