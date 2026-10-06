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
  API_ENDPOINTS,
} from '../../../core/config/api-endpoints';

import {
  environment,
} from '../../../../environments/environment';

import {
  AiChatService,
} from './ai-chat.service';


describe('AiChatService', () => {
  let service:
    AiChatService;

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
        AiChatService,
      );

    httpMock =
      TestBed.inject(
        HttpTestingController,
      );
  });


  it('preserves the complete Internal AI document scope payload', async () => {
    const payload = {
      message:
        'Explain both documents',

      document_scope:
        'selected' as const,

      document_uuids: [
        'doc-1',
        'doc-2',
      ],

      conversation_uuid:
        'conversation-1',

      top_k: 10,
    };


    const promise =
      firstValueFrom(
        service.sendInternalChatMessage(
          payload,
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}${API_ENDPOINTS.ai.chat}`,
      );


    expect(
      request.request.method,
    ).toBe('POST');

    expect(
      request.request.body,
    ).toEqual(
      payload,
    );


    request.flush({
      conversation_uuid:
        'conversation-1',

      answer:
        'Answer',
    });


    await promise;

    httpMock.verify();
  });


  it('preserves external document UUID and scope metadata', async () => {
    const payload = {
      message:
        'Summarize this attachment',

      use_web:
        true,

      top_k:
        8,

      conversation_uuid:
        'external-conversation',

      document_uuids: [
        'external-1',
      ],

      document_scope_mode:
        'selected',
    } as any;


    const promise =
      firstValueFrom(
        service.sendExternalChatMessage(
          payload,
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}${API_ENDPOINTS.ai.externalChat}`,
      );


    expect(
      request.request.method,
    ).toBe('POST');

    expect(
      request.request.body,
    ).toEqual(
      payload,
    );


    request.flush({
      conversation_uuid:
        'external-conversation',

      answer:
        'Summary',
    });


    await promise;

    httpMock.verify();
  });


  it('normalizes conversation list responses', async () => {
    const promise =
      firstValueFrom(
        service.listConversations(
          'external',
        ),
      );


    const request =
      httpMock.expectOne(
        (candidate) =>
          candidate.url ===
            `${environment.apiBaseUrl}${API_ENDPOINTS.ai.conversations}`
          &&
          candidate.params.get(
            'scope',
          ) === 'external',
      );


    request.flush({
      results: [
        {
          uuid:
            'conversation-1',

          title:
            'Conversation',
        },
      ],
    });


    expect(
      await promise,
    ).toEqual([
      {
        uuid:
          'conversation-1',

        title:
          'Conversation',
      },
    ]);

    httpMock.verify();
  });


  it('sends processing-status UUIDs and conversation scope', async () => {
    const promise =
      firstValueFrom(
        service.getExternalDocumentProcessingStatus(
          [
            'doc-1',
            'doc-2',
          ],
          'conversation-1',
        ),
      );


    const request =
      httpMock.expectOne(
        (candidate) =>
          candidate.url ===
            `${environment.apiBaseUrl}${API_ENDPOINTS.ai.externalDocuments}processing-status/`
          &&
          candidate.params.get(
            'document_uuids',
          ) === 'doc-1,doc-2'
          &&
          candidate.params.get(
            'conversation_uuid',
          ) === 'conversation-1',
      );


    expect(
      request.request.method,
    ).toBe('GET');


    request.flush({
      documents: [],
      ready_documents: [],
      processing_documents: [],
      failed_documents: [],
      missing_document_uuids: [],
      all_ready: true,
      has_processing: false,
      has_failed: false,
    });


    await promise;

    httpMock.verify();
  });


  it('uploads external files using the original FormData', async () => {
    const formData =
      new FormData();

    formData.append(
      'files',
      new File(
        ['document'],
        'document.txt',
        {
          type:
            'text/plain',
        },
      ),
    );


    const promise =
      firstValueFrom(
        service.bulkUploadExternalDocuments(
          formData,
        ),
      );


    const request =
      httpMock.expectOne(
        `${environment.apiBaseUrl}${API_ENDPOINTS.ai.externalDocumentsBulkUpload}`,
      );


    expect(
      request.request.method,
    ).toBe('POST');

    expect(
      request.request.body,
    ).toBe(
      formData,
    );

    expect(
      request.request.headers.has(
        'Content-Type',
      ),
    ).toBe(false);


    request.flush({
      conversation_uuid:
        'conversation-1',

      uploaded_count:
        1,

      documents: [],
    });


    await promise;

    httpMock.verify();
  });
});
