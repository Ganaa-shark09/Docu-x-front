import { TestBed } from '@angular/core/testing';

import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { Subject, of } from 'rxjs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentRealtimeService } from '../../../../core/realtime/document-realtime.service';

import { DocumentProcessingEvent } from '../../../../core/realtime/realtime.models';

import { AiChatService } from '../../services/ai-chat.service';

import { ExternalAiChatPageComponent } from './external-ai-chat-page.component';

describe('ExternalAiChatPageComponent critical flow', () => {
  let component: ExternalAiChatPageComponent;

  let events: Subject<DocumentProcessingEvent>;

  const router = {
    navigate: vi.fn(() => Promise.resolve(true)),
  };

  const aiChatService = {
    listConversations: vi.fn(() => of([])),

    getConversation: vi.fn(),

    getExternalDocuments: vi.fn(() => of([])),

    bulkUploadExternalDocuments: vi.fn(),

    sendExternalChatMessage: vi.fn(),

    deleteExternalDocument: vi.fn(() => of(undefined)),
  };

  const realtimeService = {
    revoked$: new Subject<string>().asObservable(),
    events$: undefined as any,

    subscribeDocuments: vi.fn(),

    isConnected: true,
  };

  beforeEach(async () => {
    vi.useFakeTimers();

    vi.clearAllMocks();

    events = new Subject<DocumentProcessingEvent>();

    realtimeService.events$ = events.asObservable();

    await TestBed.configureTestingModule({
      imports: [ExternalAiChatPageComponent],

      providers: [
        {
          provide: AiChatService,

          useValue: aiChatService,
        },

        {
          provide: DocumentRealtimeService,

          useValue: realtimeService,
        },

        {
          provide: ActivatedRoute,

          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },

        {
          provide: Router,

          useValue: router,
        },
      ],
    })
      .overrideComponent(ExternalAiChatPageComponent, {
        set: {
          template: '',
          imports: [],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ExternalAiChatPageComponent);

    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();

    vi.useRealTimers();
  });

  it('keeps query text attached to the same user message after upload', () => {
    component.selectedExternalDocumentUuids.add('selected-1');

    component.externalAttachedDocuments = [
      {
        uuid: 'selected-1',

        title: 'Existing document',

        status: 'ready',

        is_ai_ready: true,
      },
    ];

    (component as any).pendingFiles = [
      {
        id: 'local-upload-1',

        file: new File(['hello'], 'new-file.txt', {
          type: 'text/plain',
        }),

        name: 'new-file.txt',

        size: 5,

        extension: 'txt',
      },
    ];

    aiChatService.bulkUploadExternalDocuments.mockReturnValue(
      of({
        conversation_uuid: 'conversation-new',

        uploaded_count: 1,

        documents: [
          {
            uuid: 'uploaded-1',

            title: 'new-file.txt',

            original_filename: 'new-file.txt',

            status: 'ready',

            is_ai_ready: true,
          },
        ],
      }),
    );

    aiChatService.sendExternalChatMessage.mockReturnValue(
      of({
        conversation_uuid: 'conversation-new',

        answer: '',
      }),
    );

    component.messageText = 'Explain this file';

    component.sendCurrentMessage();

    const userMessage = component.externalMessages.find((message) => message.role === 'user');

    expect(userMessage?.content).toBe('Explain this file');

    expect(userMessage?.attachments?.[0]?.uuid).toBe('uploaded-1');

    expect(aiChatService.sendExternalChatMessage).toHaveBeenCalledTimes(1);

    const payload = aiChatService.sendExternalChatMessage.mock.calls[0][0] as any;

    expect(payload.message).toBe('Explain this file');

    expect(payload.document_uuids).toEqual(['selected-1', 'uploaded-1']);

    expect(payload.document_scope_mode).toBe('selected');
  });

  it('freezes selected + uploaded scope while an uploaded file is processing', () => {
    component.selectedExternalDocumentUuids.add('selected-before-send');

    component.externalAttachedDocuments = [
      {
        uuid: 'selected-before-send',

        title: 'Selected',

        status: 'ready',

        is_ai_ready: true,
      },
    ];

    (component as any).pendingFiles = [
      {
        id: 'local-processing',

        file: new File(['processing'], 'processing.txt', {
          type: 'text/plain',
        }),

        name: 'processing.txt',

        size: 10,

        extension: 'txt',
      },
    ];

    aiChatService.bulkUploadExternalDocuments.mockReturnValue(
      of({
        conversation_uuid: 'conversation-processing',

        uploaded_count: 1,

        documents: [
          {
            uuid: 'uploaded-processing',

            title: 'processing.txt',

            status: 'processing',

            is_ai_ready: false,
          },
        ],
      }),
    );

    aiChatService.sendExternalChatMessage.mockReturnValue(
      of({
        conversation_uuid: 'conversation-processing',

        answer: '',
      }),
    );

    component.messageText = 'Use both files';

    component.sendCurrentMessage();

    expect(aiChatService.sendExternalChatMessage).not.toHaveBeenCalled();

    /*
     * User changes sidebar selection while
     * uploaded file is still processing.
     */
    component.selectedExternalDocumentUuids.clear();

    component.selectedExternalDocumentUuids.add('changed-after-send');

    events.next({
      event: 'document.processing.updated',

      document_uuid: 'uploaded-processing',

      status: 'ready',

      stage: 'ready',

      progress: 100,

      is_ai_ready: true,

      is_indexed: true,
    });

    expect(aiChatService.sendExternalChatMessage).toHaveBeenCalledTimes(1);

    const payload = aiChatService.sendExternalChatMessage.mock.calls[0][0] as any;

    expect(payload.document_uuids).toEqual(['selected-before-send', 'uploaded-processing']);

    expect(payload.document_uuids).not.toContain('changed-after-send');

    expect(payload.document_scope_mode).toBe('selected');
  });

  it('preserves document scope across backend attachments_processing recovery', () => {
    component.selectedExternalDocumentUuids.add('processing-doc');

    component.externalAttachedDocuments = [
      {
        uuid: 'processing-doc',

        title: 'Processing document',

        status: 'processing',

        is_ai_ready: false,
      },
    ];

    aiChatService.sendExternalChatMessage
      .mockReturnValueOnce(
        of({
          status: 'attachments_processing',

          detail: 'Still processing',

          retry_after_ms: 3000,

          pending_document_uuids: ['processing-doc'],
        }),
      )
      .mockReturnValueOnce(
        of({
          conversation_uuid: 'conversation-1',

          answer: '',
        }),
      );

    component.messageText = 'Summarize the document';

    component.sendCurrentMessage();

    expect(aiChatService.sendExternalChatMessage).toHaveBeenCalledTimes(1);

    const firstPayload = aiChatService.sendExternalChatMessage.mock.calls[0][0] as any;

    component.selectedExternalDocumentUuids.clear();

    component.selectedExternalDocumentUuids.add('different-doc');

    events.next({
      event: 'document.processing.updated',

      document_uuid: 'processing-doc',

      status: 'ready',

      stage: 'ready',

      progress: 100,

      is_ai_ready: true,
    });

    expect(aiChatService.sendExternalChatMessage).toHaveBeenCalledTimes(2);

    const retryPayload = aiChatService.sendExternalChatMessage.mock.calls[1][0] as any;

    expect(retryPayload.document_uuids).toEqual(firstPayload.document_uuids);

    expect(retryPayload.document_scope_mode).toBe(firstPayload.document_scope_mode);

    expect(retryPayload.document_uuids).not.toContain('different-doc');
  });
});
