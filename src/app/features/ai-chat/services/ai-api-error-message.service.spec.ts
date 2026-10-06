import {
  HttpErrorResponse,
} from '@angular/common/http';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AiApiErrorMessageService,
} from './ai-api-error-message.service';


describe(
  'AiApiErrorMessageService',
  () => {
    const service =
      new AiApiErrorMessageService();


    function httpError(
      error: unknown,
    ): HttpErrorResponse {
      return new HttpErrorResponse({
        status:
          400,

        error,
      });
    }


    it(
      'returns the fallback for non HTTP errors',
      () => {
        expect(
          service.getMessage(
            new Error(
              'Network failure',
            ),
            'Fallback message',
          ),
        ).toBe(
          'Fallback message',
        );
      },
    );


    it(
      'uses a backend detail message',
      () => {
        expect(
          service.getMessage(
            httpError({
              detail:
                'Document access denied.',
            }),
            'Fallback message',
          ),
        ).toBe(
          'Document access denied.',
        );
      },
    );


    it(
      'uses the first file error when requested',
      () => {
        expect(
          service.getMessage(
            httpError({
              files: [
                'Unsupported file type.',
              ],
            }),
            'Unable to upload files.',
            true,
          ),
        ).toBe(
          'Unsupported file type.',
        );
      },
    );


    it(
      'does not expose file errors when file-error handling is disabled',
      () => {
        expect(
          service.getMessage(
            httpError({
              files: [
                'Private upload error.',
              ],
            }),
            'Unable to send message.',
          ),
        ).toBe(
          'Unable to send message.',
        );
      },
    );
  },
);
