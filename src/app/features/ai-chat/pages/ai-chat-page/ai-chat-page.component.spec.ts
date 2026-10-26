import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { provideHttpClientTesting } from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';

import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';

import { of, throwError } from 'rxjs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AiChatService } from '../../services/ai-chat.service';

import { AiChatPageComponent } from './ai-chat-page.component';

describe('AiChatPageComponent document scope', () => {
  let component: AiChatPageComponent;

  const router = {
    navigate: vi.fn(() => Promise.resolve(true)),
  };

  const aiChatService = {
    listConversations: vi.fn(() => of([])),

    getConversation: vi.fn(),

    sendInternalChatMessage: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [AiChatPageComponent],

      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),

        {
          provide: AiChatService,

          useValue: aiChatService,
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
      .overrideComponent(AiChatPageComponent, {
        set: {
          template: '',
          imports: [],
        },
      })
      .compileComponents();

    component = TestBed.createComponent(AiChatPageComponent).componentInstance;
  });

  it('sends selected document UUIDs with selected scope', () => {
    component.selectedDocuments = [
      {
        uuid: 'internal-1',

        title: 'Document 1',
      },

      {
        uuid: 'internal-2',

        title: 'Document 2',
      },
    ] as any;

    component.activeInternalConversationUuid = 'conversation-internal';

    aiChatService.sendInternalChatMessage.mockReturnValue(
      of({
        conversation_uuid: 'conversation-internal',

        answer: '',
      }),
    );

    component.sendMessage('Compare the documents');

    expect(aiChatService.sendInternalChatMessage).toHaveBeenCalledTimes(1);

    const payload = aiChatService.sendInternalChatMessage.mock.calls[0][0];

    expect(payload).toEqual(
      expect.objectContaining({
        message: 'Compare the documents',

        document_scope: 'selected',

        document_uuids: ['internal-1', 'internal-2'],

        conversation_uuid: 'conversation-internal',

        top_k: 10,
      }),
    );
  });

  it('uses all-document scope when nothing is selected', () => {
    component.selectedDocuments = [];

    aiChatService.sendInternalChatMessage.mockReturnValue(
      of({
        conversation_uuid: 'new-conversation',

        answer: '',
      }),
    );

    component.sendMessage('What documents do we have?');

    const payload = aiChatService.sendInternalChatMessage.mock.calls[0][0];

    expect(payload.document_scope).toBe('all');

    expect(payload.document_uuids).toEqual([]);

    expect(payload.top_k).toBe(5);
  });

  it('shows the selected-document error separately from generic chat errors', () => {
    component.selectedDocuments = [
      {
        uuid: 'unavailable-document',

        title: 'Unavailable',
      },
    ] as any;

    aiChatService.sendInternalChatMessage.mockReturnValue(
      throwError(() => ({
        error: {
          code: 'selected_documents_unavailable',

          detail: 'Selected document is unavailable.',
        },
      })),
    );

    component.sendMessage('Explain it');
    TestBed.inject(HttpTestingController)
      .expectOne((request) => request.url.endsWith('/documents/ai-library/'))
      .flush({ count: 0, next: null, previous: null, results: [] });

    expect(component.documentSelectionError).toBe('Selected document is unavailable.');

    expect(component.errorMessage).toBe('');

    expect(component.isSending).toBe(false);
  });
});
