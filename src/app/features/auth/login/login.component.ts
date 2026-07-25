import { NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [NgIf, ReactiveFormsModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div class="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div class="mb-8">
          <div class="mb-2 text-2xl font-bold text-slate-950">DocuX AI</div>
          <p class="text-sm text-slate-500">
            Sign in to your secure document intelligence workspace.
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-5">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">
              Username or Email
            </label>
            <input
              type="text"
              formControlName="identifier"
              autocomplete="username"
              class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="admin"
            />
            <p
              *ngIf="form.controls.identifier.touched && form.controls.identifier.invalid"
              class="mt-1 text-xs text-red-600"
            >
              Username or email is required.
            </p>
          </div>

          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              formControlName="password"
              autocomplete="current-password"
              class="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="••••••••"
            />
            <p
              *ngIf="form.controls.password.touched && form.controls.password.invalid"
              class="mt-1 text-xs text-red-600"
            >
              Password is required.
            </p>
          </div>

          <div
            *ngIf="errorMessage"
            class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {{ errorMessage }}
          </div>

          <button
            type="submit"
            [disabled]="form.invalid || isLoading"
            class="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {{ isLoading ? 'Signing in...' : 'Sign in' }}
          </button>
        </form>

        <div class="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          Backend expected URL:
          <span class="font-mono text-slate-700">/api/auth/login/</span>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isLoading = false;
  errorMessage = '';

  readonly form = this.fb.nonNullable.group({
    identifier: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.isLoading) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const identifier = this.form.controls.identifier.value.trim();
    const password = this.form.controls.password.value;

    this.authService
      .login({
        username: identifier,
        email_or_username: identifier,
        password,
      })
      .pipe(
        finalize(() => {
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/dashboard';
          this.router.navigateByUrl(returnUrl);
        },
        error: (error) => {
          this.errorMessage =
            error?.error?.detail ||
            error?.error?.non_field_errors?.[0] ||
            'Login failed. Please check your credentials.';
        },
      });
  }
}
