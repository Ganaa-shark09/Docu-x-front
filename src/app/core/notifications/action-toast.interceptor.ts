import { HttpContextToken, HttpErrorResponse, HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { ToastService } from './toast.service';
import { environment } from '../../../environments/environment';

export const SILENT_ACTION_TOAST = new HttpContextToken<boolean>(() => false);

function actionLabel(url: string, method: string): string | null {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;
  if (!url.startsWith(environment.apiBaseUrl.replace(/\/$/, '') + '/')) return null;
  const path = url.split('?')[0].toLowerCase();
  if (/\/ai\/external-documents\//.test(path)) {
    if (method === 'DELETE') return 'External document removed.';
    return /\/bulk-upload\//.test(path) ? 'Documents uploaded.' : 'External document uploaded.';
  }
  if (/\/ai\/conversations\/[^/]+\/restore\//.test(path)) return 'Conversation restored.';
  if (/\/ai\/conversations\/[^/]+\/$/.test(path) && method === 'DELETE') return 'Conversation deleted.';
  if (/\/notifications\//.test(path)) return 'Notifications updated.';
  // Chat messages, authentication and background reads should never raise action toasts.
  if (/\/(auth|ai|chat)\//.test(path) || /\/(preview|search|query|validate|compare)\//.test(path)) return null;
  if (/\/hr-policies\/resolve\//.test(path)) return null;
  if (/\/documents\//.test(path)) {
    if (method === 'DELETE') return 'Document deleted.';
    if (/\/retry-processing\//.test(path)) return 'Document processing restarted.';
    if (/\/governance\//.test(path)) return 'Document governance updated.';
    if (/\/(field-policies|access-policies)\//.test(path)) return 'Document permissions updated.';
    if (/\/documents\/$/.test(path) && method === 'POST') return 'Document uploaded. Processing has started.';
    return 'Document updated.';
  }
  if (/\/approvals\//.test(path)) {
    if (/\/approve\//.test(path)) return 'Approval completed.';
    if (/\/reject\//.test(path)) return 'Request rejected.';
    if (/\/request-changes\//.test(path)) return 'Changes requested.';
    return 'Approval action completed.';
  }
  if (/\/workflows\//.test(path)) {
    if (/\/runs\/$/.test(path) && method === 'POST') return 'Workflow started.';
    if (/\/hr-policies\/$/.test(path) && method === 'POST') return 'HR policy draft created.';
    if (/\/hr-policies\/[^/]+\/draft\/$/.test(path)) return 'HR policy draft saved.';
    if (/\/correct\//.test(path)) return 'Correction saved.';
    if (/\/rerun\//.test(path)) return 'Extraction rerun started.';
    if (/\/submit-for-approval\//.test(path)) return 'Extraction submitted for approval.';
    if (/\/export\//.test(path)) return 'Export prepared.';
    return 'Workflow action completed.';
  }
  return null;
}

export const actionToastInterceptor: HttpInterceptorFn = (request, next) => {
  const label = request.context.get(SILENT_ACTION_TOAST) ? null : actionLabel(request.url, request.method);
  if (!label) return next(request);
  const toasts = inject(ToastService);
  return next(request).pipe(
    tap((event: HttpEvent<unknown>) => {
      if (event instanceof HttpResponse) toasts.success(label);
    }),
    catchError((error: unknown) => {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      const message = status === 403
        ? 'You do not have permission to complete this action.'
        : status === 409
          ? 'This item changed. Refresh and try again.'
          : status === 400 || status === 422
            ? 'Check the fields and try again.'
            : 'Unable to complete this action.';
      toasts.error(message);
      return throwError(() => error);
    }),
  );
};
