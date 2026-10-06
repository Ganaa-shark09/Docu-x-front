import {
  provideHttpClient,
} from '@angular/common/http';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';

import {
  TestBed,
} from '@angular/core/testing';

import {
  firstValueFrom,
} from 'rxjs';

import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  environment,
} from '../../../../environments/environment';

import {
  DocumentsService,
} from './documents.service';


describe('DocumentsService', () => {
  let service:
    DocumentsService;

  let httpMock:
    HttpTestingController;


  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service =
      TestBed.inject(
        DocumentsService,
      );

    httpMock =
      TestBed.inject(
        HttpTestingController,
      );
  });


  it('loads internal documents with internal scope and filters', async () => {
    const promise =
      firstValueFrom(
        service.getDocuments(
          'internal',
          {
            search: 'invoice',
            status: 'ready',
            empty: null,
          },
        ),
      );


    const request =
      httpMock.expectOne(
        (candidate) =>
          candidate.url ===
            `${environment.apiBaseUrl}/documents/`
          &&
          candidate.params.get(
            'scope',
          ) === 'internal'
          &&
          candidate.params.get(
            'search',
          ) === 'invoice'
          &&
          candidate.params.get(
            'status',
          ) === 'ready'
          &&
          !candidate.params.has(
            'empty',
          ),
      );


    expect(
      request.request.method,
    ).toBe('GET');


    request.flush({
      results: [
        {
          uuid: 'doc-1',
        },
      ],
    });


    expect(
      await promise,
    ).toEqual([
      {
        uuid: 'doc-1',
      },
    ]);

    httpMock.verify();
  });


  it('loads external documents from the external AI endpoint', async () => {
    const promise =
      firstValueFrom(
        service.getDocuments(
          'external',
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/ai/external-documents/`,
      );


    expect(
      request.request.method,
    ).toBe('GET');


    request.flush({
      documents: [
        {
          uuid: 'external-1',
        },
      ],
    });


    expect(
      await promise,
    ).toEqual([
      {
        uuid: 'external-1',
      },
    ]);

    httpMock.verify();
  });


  it('uploads the original FormData without converting the file payload', async () => {
    const formData =
      new FormData();

    const file =
      new File(
        ['hello'],
        'hello.txt',
        {
          type: 'text/plain',
        },
      );

    formData.append(
      'file',
      file,
    );


    const promise =
      firstValueFrom(
        service.uploadInternalDocument(
          formData,
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/documents/`,
      );


    expect(
      request.request.method,
    ).toBe('POST');

    expect(
      request.request.body,
    ).toBe(
      formData,
    );

    /*
     * Angular/browser must generate the multipart boundary.
     * Application code should not manually force Content-Type.
     */
    expect(
      request.request.headers.has(
        'Content-Type',
      ),
    ).toBe(false);


    request.flush({
      uuid: 'uploaded-1',
      status: 'uploaded',
    });


    expect(
      await promise,
    ).toEqual({
      uuid: 'uploaded-1',
      status: 'uploaded',
    });

    httpMock.verify();
  });


  it('normalizes processing-job paginated responses', async () => {
    const promise =
      firstValueFrom(
        service.getProcessingJobs(
          'doc-1',
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/documents/doc-1/processing-jobs/`,
      );


    request.flush({
      results: [
        {
          uuid: 'job-1',
        },
      ],
    });


    expect(
      await promise,
    ).toEqual([
      {
        uuid: 'job-1',
      },
    ]);

    httpMock.verify();
  });


  it('posts to retry-processing for a failed document', async () => {
    const promise =
      firstValueFrom(
        service.retryProcessing(
          'doc-failed',
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}/documents/doc-failed/retry-processing/`,
      );


    expect(
      request.request.method,
    ).toBe('POST');

    expect(
      request.request.body,
    ).toEqual({});


    request.flush({
      status: 'queued',
    });


    expect(
      await promise,
    ).toEqual({
      status: 'queued',
    });

    httpMock.verify();
  });


  it('returns an empty list for an unknown list response shape', async () => {
    const promise =
      firstValueFrom(
        service.getDocuments(
          'internal',
        ),
      );


    const request =
      httpMock.expectOne(
        (candidate) =>
          candidate.url ===
          `${environment.apiBaseUrl}/documents/`,
      );


    request.flush({
      unexpected:
        'value',
    });


    expect(
      await promise,
    ).toEqual([]);

    httpMock.verify();
  });
});
