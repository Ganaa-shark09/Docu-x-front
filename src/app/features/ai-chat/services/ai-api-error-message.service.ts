import { HttpErrorResponse } from '@angular/common/http';

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AiApiErrorMessageService {
  getPolicyMessage(error: unknown): string {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    const messages: Record<number, string> = {
      401: 'Your session has ended. Sign in again.',
      403: 'You no longer have permission to access or modify this policy.',
      404: 'The policy or source is unavailable.',
      409: 'This policy changed while you were working. Refresh and review the current state before submitting again.',
      400: 'Check policy dates, applicability, source access and review requirements.',
      422: 'Check policy dates, applicability, source access and review requirements.',
    };
    return (
      messages[status] ||
      'Unable to complete the policy request. Refresh to check access and try again.'
    );
  }
  getMessage(error: unknown, fallback: string, includeFileError = false): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    if (error.status >= 500 || error.status === 0) return fallback;

    const statusMessage: Record<number, string> = {
      401: 'Your session has ended. Please sign in again.',
      403: 'This action is not permitted. Document or field permissions may have changed.',
      404: 'This resource is unavailable or you no longer have access.',
      422: 'This command is not valid in the current workflow state.',
      409: 'The state changed. Reload before trying again.',
    };
    fallback = statusMessage[error.status] || fallback;
    const body: unknown = error.error;

    if (!body || typeof body !== 'object') {
      return fallback;
    }

    const payload = body as Record<string, unknown>;

    const detail = payload['detail'];

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (includeFileError) {
      const files = payload['files'];

      if (Array.isArray(files) && typeof files[0] === 'string' && files[0].trim()) {
        return files[0];
      }
    }

    if (error.status === 400) {
      for (const [field, value] of Object.entries(payload)) {
        if ((field === 'files' || field === 'file') && !includeFileError) continue;
        if (Array.isArray(value) && typeof value[0] === 'string')
          return `${field.replaceAll('_', ' ')}: ${value[0]}`;
      }
    }
    return fallback;
  }
}
