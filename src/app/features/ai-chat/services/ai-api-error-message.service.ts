import {
  HttpErrorResponse,
} from '@angular/common/http';

import {
  Injectable,
} from '@angular/core';


@Injectable({
  providedIn: 'root',
})
export class AiApiErrorMessageService {
  getMessage(
    error: unknown,
    fallback: string,
    includeFileError = false,
  ): string {
    if (
      !(error instanceof HttpErrorResponse)
    ) {
      return fallback;
    }

    const body: unknown =
      error.error;

    if (
      !body ||
      typeof body !== 'object'
    ) {
      return fallback;
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const detail =
      payload['detail'];

    if (
      typeof detail === 'string' &&
      detail.trim()
    ) {
      return detail;
    }

    if (includeFileError) {
      const files =
        payload['files'];

      if (
        Array.isArray(files) &&
        typeof files[0] ===
          'string' &&
        files[0].trim()
      ) {
        return files[0];
      }
    }

    return fallback;
  }
}
