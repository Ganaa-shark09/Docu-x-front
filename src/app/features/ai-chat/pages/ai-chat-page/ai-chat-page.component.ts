import { WorkflowService } from '../../../workflows/services/workflow.service';
import { HRPolicyService } from '../../../workflows/services/hr-policy.service';
import { HRCategory, HRContext } from '../../../workflows/models/hr-policy.model';
import { ChatSidebarDirective } from '../../components/chat-sidebar/chat-sidebar.directive';
import { HttpErrorResponse } from '@angular/common/http';
import { DocumentGovernanceService } from '../../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../../core/realtime/document-realtime.service';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize, forkJoin, timeout } from 'rxjs';

import {
  AiChatRequest,
  AiChatResponse,
  AiConversation,
  AiConversationMessage,
  InternalAiDocument,
  InternalAiDocumentLibraryResponse,
  LocalChatMessage,
} from '../../models/ai-chat.model';
import { AiChatService } from '../../services/ai-chat.service';
import { ChatInputComponent } from '../../components/chat-input/chat-input.component';
import { ChatMessageListComponent } from '../../components/chat-message-list/chat-message-list.component';
import { ConversationListComponent } from '../../components/conversation-list/conversation-list.component';

@Component({
  selector: 'app-ai-chat-page',
  standalone: true,
  imports: [
    ChatSidebarDirective,
    ChatInputComponent,
    ChatMessageListComponent,
    ConversationListComponent,
    FormsModule,
    NgClass,
    NgFor,
    NgIf,
  ],
  templateUrl: './ai-chat-page.component.html',
  styleUrls: ['./ai-chat-page.component.scss', '../../components/chat-sidebar/chat-sidebar.scss'],
})
export class AiChatPageComponent implements OnInit, OnDestroy {
  private readonly aiChatService = inject(AiChatService);
  private readonly hrApi = inject(HRPolicyService);
  private readonly hrWorkflow = inject(WorkflowService);
  hrDepartments: { id: number; name: string }[] = [];
  private hrDepartmentSubscription?: Subscription;
  private loadHRDepartments(): void {
    this.hrDepartmentSubscription?.unsubscribe();
    const generation = this.conversationLoadRequestId;
    this.hrDepartmentSubscription = forkJoin({
      profile: this.hrWorkflow.profile(),
      memberships: this.governance.memberships(),
    })
      .pipe(timeout(15000))
      .subscribe({
        next: (result) => {
          if (generation !== this.conversationLoadRequestId) return;
          const seen = new Set<number>();
          const admin = !!result.profile.is_superuser || ['company_admin', 'platform_admin'].includes(result.profile.role);
          this.hrDepartments = result.memberships
            .filter((m) => {
              if (
                !m.is_active ||
                seen.has(m.department) ||
                (!admin && m.user !== result.profile.id)
              )
                return false;
              seen.add(m.department);
              return true;
            })
            .map((m) => ({ id: m.department, name: m.department_name }));
          this.cdr.markForCheck();
        },
        error: (error) => {
          if (generation !== this.conversationLoadRequestId) return;
          this.hrDepartments = [];
          this.errorMessage = this.hrApi.message(error);
          this.cdr.markForCheck();
        },
      });
  }
  hrMode = false;
  hrContext: HRContext = {};
  hrCategories: HRCategory[] = [];
  hrCategoryNext = false;
  hrCategoryPage = 1;
  private hrCategorySubscription?: Subscription;
  private hrRevocationSubscription?: Subscription;
  private hrSendSubscription?: Subscription;
  private hrRetry: { signature: string; key: string } | null = null;
  setHRMode(enabled: boolean): void {
    if (this.isSending || this.isLoadingConversation) return;
    this.hrMode = enabled;
    this.startNewChat();
    this.hrContext = {};
    this.hrRetry = null;
    this.documentsPanelOpen = false;
    if (enabled) this.loadHRCategories(1);
  }
  loadHRCategories(page: number): void {
    if (page === 1) this.loadHRDepartments();
    this.hrCategorySubscription?.unsubscribe();
    const generation = this.conversationLoadRequestId;
    this.hrCategorySubscription = this.hrApi.categories(page).subscribe({
      next: (result) => {
        if (generation !== this.conversationLoadRequestId) return;
        this.hrCategories = page === 1 ? result.results : [...this.hrCategories, ...result.results];
        this.hrCategoryPage = page;
        this.hrCategoryNext = !!result.next;
        this.cdr.markForCheck();
      },
      error: (error) => {
        if (generation !== this.conversationLoadRequestId) return;
        this.hrCategories = [];
        this.errorMessage = this.hrApi.message(error);
        this.cdr.markForCheck();
      },
    });
  }
  hrChoices(kind: 'policy' | 'employee' | 'location'): HRCategory[] {
    return this.hrCategories.filter((c) => c.is_active && c.kind === kind);
  }
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly apiBaseUrl = this.resolveApiBaseUrl();

