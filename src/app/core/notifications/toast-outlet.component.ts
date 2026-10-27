import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-outlet',
  standalone: true,
  template: `
    <div class="toast-stack" aria-label="Action alerts">
      @for (toast of toasts.messages(); track toast.id) {
        <div class="toast" [class.toast--success]="toast.kind === 'success'"
          [class.toast--error]="toast.kind === 'error'"
          [class.toast--warning]="toast.kind === 'warning'"
          [class.toast--exiting]="toast.exiting"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="toast__icon" aria-hidden="true">{{ toast.kind === 'success' ? '✓' : toast.kind === 'error' ? '!' : toast.kind === 'warning' ? '!' : '↗' }}</span>
          <span class="toast__body"><strong>{{ toast.kind === 'success' ? 'Action completed' : toast.kind === 'error' ? 'Action not completed' : toast.kind === 'warning' ? 'Needs attention' : 'Workspace update' }}</strong><span class="toast__message">{{ toast.message }}</span></span>
          <button type="button" class="toast__close" [attr.aria-label]="'Dismiss: ' + toast.message"
            (click)="toasts.dismiss(toast.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack { position: fixed; z-index: 10000; top: max(1rem, env(safe-area-inset-top)); right: max(1rem, env(safe-area-inset-right)); display: grid; gap: .65rem; width: min(390px, calc(100vw - 2rem)); pointer-events: none; }
    .toast { --toast-accent: var(--app-info-text); position: relative; display: flex; align-items: center; gap: .85rem; min-height: 64px; overflow: hidden; padding: .9rem 1rem; border: 1px solid var(--app-border-strong); border-left: 3px solid var(--toast-accent); border-radius: 12px; background: color-mix(in srgb, var(--app-surface) 91%, transparent); color: var(--app-text); box-shadow: var(--app-shadow-floating); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); pointer-events: auto; animation: toast-enter .32s cubic-bezier(.2,.8,.2,1) both; }
    .toast::after { content: ''; position: absolute; inset: auto 0 0; height: 2px; background: var(--toast-accent); opacity: .55; transform-origin: left; animation: toast-progress 2.5s linear both; }
    .toast--success { --toast-accent: var(--app-success-text); border-color: var(--app-success-border); border-left-color: var(--toast-accent); }
    .toast--error { --toast-accent: var(--app-danger-text); border-color: var(--app-danger-border); border-left-color: var(--toast-accent); }
    .toast--warning { --toast-accent: var(--app-warning-text); border-color: var(--app-warning-border); border-left-color: var(--toast-accent); }
    .toast--exiting { animation: toast-exit .35s ease-in both; }
    .toast--exiting::after { animation-play-state: paused; }
    .toast__icon { display: grid; place-items: center; flex: 0 0 30px; width: 30px; height: 30px; border-radius: 10px; background: var(--app-info-bg); color: var(--app-info-text); font-weight: 800; font-size: 1rem; }
    .toast--success .toast__icon { background: var(--app-success-bg); color: var(--app-success-text); }
    .toast--error .toast__icon { background: var(--app-danger-bg); color: var(--app-danger-text); }
    .toast--warning .toast__icon { background: var(--app-warning-bg); color: var(--app-warning-text); }
    .toast__body { display:grid;gap:4px;flex:1;min-width:0; }
    .toast__body strong {color:var(--app-text);font-size:11px;font-weight:750;letter-spacing:-.01em}
    .toast__message { min-width: 0; overflow-wrap: anywhere; color:var(--app-text-muted);font-weight: 500; font-size: 11px; line-height: 1.5; }
    .toast__close { flex: 0 0 28px; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--app-radius-sm); background: transparent; color: var(--app-text-muted); cursor: pointer; font: inherit; font-size: 1.2rem; line-height: 1; }
    .toast__close:hover { background: var(--app-hover); color: var(--app-text); }
    @keyframes toast-enter { from { opacity: 0; transform: translate(18px,-8px) scale(.96); filter: blur(3px); } to { opacity: 1; transform: translate(0,0) scale(1); filter: blur(0); } }
    @keyframes toast-exit { from { opacity: 1; transform: translateX(0) scale(1); } to { opacity: 0; transform: translateX(24px) scale(.98); } }
    @keyframes toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    .toast__close:focus-visible { outline:2px solid var(--app-focus); outline-offset:2px; }
    @media (prefers-reduced-motion: reduce) { .toast, .toast--exiting, .toast::after { animation: none; } .toast--exiting { opacity: 0; } }
  `],
})
export class ToastOutletComponent {
  readonly toasts = inject(ToastService);
}
