import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AiChatPageComponent } from './ai-chat-page.component';
import { AiChatService } from '../../services/ai-chat.service';
import { AiChatResponse } from '../../models/ai-chat.model';
import { DocumentGovernanceService } from '../../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../../core/realtime/document-realtime.service';
describe('Internal AI governance context', () => {
  let component: AiChatPageComponent;
  let http: HttpTestingController;
  let response: Subject<AiChatResponse>;
  const changes = new Subject<string>();
  const revoked = new Subject<string>();
  const service = {
    getConversation: vi.fn(() =>
      of({
        uuid: 'conversation',
        messages: [
          {
            role: 'assistant',
            content: '[Protected document context is no longer available.]',
            created_at: '2026-10-06',
            retrieved_sources: [],
            sources: [{ content_preview: 'secret' }],
            metadata: { protected_context_omitted: true },
          },
        ],
      }),
    ),
    sendInternalChatMessage: vi.fn(),
    listConversations: () => of([]),
  };
  beforeEach(() => {
    vi.clearAllMocks();
    response = new Subject<AiChatResponse>();
    service.sendInternalChatMessage.mockReturnValue(response);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({})),
          },
        },
        { provide: AiChatService, useValue: service },
        { provide: DocumentGovernanceService, useValue: { changes$: changes.asObservable() } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked.asObservable(), subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    component = TestBed.runInInjectionContext(() => new AiChatPageComponent());
  });
  afterEach(() => {
    component.ngOnDestroy();
    http.verify();
  });
  it('shows backend-redacted content without stale source aliases', () => {
    component.selectConversation('conversation', false);
    expect(component.internalMessages[0].content).toContain('no longer available');
    expect(component.internalMessages[0].sources).toEqual([]);
  });
  it('keeps selected internal document scope explicit', () => {
    component.selectedDocuments = [{ uuid: 'internal-doc', title: 'Private document' }];
    component.sendMessage('Question');
    expect(service.sendInternalChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ document_scope: 'selected', document_uuids: ['internal-doc'] }),
    );
    expect(component.documentScope).toBe('selected');
  });
  it('keeps all accessible internal documents as the empty-selection scope', () => {
    component.sendMessage('Question');
    expect(service.sendInternalChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ document_scope: 'all', document_uuids: [] }),
    );
  });
  it('clears cached history and selected revoked documents before reloading', () => {
    component.activeInternalConversationUuid = 'conversation';
    component.internalMessages = [
      { role: 'assistant', content: 'old-secret', created_at: '2026-10-06' },
    ];
    component.selectedDocuments = [{ uuid: 'revoked', title: 'Old document' }];
    component.refreshProtectedContext('revoked');
    http
      .expectOne((req) => req.url.endsWith('/documents/ai-library/'))
      .flush({ count: 0, next: null, previous: null, results: [] });
    expect(component.selectedDocuments).toEqual([]);
    expect(JSON.stringify(component.internalMessages)).not.toContain('old-secret');
    expect(component.internalMessages[0].content).toContain('no longer available');
  });
  it('ignores model responses started before revocation', () => {
    component.sendMessage('Question');
    component.refreshProtectedContext('*');
    http
      .expectOne((req) => req.url.endsWith('/documents/ai-library/'))
      .flush({ count: 0, next: null, previous: null, results: [] });
    response.next({ conversation_uuid: 'old', answer: 'late-secret', sources: [] });
    expect(JSON.stringify(component.internalMessages)).not.toContain('late-secret');
  });
});