  @ViewChild(ChatMessageListComponent) private messageList?: ChatMessageListComponent;
  @ViewChild(ChatInputComponent) private chatInput?: ChatInputComponent;
  private conversationRequest?: Subscription;
  private conversationListRequest?: Subscription;
  private documentLibraryRequest?: Subscription;
  private initialLoadTimer?: number;
  private accessTimer?: ReturnType<typeof setInterval>;
  private readonly verifyHRAccess = () => {
    if (
      this.hrMode &&
      !this.isSending &&
      !this.isLoadingConversation &&
      this.activeInternalConversationUuid
    )
      this.selectConversation(this.activeInternalConversationUuid, false);
  };

  internalConversations: AiConversation[] = [];
  internalMessages: LocalChatMessage[] = [];

  activeInternalConversationUuid: string | null = null;

  isLoadingConversations = false;
  isLoadingConversation = false;
  isSending = false;
  isSwitchingToExternal = false;

  errorMessage = '';
  documentSelectionError = '';

  documentsPanelOpen = false;
  isLoadingAiDocuments = false;
  aiDocuments: InternalAiDocument[] = [];
  selectedDocuments: InternalAiDocument[] = [];

  activeDocumentMenuUuid: string | null = null;
  previewPanelOpen = false;
  previewDocument: InternalAiDocument | null = null;
  previewObjectUrl: string | null = null;
  previewSafeUrl: SafeResourceUrl | null = null;
  previewType: 'pdf' | 'image' | 'unsupported' = 'unsupported';
  isPreviewLoading = false;
  previewError = '';

  documentSearchTerm = '';
  documentPage = 1;
  documentPageSize = 10;
  documentCount = 0;
  documentNext: string | null = null;
  documentPrevious: string | null = null;
  documentOrdering = '-updated_at';

  private readonly governance = inject(DocumentGovernanceService);
  private readonly realtime = inject(DocumentRealtimeService);
  private governanceSubscription?: Subscription;
  private revocationSubscription?: Subscription;
  private conversationLoadRequestId = 0;
  private previewRequest?: Subscription;
  private routeSubscription?: Subscription;

