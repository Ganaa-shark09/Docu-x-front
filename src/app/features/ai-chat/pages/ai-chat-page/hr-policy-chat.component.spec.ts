import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { AiChatService } from '../../services/ai-chat.service';
import { AiChatPageComponent } from './ai-chat-page.component';
import { AiChatResponse, AiConversationMessage } from '../../models/ai-chat.model';
import { HRPolicyService } from '../../../workflows/services/hr-policy.service';
import { WorkflowService } from '../../../workflows/services/workflow.service';
import { DocumentGovernanceService } from '../../../documents/services/document-governance.service';
import { hrId, hrProof } from '../../../workflows/hr-test.fixtures';
describe('HR mode in existing Internal AI', () => {
  let fixture: ComponentFixture<AiChatPageComponent>,
    c: AiChatPageComponent,
    http: HttpTestingController;
  const send = vi.fn(),
    getConversation = vi.fn(),
    navigate = vi.fn(() => Promise.resolve(true));
  const policy = {
    status: 'abstained' as const,
    reason: 'insufficient_evidence',
    as_of: '2026-10-11',
    mode: 'current' as const,
    grounding: 'none' as const,
    policy_versions: [],
    warnings: ['Employee balances are unavailable.'],
    evidence: [],
  };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [AiChatPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WorkflowService, useValue: { profile: () => of({ id: 1, role: 'member' }) } },
        {
          provide: DocumentGovernanceService,
          useValue: { memberships: () => of([]), changes$: new Subject<string>() },
        },
        {
          provide: AiChatService,
          useValue: {
            sendInternalChatMessage: send,
            getConversation,
            listConversations: () => of([]),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).overrideComponent(AiChatPageComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(AiChatPageComponent);
    c = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    c.hrMode = true;
    send.mockReturnValue(of({ conversation_uuid: hrId, answer: '', policy }));
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  it('sends the actual HR domain and policy context without general document scope', () => {
    c.hrContext = { as_of: '2025-01-01', employee_category: 'permanent', location: 'india' };
    c.sendMessage('Which leave policy applied?');
    const payload = send.mock.calls[0][0];
    expect(payload.domain).toBe('hr_policy');
    expect(payload.policy_context).toEqual(c.hrContext);
    expect(payload.idempotency_key).toBeTruthy();
    expect(payload.document_scope).toBeUndefined();
    expect(payload.document_uuids).toBeUndefined();
  });
  it('preserves existing Internal AI conversation UUID on follow-up', () => {
    c.activeInternalConversationUuid = hrId;
    c.sendMessage('Explain the date.');
    expect(send.mock.calls[0][0].conversation_uuid).toBe(hrId);
  });
  it('does not silently substitute a generic answer without HR metadata', () => {
    send.mockReturnValue(of({ conversation_uuid: hrId, answer: 'Invented policy answer' }));
    c.sendMessage('Policy?');
    expect(c.internalMessages.some((m) => m.content === 'Invented policy answer')).toBe(false);
    expect(c.errorMessage).toContain('No general answer');
  });
  it('preserves abstention and personal-balance warnings', () => {
    c.sendMessage('What is my leave balance?');
    expect(c.internalMessages.find((m) => m.role === 'assistant')?.policy).toEqual(policy);
  });
  it('uses only backend evidence with a grounded answer', () => {
    const proof = { ...hrProof, policy_title: 'Leave', version: 2, effective_from: '2026-10-01' };
    send.mockReturnValue(
      of({
        conversation_uuid: hrId,
        answer: '',
        policy: {
          ...policy,
          status: 'answered',
          grounding: 'verified_source_quotations',
          evidence: [proof],
        },
      }),
    );
    c.sendMessage('What is annual leave?');
    expect(c.internalMessages.find((m) => m.role === 'assistant')?.policy?.evidence).toEqual([
      proof,
    ]);
  });
  it('reuses an idempotency key after transient transport failure', () => {
    send.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    c.sendMessage('Policy?');
    c.sendMessage('Policy?');
    expect(send.mock.calls[0][0].idempotency_key).toBe(send.mock.calls[1][0].idempotency_key);
  });
  it('blocks duplicate send while pending', () => {
    send.mockReturnValue(new Subject<AiChatResponse>());
    c.sendMessage('Policy?');
    c.sendMessage('Policy?');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('ignores a late response after changing conversation', () => {
    const response = new Subject<AiChatResponse>();
    send.mockReturnValue(response);
    c.sendMessage('Policy?');
    c.startNewChat();
    response.next({ conversation_uuid: hrId, answer: 'SECRET', policy });
    expect(c.internalMessages).toEqual([]);
    expect(c.activeInternalConversationUuid).toBeNull();
  });
  it.each([403, 404])('handles status %s without protected error details', (status) => {
    send.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status, error: { detail: 'SECRET' } })),
    );
    c.sendMessage('Policy?');
    http.expectNone((r) => r.url.endsWith('/documents/ai-library/'));
    expect(c.internalMessages).toEqual([]);
    expect(c.errorMessage).not.toContain('SECRET');
  });
  it('restores HR metadata from server conversation history', () => {
    getConversation.mockReturnValue(
      of({
        uuid: hrId,
        messages: [
          {
            role: 'assistant',
            content: 'Policy explanation',
            created_at: '2026-10-11',
            metadata: {
              domain: 'hr_policy',
              hr_policy: policy,
              policy_context: { as_of: '2025-01-01' },
            },
          },
        ],
      }),
    );
    c.selectConversation(hrId, false);
    http
      .expectOne((r) => r.url.endsWith('/hr-policy-categories/'))
      .flush({ count: 0, next: null, previous: null, results: [] });
    expect(c.hrMode).toBe(true);
    expect(c.hrContext.as_of).toBe('2025-01-01');
    expect(c.internalMessages[0].policy).toEqual(policy);
  });
  it('does not restore protected metadata from a redacted message', () => {
    getConversation.mockReturnValue(
      of({
        uuid: hrId,
        messages: [
          {
            role: 'assistant',
            content: 'Access changed',
            created_at: '2026-10-11',
            retrieved_sources: [{ preview: 'SECRET' }],
            metadata: { domain: 'hr_policy', hr_policy: policy, protected_context_omitted: true },
          },
        ],
      }),
    );
    c.selectConversation(hrId, false);
    http
      .expectOne((r) => r.url.endsWith('/hr-policy-categories/'))
      .flush({ count: 0, next: null, previous: null, results: [] });
    expect(c.hrMode).toBe(true);
    expect(c.internalMessages[0].policy).toBeUndefined();
    expect(c.internalMessages[0].sources).toEqual([]);
  });
  it('does not send HR content or policy context when navigating to External AI', () => {
    vi.useFakeTimers();
    c.hrContext = { category: 'leave' };
    c.internalMessages = [
      { role: 'assistant', content: 'SECRET', created_at: '2026-10-11', policy },
    ];
    c.openExternalAi();
    vi.advanceTimersByTime(200);
    expect(navigate).toHaveBeenCalledWith(['/ai/external']);
    expect(send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('keeps generic Internal AI contract unchanged', () => {
    c.hrMode = false;
    send.mockReturnValue(of({ conversation_uuid: hrId, answer: '' }));
    c.sendMessage('Documents?');
    expect(send.mock.calls[0][0].domain).toBeUndefined();
    expect(send.mock.calls[0][0].document_scope).toBe('all');
  });

  it('does not repeatedly reload a denied HR resource', () => {
    c.ngOnInit();
    c.hrMode = true;
    c.activeInternalConversationUuid = hrId;
    c.internalMessages = [
      { role: 'assistant', content: 'SECRET', created_at: '2026-10-11', policy },
    ];
    const api = TestBed.inject(HRPolicyService);
    api.message(new HttpErrorResponse({ status: 403, error: { detail: 'SECRET' } }));
    expect(c.internalMessages).toEqual([]);
    expect(c.hrMode).toBe(true);
    expect(getConversation).not.toHaveBeenCalled();
    http.expectNone(
      (r) => r.url.includes('/hr-policy-categories/') || r.url.includes('/documents/ai-library/'),
    );
  });
  it('keeps a redacted HR conversation in HR mode even when the redaction omits domain metadata', () => {
    getConversation.mockReturnValue(
      of({
        uuid: hrId,
        messages: [
          {
            role: 'assistant',
            content: 'Access changed',
            created_at: '2026-10-11',
            metadata: { protected_context_omitted: true },
          },
        ],
      }),
    );
    c.selectConversation(hrId, false);
    http
      .expectOne((r) => r.url.endsWith('/hr-policy-categories/'))
      .flush({ count: 0, next: null, previous: null, results: [] });
    expect(c.hrMode).toBe(true);
    expect(c.hrContext).toEqual({});
    c.sendMessage('What policy applies now?');
    expect(send.mock.calls[0][0].domain).toBe('hr_policy');
  });
});
