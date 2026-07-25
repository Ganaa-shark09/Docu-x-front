import { AsyncPipe, NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../auth/auth.service';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [AsyncPipe, NgFor, NgIf, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="min-h-screen bg-slate-50 text-slate-900">
      <aside class="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <div class="mb-8">
          <div class="text-xl font-bold tracking-tight text-slate-950">DocuX AI</div>
          <div class="text-sm text-slate-500">Private Document Intelligence</div>
        </div>

        <nav class="space-y-1">
          <a
            *ngFor="let item of navItems"
            [routerLink]="item.path"
            routerLinkActive="bg-slate-900 text-white"
            class="block rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {{ item.label }}
          </a>
        </nav>
      </aside>

      <div class="lg:pl-64">
        <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-lg font-semibold text-slate-950">DocuX Workspace</h1>
              <p class="text-sm text-slate-500">
                Secure AI document processing and review
              </p>
            </div>

            <div class="flex items-center gap-4">
              <div class="text-right text-sm" *ngIf="authService.currentUser$ | async as user">
                <div class="font-medium text-slate-900">{{ user.username }}</div>
                <div class="text-slate-500">{{ user.role || 'user' }}</div>
              </div>

              <button
                type="button"
                (click)="logout()"
                class="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        <main class="p-6">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class MainLayoutComponent {
  readonly authService = inject(AuthService);

  private readonly router = inject(Router);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Documents', path: '/documents' },
    { label: 'AI Chat', path: '/ai-chat' },
    { label: 'Approvals', path: '/approvals' },
    { label: 'Workflows', path: '/workflows' },
    { label: 'Notifications', path: '/notifications' },
  ];

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