  ngOnInit(): void {
    window.addEventListener('focus', this.verifyHRAccess);
    this.accessTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.verifyHRAccess();
    }, 60000);
    this.hrRevocationSubscription = this.hrApi.revoked$.subscribe(() =>
      this.refreshProtectedContext('*', false),
    );
    this.hrMode = this.route.snapshot?.queryParamMap?.get('domain') === 'hr_policy';
    if (this.hrMode) {
      const version = this.route.snapshot?.queryParamMap?.get('version');
      if (
        version &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version)
      )
        this.hrContext.version_uuids = [version];
      this.loadHRCategories(1);
    }
    this.governanceSubscription = this.governance.changes$.subscribe((uuid) =>
      this.refreshProtectedContext(uuid),
    );
    this.revocationSubscription = this.realtime.revoked$.subscribe((uuid) =>
      this.refreshProtectedContext(uuid),
    );
    document.body.classList.add('ai-chat-no-page-scroll');

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const uuid = params.get('conversationUuid');

      if (uuid && uuid !== this.activeInternalConversationUuid) {
        this.selectConversation(uuid, false);
      }
    });

    this.initialLoadTimer = window.setTimeout(() => {
      this.loadConversations();
      if (!this.hrMode) this.loadAiDocumentLibrary();
    }, 180);
  }

  ngOnDestroy(): void {
    clearTimeout(this.initialLoadTimer);
    clearInterval(this.accessTimer);
    window.removeEventListener('focus', this.verifyHRAccess);
    this.conversationRequest?.unsubscribe();
    this.conversationListRequest?.unsubscribe();
    this.documentLibraryRequest?.unsubscribe();
    this.hrDepartmentSubscription?.unsubscribe();
    this.hrDepartments = [];
    this.hrCategorySubscription?.unsubscribe();
    this.hrSendSubscription?.unsubscribe();
    this.hrRevocationSubscription?.unsubscribe();
    this.conversationLoadRequestId++;
    this.hrContext = {};
    this.hrCategories = [];
    this.hrRetry = null;
    document.body.classList.remove('ai-chat-no-page-scroll');
    this.closeDocumentPreview();
    this.routeSubscription?.unsubscribe();
    this.governanceSubscription?.unsubscribe();
    this.revocationSubscription?.unsubscribe();
  }

  get documentScope(): 'all' | 'selected' {
    return this.selectedDocuments.length > 0 ? 'selected' : 'all';
  }

  get selectedDocumentUuids(): string[] {
    return this.selectedDocuments.map((document) => document.uuid);
  }

  get selectedDocumentCountLabel(): string {
    if (!this.selectedDocuments.length) {
      return 'All accessible documents';
    }

    if (this.selectedDocuments.length === 1) {
      return '1 selected document';
    }

    return `${this.selectedDocuments.length} selected documents`;
  }

  openExternalAi(): void {
    this.isSwitchingToExternal = true;
    this.cdr.markForCheck();

    this.initialLoadTimer = window.setTimeout(() => {
      this.router.navigate(['/ai/external']);
    }, 180);
  }

  exitChat(): void {
    this.router.navigate(['/dashboard']);
  }

  startNewChat(): void {
    this.hrContext = {};
    this.conversationRequest?.unsubscribe();
    this.chatInput?.form.reset({ message: '' });
    this.hrSendSubscription?.unsubscribe();
    this.hrRetry = null;
    this.isSending = false;
    this.conversationLoadRequestId += 1;
    this.activeInternalConversationUuid = null;
    this.internalMessages = [];
    this.errorMessage = '';
    this.documentSelectionError = '';
    this.isLoadingConversation = false;
    if (this.hrMode)
      this.router.navigate(['/ai/internal'], { queryParams: { domain: 'hr_policy' } });
    else this.router.navigate(['/ai/internal']);
    this.cdr.markForCheck();
  }

  loadConversations(): void {
    this.conversationListRequest?.unsubscribe();
    const generation = this.conversationLoadRequestId;
    this.isLoadingConversations = true;
    this.cdr.markForCheck();

    this.conversationListRequest = this.aiChatService.listConversations('internal').subscribe({
      next: (conversations: AiConversation[]) => {
        this.ngZone.run(() => {
          if (generation !== this.conversationLoadRequestId) return;
          this.internalConversations = conversations;
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          this.internalConversations = [];
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  refreshProtectedContext(uuid: string, reload = true): void {
    this.conversationRequest?.unsubscribe();
    this.conversationListRequest?.unsubscribe();
    this.documentLibraryRequest?.unsubscribe();
    this.chatInput?.form.reset({ message: '' });
    this.hrSendSubscription?.unsubscribe();
    this.hrDepartmentSubscription?.unsubscribe();
    this.hrDepartments = [];
    this.hrCategorySubscription?.unsubscribe();
    this.hrContext = {};
    this.hrCategories = [];
    this.hrRetry = null;
    this.internalConversations = [];
    this.closeDocumentPreview();
    this.internalMessages = [];
    this.isSending = false;
    this.selectedDocuments = this.selectedDocuments.filter(
      (doc) => uuid !== '*' && doc.uuid !== uuid,
    );
    this.aiDocuments = this.aiDocuments.filter((doc) => uuid !== '*' && doc.uuid !== uuid);
    if (!this.hrMode && reload) this.loadAiDocumentLibrary();
    if (reload && this.activeInternalConversationUuid)
      this.selectConversation(this.activeInternalConversationUuid, false);
    else this.conversationLoadRequestId++;
    this.cdr.markForCheck();
  }
  selectConversation(uuid: string, updateUrl = true): void {
    this.conversationRequest?.unsubscribe();
    this.hrSendSubscription?.unsubscribe();
    this.isSending = false;
    const requestId = ++this.conversationLoadRequestId;

    if (updateUrl) {
      this.router.navigate(['/ai/internal', uuid]);
    }

    this.activeInternalConversationUuid = uuid;
    this.internalMessages = [];
    this.isLoadingConversation = true;
    this.errorMessage = '';
    this.documentSelectionError = '';
    this.cdr.markForCheck();

    this.conversationRequest = this.aiChatService.getConversation(uuid).subscribe({
      next: (conversation: AiConversation) => {
        this.ngZone.run(() => {
          if (requestId !== this.conversationLoadRequestId) {
            return;
          }

          const rawConversation = conversation as AiConversation & {
            messages?: AiConversationMessage[];
          };

          this.internalMessages = (rawConversation.messages || [])
            .filter((message: AiConversationMessage) => {
              return message.role === 'user' || message.role === 'assistant';
            })
            .map((message: AiConversationMessage) => this.mapConversationMessage(message));

          const savedPolicy = (rawConversation.messages || [])
            .slice()
            .reverse()
            .find(
              (message) =>
                message.metadata?.domain === 'hr_policy' &&
                !message.metadata.protected_context_omitted,
            );
          const policyHistory = (rawConversation.messages || []).some(
            (message) => message.metadata?.domain === 'hr_policy',
          );
          const redacted = (rawConversation.messages || []).some(
            (message) => message.metadata?.protected_context_omitted,
          );
          this.hrMode = !!savedPolicy || policyHistory || (this.hrMode && redacted);
          this.hrContext = structuredClone(savedPolicy?.metadata?.policy_context || {});
          if (this.hrMode) this.loadHRCategories(1);
          this.isLoadingConversation = false;
          this.cdr.detectChanges();
          this.scrollMessagesToBottom();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          if (requestId !== this.conversationLoadRequestId) {
            return;
          }

          this.internalMessages = [];
          this.isLoadingConversation = false;
          this.errorMessage = 'Unable to load this internal conversation.';
          this.cdr.detectChanges();
        });
      },
    });
  }

  toggleDocumentsPanel(): void {
    this.documentsPanelOpen = !this.documentsPanelOpen;

    if (this.documentsPanelOpen && !this.aiDocuments.length) {
      this.loadAiDocumentLibrary();
    }

    this.cdr.markForCheck();
  }

  loadAiDocumentLibrary(page = this.documentPage): void {
    this.documentLibraryRequest?.unsubscribe();
    const generation = this.conversationLoadRequestId;
    this.isLoadingAiDocuments = true;
    this.documentSelectionError = '';

    let params = new HttpParams()
      .set('page', String(page))
      .set('page_size', String(this.documentPageSize))
      .set('ordering', this.documentOrdering);

    const search = this.documentSearchTerm.trim();

    if (search) {
      params = params.set('search', search);
    }

    this.documentLibraryRequest = this.http
      .get<InternalAiDocumentLibraryResponse>(this.apiUrl('/documents/ai-library/'), {
        params,
      })
      .pipe(
        finalize(() => {
          this.isLoadingAiDocuments = false;
          this.cdr.detectChanges();
        }),
      )
      .subscribe({
        next: (response) => {
          if (generation !== this.conversationLoadRequestId) return;
          this.documentPage = page;
          this.documentCount = response.count || 0;
          this.documentNext = response.next;
          this.documentPrevious = response.previous;
          this.aiDocuments = response.results || [];
          this.realtime.subscribeDocuments(this.aiDocuments.map((doc) => doc.uuid));
          this.syncSelectedDocumentsWithLatestLibrary();
        },
        error: (error) => {
          if (generation !== this.conversationLoadRequestId) return;
          this.aiDocuments = [];
          this.documentSelectionError =
            error?.error?.detail || 'Unable to load Internal AI document library.';
        },
      });
  }

  searchDocuments(): void {
    this.documentPage = 1;
    this.loadAiDocumentLibrary(1);
  }

  handleDocumentSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.searchDocuments();
    }
  }

  resetDocumentSearch(): void {
    this.documentSearchTerm = '';
    this.documentPage = 1;
    this.loadAiDocumentLibrary(1);
  }

  loadNextDocumentPage(): void {
    if (!this.documentNext) {
      return;
    }

    this.loadAiDocumentLibrary(this.documentPage + 1);
  }

  loadPreviousDocumentPage(): void {
    if (!this.documentPrevious || this.documentPage <= 1) {
      return;
    }

    this.loadAiDocumentLibrary(this.documentPage - 1);
  }

  toggleDocumentSelection(document: InternalAiDocument): void {
    const exists = this.selectedDocuments.some((item) => item.uuid === document.uuid);

    if (exists) {
      this.selectedDocuments = this.selectedDocuments.filter((item) => item.uuid !== document.uuid);
    } else {
      this.selectedDocuments = [...this.selectedDocuments, document];
    }

    this.documentSelectionError = '';
    this.cdr.markForCheck();
  }

  clearSelectedDocuments(): void {
    this.selectedDocuments = [];
    this.documentSelectionError = '';
    this.cdr.markForCheck();
  }

  isDocumentSelected(document: InternalAiDocument): boolean {
    return this.selectedDocuments.some((item) => item.uuid === document.uuid);
  }

  toggleDocumentActions(document: InternalAiDocument, event?: MouseEvent): void {
    event?.stopPropagation();

    this.activeDocumentMenuUuid =
      this.activeDocumentMenuUuid === document.uuid ? null : document.uuid;

    this.cdr.markForCheck();
  }

  closeDocumentActions(): void {
    this.activeDocumentMenuUuid = null;
    this.cdr.markForCheck();
  }

  openDocumentPreview(document: InternalAiDocument): void {
    this.closeDocumentActions();
    this.closeDocumentPreview(false);

    this.previewDocument = document;
    this.previewPanelOpen = true;
    this.previewType = this.getPreviewType(document);
    this.previewError = '';

    if (this.previewType === 'unsupported') {
      this.isPreviewLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.isPreviewLoading = true;
    this.cdr.markForCheck();

    this.previewRequest = this.http
      .get(this.apiUrl(`/documents/${document.uuid}/preview/`), {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          const mimeType =
            document.mime_type ||
            blob.type ||
            this.getMimeTypeFromExtension(document.file_extension) ||
            'application/octet-stream';

          const typedBlob = new Blob([blob], { type: mimeType });
          const objectUrl = window.URL.createObjectURL(typedBlob);

          this.previewObjectUrl = objectUrl;
          this.previewSafeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
          this.isPreviewLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.previewError = error?.error?.detail || 'Unable to preview this document.';
          this.isPreviewLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  closeDocumentPreview(resetPanel = true): void {
    this.previewRequest?.unsubscribe();
    this.previewRequest = undefined;
    if (this.previewObjectUrl) {
      window.URL.revokeObjectURL(this.previewObjectUrl);
    }

    this.previewObjectUrl = null;
    this.previewSafeUrl = null;
    this.previewError = '';
    this.isPreviewLoading = false;

    if (resetPanel) {
      this.previewPanelOpen = false;
      this.previewDocument = null;
      this.previewType = 'unsupported';
    }
  }

  private getPreviewType(document: InternalAiDocument): 'pdf' | 'image' | 'unsupported' {
    const extension = (document.file_extension || '').toLowerCase();
    const mimeType = (document.mime_type || '').toLowerCase();

    if (extension === '.pdf' || mimeType.includes('pdf')) {
      return 'pdf';
    }

    if (
      mimeType.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.tif'].includes(extension)
    ) {
      return 'image';
    }

    return 'unsupported';
  }

  private getMimeTypeFromExtension(extension: string | null | undefined): string {
    switch ((extension || '').toLowerCase()) {
      case '.pdf':
        return 'application/pdf';
      case '.png':
        return 'image/png';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.webp':
        return 'image/webp';
      case '.gif':
        return 'image/gif';
      case '.bmp':
        return 'image/bmp';
      case '.tiff':
      case '.tif':
        return 'image/tiff';
      default:
        return 'application/octet-stream';
    }
  }

  downloadDocument(document: InternalAiDocument): void {
    this.closeDocumentActions();
    const generation = this.conversationLoadRequestId;
    this.http
      .get(this.apiUrl(`/documents/${document.uuid}/download/`), {
        responseType: 'blob',
        observe: 'response',
      })
      .subscribe({
        next: (response) => {
          if (generation !== this.conversationLoadRequestId) return;
          const blob = response.body;

          if (!blob) {
            this.documentSelectionError = 'Download failed. Empty response received.';
            this.cdr.markForCheck();
            return;
          }

          const url = window.URL.createObjectURL(blob);
          const anchor = window.document.createElement('a');

          anchor.href = url;
          anchor.download =
            document.original_filename || document.title || `document-${document.uuid}`;

          window.document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();

          window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        },
        error: (error) => {
          this.documentSelectionError =
            error?.error?.detail || 'You do not have permission to download this document.';
          this.cdr.markForCheck();
        },
      });
  }

  sendMessage(message: string): void {
    const cleanMessage = message.trim();

    if (!cleanMessage || this.isSending) {
      return;
    }

    this.errorMessage = '';
    this.documentSelectionError = '';

    const userMessage: LocalChatMessage = {
      role: 'user',
      content: cleanMessage,
      created_at: new Date().toISOString(),
    };

    this.internalMessages = [...this.internalMessages, userMessage];
    this.isSending = true;
    this.cdr.markForCheck();
    this.scrollMessagesToBottom();

    const documentUuids = this.selectedDocumentUuids;

    const payload: AiChatRequest = {
      message: cleanMessage,
      top_k: documentUuids.length > 1 ? 10 : 5,
      document_scope: documentUuids.length > 0 ? 'selected' : 'all',
      document_uuids: documentUuids,
      ...(this.activeInternalConversationUuid
        ? { conversation_uuid: this.activeInternalConversationUuid }
        : {}),
    };

    if (this.hrMode) {
      const signature = JSON.stringify({
        message: cleanMessage,
        context: this.hrContext,
        conversation: this.activeInternalConversationUuid,
      });
      if (this.hrRetry?.signature !== signature)
        this.hrRetry = { signature, key: crypto.randomUUID() };
      payload.domain = 'hr_policy';
      payload.policy_context = structuredClone(this.hrContext);
      payload.idempotency_key = this.hrRetry!.key;
      delete payload.document_scope;
      delete payload.document_uuids;
    }
    const policyRequest = this.hrMode;
    const generation = this.conversationLoadRequestId;
    this.hrSendSubscription = this.aiChatService.sendInternalChatMessage(payload).subscribe({
      next: (response: AiChatResponse) => {
        if (generation !== this.conversationLoadRequestId) return;
        this.ngZone.run(() => {
          if (response.conversation_uuid) {
            this.activeInternalConversationUuid = response.conversation_uuid;
            this.router.navigate(['/ai/internal', response.conversation_uuid], {
              replaceUrl: true,
            });
          }

          const assistantMessage: LocalChatMessage = {
            role: 'assistant',
            content: response.answer || '',
            created_at: new Date().toISOString(),
            sources: policyRequest ? [] : response.sources || [],
            policy: policyRequest ? response.policy : undefined,
            document_context: response.document_context,
            model_provider: response.model_provider,
            model_name: response.model_name,
            usage: response.usage,
            firewall: response.firewall,
            external_context: response.external_context,
          };

          if (policyRequest && !response.policy) {
            this.isSending = false;
            this.errorMessage =
              'Policy evidence is unavailable. No general answer has been substituted.';
            this.cdr.markForCheck();
            return;
          }
          this.hrRetry = null;
          this.appendAssistantMessageWithFastTyping(assistantMessage);
          this.loadConversations();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          if (generation !== this.conversationLoadRequestId) return;
          this.isSending = false;
          if (policyRequest) {
            if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
              this.refreshProtectedContext('*', false);
            if (error instanceof HttpErrorResponse && error.status === 409) this.hrRetry = null;
            this.errorMessage = this.hrApi.message(error);
            this.cdr.detectChanges();
            return;
          }
          const apiError = this.getInternalAiError(error);

          if (apiError.code === 'selected_documents_unavailable') {
            this.refreshProtectedContext('*');
            this.documentSelectionError =
              apiError.detail || 'One or more selected documents are unavailable for Internal AI.';
          } else {
            if (error instanceof HttpErrorResponse && [401, 403, 404].includes(error.status))
              this.refreshProtectedContext('*');
            this.errorMessage = apiError.detail || 'Unable to send internal AI message.';
          }

          this.cdr.detectChanges();
        });
      },
    });
  }

  private getInternalAiError(error: unknown): {
    code?: string;
    detail?: string;
  } {
    let body: unknown = error;

    /*
     * Angular HttpErrorResponse and unit-test mocks
     * both expose the backend payload through
     * an `error` property.
     *
     * Use structural narrowing instead of instanceof
     * so both runtime errors and typed test doubles
     * behave identically.
     */
    if (error !== null && typeof error === 'object' && 'error' in error) {
      body = (error as Record<string, unknown>)['error'];
    }

    if (body === null || typeof body !== 'object') {
      return {};
    }

    const payload = body as Record<string, unknown>;

    const code = payload['code'];

    const detail = payload['detail'];

    return {
      code: typeof code === 'string' ? code : undefined,

      detail: typeof detail === 'string' ? detail : undefined,
    };
  }

  private appendAssistantMessageWithFastTyping(message: LocalChatMessage): void {
    const fullContent = message.content || '';

    if (!fullContent) {
      this.internalMessages = [...this.internalMessages, message];
      this.isSending = false;
      this.cdr.detectChanges();
      this.scrollMessagesToBottom();
      return;
    }

    const messageIndex = this.internalMessages.length;

    const typingMessage: LocalChatMessage = {
      ...message,
      content: '',
    };

    this.internalMessages = [...this.internalMessages, typingMessage];
    this.isSending = false;
    this.cdr.detectChanges();
    this.scrollMessagesToBottom();

    const plan = this.getTypingPlan(fullContent.length);
    let cursor = 0;

    const generation = this.conversationLoadRequestId;
    const tick = (): void => {
      if (generation !== this.conversationLoadRequestId) return;
      cursor = Math.min(cursor + plan.chunkSize, fullContent.length);

      this.internalMessages = this.internalMessages.map((item: LocalChatMessage, index: number) => {
        if (index !== messageIndex) {
          return item;
        }

        return {
          ...item,
          content: fullContent.slice(0, cursor),
        };
      });

      this.cdr.detectChanges();
      this.scrollMessagesToBottom();

      if (cursor < fullContent.length) {
        window.setTimeout(tick, plan.delayMs);
      }
    };

    tick();
  }

  private getTypingPlan(length: number): { chunkSize: number; delayMs: number } {
    if (length <= 180) {
      return { chunkSize: 18, delayMs: 10 };
    }

    if (length <= 800) {
      return { chunkSize: 45, delayMs: 8 };
    }

    if (length <= 2400) {
      return { chunkSize: 100, delayMs: 5 };
    }

    return { chunkSize: 180, delayMs: 3 };
  }

  private scrollMessagesToBottom(): void {
    window.setTimeout(() => this.messageList?.scrollToBottom(), 0);
  }

  private mapConversationMessage(message: AiConversationMessage): LocalChatMessage {
    if (message.metadata?.protected_context_omitted)
      return {
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
        created_at: message.created_at,
        sources: [],
      };
    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',

      content: message.content || '',

      created_at: message.created_at,

      policy: message.metadata?.domain === 'hr_policy' ? message.metadata.hr_policy : undefined,
      sources:
        message.metadata?.domain === 'hr_policy'
          ? []
          : message.retrieved_sources || message.sources || [],

      document_context:
        message.document_context ||
        message.metadata?.document_context ||
        message.metadata?.internal_document_context,

      model_provider: message.model_provider,

      model_name: message.model_name,

      usage: {
        prompt_tokens: message.prompt_tokens || 0,

        completion_tokens: message.completion_tokens || 0,

        total_tokens: message.total_tokens || 0,
      },

      firewall: message.firewall,

      external_context: message.metadata?.external_context || message.external_context,
    };
  }

  private syncSelectedDocumentsWithLatestLibrary(): void {
    if (!this.selectedDocuments.length || !this.aiDocuments.length) {
      return;
    }

    const latestByUuid = new Map(this.aiDocuments.map((document) => [document.uuid, document]));

    this.selectedDocuments = this.selectedDocuments.map((selected) => {
      return latestByUuid.get(selected.uuid) || selected;
    });
  }

  private apiUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.apiBaseUrl}${cleanPath}`;
  }

  private resolveApiBaseUrl(): string {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin.replace(/\/$/, '')
        : '';

    if (origin.includes('localhost:4200') || origin.includes('127.0.0.1:4200')) {
      return 'http://localhost:8000/api';
    }

    return `${origin}/api`;
  }

  formatFileSize(size: number | null | undefined): string {
    if (!size) {
      return '';
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  formatLabel(value: string | null | undefined): string {
    if (!value) {
      return '-';
    }

    return value
      .replaceAll('_', ' ')
      .replaceAll('-', ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
}
