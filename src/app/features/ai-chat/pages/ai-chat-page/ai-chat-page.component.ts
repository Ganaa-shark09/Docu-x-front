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
import { Subscription, finalize } from 'rxjs';

import {
  AiChatRequest,
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
    ChatInputComponent,
    ChatMessageListComponent,
    ConversationListComponent,
    FormsModule,
    NgClass,
    NgFor,
    NgIf,
  ],
  templateUrl: './ai-chat-page.component.html',
  styleUrl: './ai-chat-page.component.scss',
})
export class AiChatPageComponent implements OnInit, OnDestroy {
  private readonly aiChatService = inject(AiChatService);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly apiBaseUrl = this.resolveApiBaseUrl();

  @ViewChild(ChatMessageListComponent) private messageList?: ChatMessageListComponent;

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

  private conversationLoadRequestId = 0;
  private routeSubscription?: Subscription;

  ngOnInit(): void {
    document.body.classList.add('ai-chat-no-page-scroll');

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const uuid = params.get('conversationUuid');

      if (uuid && uuid !== this.activeInternalConversationUuid) {
        this.selectConversation(uuid, false);
      }
    });

    window.setTimeout(() => {
      this.loadConversations();
      this.loadAiDocumentLibrary();
    }, 180);
  }

  ngOnDestroy(): void {
    document.body.classList.remove('ai-chat-no-page-scroll');
    this.closeDocumentPreview();
    this.routeSubscription?.unsubscribe();
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

    window.setTimeout(() => {
      this.router.navigate(['/ai/external']);
    }, 180);
  }

  exitChat(): void {
    this.router.navigate(['/dashboard']);
  }

  startNewChat(): void {
    this.conversationLoadRequestId += 1;
    this.activeInternalConversationUuid = null;
    this.internalMessages = [];
    this.errorMessage = '';
    this.documentSelectionError = '';
    this.isLoadingConversation = false;
    this.router.navigate(['/ai/internal']);
    this.cdr.markForCheck();
  }

  loadConversations(): void {
    this.isLoadingConversations = true;
    this.cdr.markForCheck();

    this.aiChatService.listConversations('internal').subscribe({
      next: (conversations: AiConversation[]) => {
        this.ngZone.run(() => {
          this.internalConversations = conversations;
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          console.error('Internal conversations load error:', error);
          this.internalConversations = [];
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  selectConversation(uuid: string, updateUrl = true): void {
    const requestId = ++this.conversationLoadRequestId;

    if (updateUrl) {
      this.router.navigate(['/ai/internal', uuid]);
    }

    this.activeInternalConversationUuid = uuid;
    this.isLoadingConversation = true;
    this.errorMessage = '';
    this.documentSelectionError = '';
    this.cdr.markForCheck();

    this.aiChatService.getConversation(uuid).subscribe({
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

          console.error('Internal conversation load error:', error);
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

    this.http
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
          this.documentPage = page;
          this.documentCount = response.count || 0;
          this.documentNext = response.next;
          this.documentPrevious = response.previous;
          this.aiDocuments = response.results || [];
          this.syncSelectedDocumentsWithLatestLibrary();
        },
        error: (error) => {
          console.error('AI document library load error:', error);
          this.aiDocuments = [];
          this.documentSelectionError =
            error?.error?.detail ||
            'Unable to load Internal AI document library.';
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
      this.selectedDocuments = this.selectedDocuments.filter(
        (item) => item.uuid !== document.uuid,
      );
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

    this.http
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
          this.previewSafeUrl =
            this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
          this.isPreviewLoading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.previewError =
            error?.error?.detail ||
            'Unable to preview this document.';
          this.isPreviewLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  closeDocumentPreview(resetPanel = true): void {
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
    this.http
      .get(this.apiUrl(`/documents/${document.uuid}/download/`), {
        responseType: 'blob',
        observe: 'response',
      })
      .subscribe({
        next: (response) => {
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
            document.original_filename ||
            document.title ||
            `document-${document.uuid}`;

          window.document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();

          window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
        },
        error: (error) => {
          this.documentSelectionError =
            error?.error?.detail ||
            'You do not have permission to download this document.';
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

    this.aiChatService.sendInternalChatMessage(payload).subscribe({
      next: (response: any) => {
        this.ngZone.run(() => {
          if (response.conversation_uuid) {
            this.activeInternalConversationUuid = response.conversation_uuid;
            this.router.navigate(
              ['/ai/internal', response.conversation_uuid],
              { replaceUrl: true },
            );
          }

          const assistantMessage: LocalChatMessage = {
            role: 'assistant',
            content: response.answer || '',
            created_at: new Date().toISOString(),
            sources: response.sources || [],
            document_context: response.document_context,
            model_provider: response.model_provider,
            model_name: response.model_name,
            usage: response.usage,
            firewall: response.firewall,
            external_context: response.external_context,
          };

          this.appendAssistantMessageWithFastTyping(assistantMessage);
          this.loadConversations();
        });
      },
      error: (error: any) => {
        this.ngZone.run(() => {
          console.error('Internal AI chat error:', error);

          this.isSending = false;

          if (error?.error?.code === 'selected_documents_unavailable') {
            this.documentSelectionError =
              error?.error?.detail ||
              'One or more selected documents are unavailable for Internal AI.';
          } else {
            this.errorMessage =
              error?.error?.detail ||
              'Unable to send internal AI message.';
          }

          this.cdr.detectChanges();
        });
      },
    });
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

    const tick = (): void => {
      cursor = Math.min(cursor + plan.chunkSize, fullContent.length);

      this.internalMessages = this.internalMessages.map(
        (item: LocalChatMessage, index: number) => {
          if (index !== messageIndex) {
            return item;
          }

          return {
            ...item,
            content: fullContent.slice(0, cursor),
          };
        },
      );

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
    const raw = message as any;

    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content || '',
      created_at: message.created_at,
      sources: raw.retrieved_sources || raw.sources || [],
      document_context:
        raw.document_context ||
        raw.metadata?.document_context ||
        raw.metadata?.internal_document_context,
      model_provider: raw.model_provider,
      model_name: raw.model_name,
      usage: {
        prompt_tokens: raw.prompt_tokens || 0,
        completion_tokens: raw.completion_tokens || 0,
        total_tokens: raw.total_tokens || 0,
      },
      firewall: raw.firewall,
      external_context: raw.metadata?.external_context || raw.external_context,
    };
  }

  private syncSelectedDocumentsWithLatestLibrary(): void {
    if (!this.selectedDocuments.length || !this.aiDocuments.length) {
      return;
    }

    const latestByUuid = new Map(
      this.aiDocuments.map((document) => [document.uuid, document]),
    );

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

    if (
      origin.includes('localhost:4200') ||
      origin.includes('127.0.0.1:4200')
    ) {
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
