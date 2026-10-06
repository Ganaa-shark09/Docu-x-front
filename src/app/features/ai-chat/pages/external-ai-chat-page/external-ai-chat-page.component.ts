import { NgClass, NgFor, NgIf } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  AiConversation,
  AiConversationMessage,
  ExternalAiChatRequest,
  ExternalAiChatResponse,
  ExternalDocument,
  ExternalDocumentBulkUploadResponse,
  ExternalDocumentReadinessItem,
  LocalChatAttachment,
  LocalChatMessage,
} from '../../models/ai-chat.model';
import { AiChatService } from '../../services/ai-chat.service';
import {
  ExternalDocumentReadinessService,
} from '../../services/external-document-readiness.service';
import {
  ExternalAttachmentStateService,
} from '../../services/external-attachment-state.service';
import {
  ExternalDocumentUploadService,
} from '../../services/external-document-upload.service';
import {
  ExternalUploadOutcomePlannerService,
} from '../../services/external-upload-outcome-planner.service';
import {
  ExternalDocumentScopeService,
} from '../../services/external-document-scope.service';
import {
  ExternalConversationMessageMapperService,
} from '../../services/external-conversation-message-mapper.service';
import {
  AiApiErrorMessageService,
} from '../../services/ai-api-error-message.service';
import {
  ExternalAiChatResponsePlannerService,
} from '../../services/external-ai-chat-response-planner.service';
import {
  ExternalDocumentProcessingCoordinatorService,
} from '../../services/external-document-processing-coordinator.service';
import {
  DocumentProcessingEvent,
} from '../../../../core/realtime/realtime.models';
import { ChatMessageListComponent } from '../../components/chat-message-list/chat-message-list.component';
import { ConversationListComponent } from '../../components/conversation-list/conversation-list.component';

interface PendingExternalFile {
  id: string;
  file: File;
  name: string;
  size: number;
  extension: string;
}

@Component({
  selector: 'app-external-ai-chat-page',
  standalone: true,
  imports: [
    ChatMessageListComponent,
    ConversationListComponent,
    FormsModule,
    NgClass,
    NgFor,
    NgIf,
  ],
  providers: [
    ExternalDocumentProcessingCoordinatorService,
  ],
  templateUrl: './external-ai-chat-page.component.html',
  styleUrl: './external-ai-chat-page.component.scss',
})
export class ExternalAiChatPageComponent implements OnDestroy {
  private readonly aiChatService = inject(AiChatService);
  private readonly externalDocumentReadinessService =
    inject(ExternalDocumentReadinessService);
  private readonly externalAttachmentStateService =
    inject(ExternalAttachmentStateService);
  private readonly externalDocumentUploadService =
    inject(ExternalDocumentUploadService);
  private readonly externalUploadOutcomePlanner =
    inject(ExternalUploadOutcomePlannerService);
  private readonly externalDocumentScopeService =
    inject(ExternalDocumentScopeService);
  private readonly externalConversationMessageMapper =
    inject(ExternalConversationMessageMapperService);
  private readonly aiApiErrorMessageService =
    inject(AiApiErrorMessageService);
  private readonly externalAiChatResponsePlanner =
    inject(ExternalAiChatResponsePlannerService);
  private readonly externalDocumentProcessingCoordinator =
    inject(ExternalDocumentProcessingCoordinatorService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(ChatMessageListComponent) private messageList?: ChatMessageListComponent;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  externalConversations: AiConversation[] = [];
  externalMessages: LocalChatMessage[] = [];
  externalAttachedDocuments: ExternalDocument[] = [];
  pendingFiles: PendingExternalFile[] = [];

  activeExternalConversationUuid: string | null = null;
  selectedExternalDocumentUuids = new Set<string>();

  isLoadingConversations = false;
  isLoadingConversation = false;
  isLoadingDocuments = false;
  isUploading = false;
  isSending = false;
  isDragOver = false;
  documentsPanelOpen = false;
  isSwitchingToInternal = false;

  messageText = '';
  errorMessage = '';

  private conversationLoadRequestId = 0;
  private routeSubscription?: Subscription;
  private readonly allowedExtensions = [
    'pdf',
    'docx',
    'xlsx',
    'txt',
    'csv',
    'png',
    'jpg',
    'jpeg',
    'webp',
    'bmp',
    'tiff',
    'tif',
  ];

  constructor() {
    document.body.classList.add('ai-chat-no-page-scroll');

    this.bindDocumentRealtimeEvents();

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const uuid = params.get('conversationUuid');

      if (uuid && uuid !== this.activeExternalConversationUuid) {
        this.selectExternalConversation(uuid, false);
      }
    });

    window.setTimeout(() => this.loadExternalConversations(), 180);
  }

  ngOnDestroy(): void {
    this.clearPendingRealtimeSend();
    document.body.classList.remove('ai-chat-no-page-scroll');
    this.routeSubscription?.unsubscribe();
    this.stopDocumentPolling();
  }

  @HostListener('window:dragover', ['$event'])
  preventWindowDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('window:drop', ['$event'])
  preventWindowDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  openInternalAi(): void {
    this.isSwitchingToInternal = true;
    this.cdr.markForCheck();

    window.setTimeout(() => {
      this.router.navigate(['/ai/internal']);
    }, 180);
  }

  exitChat(): void {
    document.body.classList.remove('docux-ai-exit-closing');
    document.body.classList.add('docux-ai-route-closing');

    window.setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 80);

    window.setTimeout(() => {
      document.body.classList.remove('docux-ai-route-closing');
    }, 1400);
  }

  startNewChat(): void {
    this.conversationLoadRequestId += 1;
    this.activeExternalConversationUuid = null;
    this.externalMessages = [];
    this.externalAttachedDocuments = [];
    this.pendingFiles = [];
    this.selectedExternalDocumentUuids.clear();
    this.errorMessage = '';
    this.documentsPanelOpen = false;
    this.isLoadingConversation = false;
    this.stopDocumentPolling();
    this.clearPendingRealtimeSend();

    this.router.navigate(['/ai/external']);
    this.cdr.markForCheck();
  }

  toggleDocumentsPanel(): void {
    this.documentsPanelOpen = !this.documentsPanelOpen;
    this.cdr.markForCheck();
  }

  loadExternalConversations(): void {
    this.isLoadingConversations = true;
    this.cdr.markForCheck();

    this.aiChatService.listConversations('external').subscribe({
      next: (conversations: AiConversation[]) => {
        this.ngZone.run(() => {
          this.externalConversations = conversations;
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          console.error('External conversations load error:', error);
          this.externalConversations = [];
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  selectExternalConversation(uuid: string, updateUrl = true): void {
    const requestId = ++this.conversationLoadRequestId;

    if (updateUrl) {
      this.router.navigate(['/ai/external', uuid]);
    }

    this.activeExternalConversationUuid = uuid;
    this.isLoadingConversation = true;
    this.errorMessage = '';
    this.pendingFiles = [];
    this.selectedExternalDocumentUuids.clear();
    this.stopDocumentPolling();
    this.clearPendingRealtimeSend();
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

          this.externalMessages = (rawConversation.messages || [])
            .filter((message: AiConversationMessage) => message.role === 'user' || message.role === 'assistant')
            .map((message: AiConversationMessage) => this.mapConversationMessage(message));

          this.isLoadingConversation = false;
          this.cdr.detectChanges();
          this.scrollMessagesToBottom();
          this.loadAttachedDocuments();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          if (requestId !== this.conversationLoadRequestId) {
            return;
          }

          console.error('External conversation load error:', error);
          this.externalMessages = [];
          this.isLoadingConversation = false;
          this.errorMessage = 'Unable to load messages for this conversation. Attached files will still be loaded.';
          this.cdr.detectChanges();
          this.loadAttachedDocuments();
        });
      },
    });
  }

  openUploadPicker(): void {
    this.fileInput?.nativeElement.click();
  }

  handleFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addPendingFiles(Array.from(input.files || []));
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;

    if (!relatedTarget || !target.contains(relatedTarget)) {
      this.isDragOver = false;
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }

    this.isDragOver = false;
    this.addPendingFiles(Array.from(event.dataTransfer?.files || []));
  }

  handlePaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files || []);

    if (!files.length) {
      return;
    }

    event.preventDefault();
    this.addPendingFiles(files);
  }

  removePendingFile(id: string): void {
    this.pendingFiles = this.pendingFiles.filter((file) => file.id !== id);
    this.cdr.markForCheck();
  }

  sendCurrentMessage(): void {
    const message = this.messageText.trim();

    if ((!message && !this.pendingFiles.length) || this.isSending || this.isUploading) {
      return;
    }

    this.messageText = '';

    const pendingFilesSnapshot = [...this.pendingFiles];
    this.pendingFiles = [];

    this.sendMessageWithOptionalFiles(message, pendingFilesSnapshot);
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    this.sendCurrentMessage();
  }

  loadAttachedDocuments(): void {
    if (!this.activeExternalConversationUuid) {
      this.externalAttachedDocuments = [];
      this.selectedExternalDocumentUuids.clear();
      this.stopDocumentPolling();
      this.cdr.markForCheck();
      return;
    }

    this.isLoadingDocuments = true;
    this.cdr.markForCheck();

    this.aiChatService.getExternalDocuments(this.activeExternalConversationUuid).subscribe({
      next: (documents: ExternalDocument[]) => {
        this.ngZone.run(() => {
          this.externalAttachedDocuments = documents;
          this.isLoadingDocuments = false;
          this.syncSelectedDocuments();
          this.syncMessageAttachmentsFromDocuments(documents);

          /*
           * HTTP gives authoritative initial state.
           * WebSocket supplies subsequent processing updates.
           */
          this.stopDocumentPolling();

          this.subscribeRealtimeDocuments(
            documents.map(
              (document: ExternalDocument) =>
                document.uuid,
            ),
          );

          this.cdr.detectChanges();
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          console.error('Attached documents load error:', error);
          this.isLoadingDocuments = false;
          this.errorMessage = 'Unable to load attached files.';
          this.cdr.detectChanges();
        });
      },
    });
  }

  deleteDocument(document: ExternalDocument): void {
    this.aiChatService.deleteExternalDocument(document.uuid).subscribe({
      next: () => {
        this.ngZone.run(() => {
          this.externalAttachedDocuments = this.externalAttachedDocuments.filter(
            (item: ExternalDocument) => item.uuid !== document.uuid,
          );
          this.selectedExternalDocumentUuids.delete(document.uuid);
          this.syncMessageAttachmentsFromDocuments(this.externalAttachedDocuments);
          this.cdr.detectChanges();
        });
      },
      error: () => {
        this.ngZone.run(() => {
          this.errorMessage = 'Unable to delete attached file.';
          this.cdr.detectChanges();
        });
      },
    });
  }

  toggleDocument(uuid: string): void {
    if (this.selectedExternalDocumentUuids.has(uuid)) {
      this.selectedExternalDocumentUuids.delete(uuid);
    } else {
      this.selectedExternalDocumentUuids.add(uuid);
    }

    this.cdr.markForCheck();
  }

  isDocumentSelected(uuid: string): boolean {
    return this.selectedExternalDocumentUuids.has(uuid);
  }

  getDocumentStatusLabel(document: ExternalDocument | LocalChatAttachment): string {
    const status = String(document.status || '').toLowerCase();

    if (document.processing_error || status === 'failed') {
      return 'Failed';
    }

    if (document.is_ai_ready || status === 'ready') {
      return 'Ready';
    }

    if (status === 'pending_upload') {
      return 'Uploading...';
    }

    return 'Processing...';
  }

  getDocumentStatusClass(document: ExternalDocument | LocalChatAttachment): string {
    const status = String(document.status || '').toLowerCase();

    if (document.processing_error || status === 'failed') {
      return 'external-document__status external-document__status--failed';
    }

    if (document.is_ai_ready || status === 'ready') {
      return 'external-document__status external-document__status--ready';
    }

    return 'external-document__status external-document__status--processing';
  }

  isDocumentProcessing(document: ExternalDocument | LocalChatAttachment): boolean {
    const status = String(document.status || '').toLowerCase();

    return !document.is_ai_ready &&
      status !== 'ready' &&
      !document.processing_error &&
      status !== 'failed';
  }

  get selectedDocumentCount(): number {
    return this.selectedExternalDocumentUuids.size;
  }

  formatFileSize(size: number | undefined): string {
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

  private addPendingFiles(files: File[]): void {
    if (!files.length) {
      return;
    }

    const validFiles = this.validateFiles(files);

    if (!validFiles.length) {
      return;
    }

    const existingKeys = new Set(
      this.pendingFiles.map((item: PendingExternalFile) => `${item.name}-${item.size}-${item.file.lastModified}`),
    );

    const newPendingFiles = validFiles
      .filter((file: File) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`))
      .map((file: File) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        size: file.size,
        extension: file.name.split('.').pop()?.toLowerCase() || '',
      }));

    this.pendingFiles = [...this.pendingFiles, ...newPendingFiles];
    this.errorMessage = '';
    this.cdr.markForCheck();
  }

  private validateFiles(files: File[]): File[] {
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach((file: File) => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';

      if (this.allowedExtensions.includes(extension)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length) {
      this.errorMessage = `Unsupported file type: ${invalidFiles.join(', ')}`;
      this.cdr.markForCheck();
    }

    return validFiles;
  }

  private sendMessageWithOptionalFiles(
    message: string,
    filesToUpload: PendingExternalFile[],
  ): void {
    const userMessage: LocalChatMessage = {
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
      attachments: filesToUpload.map((file: PendingExternalFile) => ({
        local_id: file.id,
        title: file.name,
        original_filename: file.name,
        file_size: file.size,
        status: 'pending_upload',
        is_ai_ready: false,
      })),
    };

    this.externalMessages = [...this.externalMessages, userMessage];
    this.isSending = true;
    this.errorMessage = '';
    this.cdr.markForCheck();
    this.scrollMessagesToBottom();

    if (filesToUpload.length) {
      this.uploadPendingFilesThenSendMessage(
        filesToUpload,
        message,
        this.externalMessages.length - 1,
      );
      return;
    }

    this.sendExternalMessage(message);
  }

  private uploadPendingFilesThenSendMessage(
    pendingFiles: PendingExternalFile[],
    message: string,
    messageIndex: number,
  ): void {
    this.isUploading = true;
    this.documentsPanelOpen = true;
    this.cdr.markForCheck();

    this.externalDocumentUploadService
      .upload({
        files:
          pendingFiles.map(
            (pendingFile) =>
              pendingFile.file,
          ),

        conversationUuid:
          this.activeExternalConversationUuid,
      })
      .subscribe({
      next: (response: ExternalDocumentBulkUploadResponse) => {
        this.ngZone.run(() => {
          if (response.conversation_uuid) {
            this.activeExternalConversationUuid = response.conversation_uuid;
            this.router.navigate(
              ['/ai/external', response.conversation_uuid],
              { replaceUrl: true },
            );
          }
          this.mergeAttachedDocuments(response.documents || []);
          this.replaceMessageAttachments(
            messageIndex,
            response.documents || [],
          );

          /*
           * Keep query + attachment as ONE user prompt.
           * Replacing attachment objects must never erase
           * the message text.
           */
          this.externalMessages =
            this.externalMessages.map(
              (
                item: LocalChatMessage,
                index: number,
              ) =>
                index === messageIndex
                  ? {
                      ...item,
                      content: message,
                    }
                  : item,
            );

          this.isUploading = false;
          this.cdr.detectChanges();

          this.loadExternalConversations();

          const uploadedDocuments =
            response.documents || [];

          const outcome =
            this.externalUploadOutcomePlanner
              .plan({
                requestedFileCount:
                  pendingFiles.length,

                selectedDocumentUuids:
                  Array.from(
                    this.selectedExternalDocumentUuids,
                  ),

                uploadedDocuments,
              });

          if (
            outcome.kind ===
            'error'
          ) {
            this.isUploading =
              false;

            this.isSending =
              false;

            this.errorMessage =
              outcome.message;

            this.cdr.detectChanges();
            return;
          }

          /*
           * Subscribe immediately after upload.
           * The backend supplies a current-state
           * snapshot for these documents.
           */
          this.subscribeRealtimeDocuments(
            outcome.uploadedDocumentUuids,
          );

          if (
            outcome.kind ===
            'wait'
          ) {
            if (message) {
              this.queueRealtimeSend(
                message,
                outcome.queryDocumentUuids,
                outcome.pendingDocumentUuids,
                outcome.scopeMode,
              );
            } else {
              this.isSending =
                false;

              this.cdr.detectChanges();
            }

            return;
          }

          if (message) {
            this.sendExternalMessage(
              message,
              outcome.queryDocumentUuids,
              outcome.scopeMode,
            );
          } else {
            this.isSending =
              false;

            this.cdr.detectChanges();
          }
        });
      },
      error: (error: unknown) => {
        this.ngZone.run(() => {
          console.error('External bulk upload error:', error);
          this.errorMessage =
            this.aiApiErrorMessageService.getMessage(
              error,
              'Unable to upload files.',
              true,
            );

          this.markMessageAttachmentsFailed(messageIndex, this.errorMessage);
          this.isUploading = false;
          this.isSending = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  private normalizeExternalDocumentUuids(
    documentUuids: string[],
  ): string[] {
    return this
      .externalDocumentScopeService
      .normalize(
        documentUuids,
      );
  }


  private getAllExternalConversationDocumentUuids(): string[] {
    return this
      .externalDocumentScopeService
      .getConversationDocumentUuids(
        this.externalAttachedDocuments,
        this.externalMessages,
      );
  }


  private resolveExternalDocumentUuids(
    currentMessageDocumentUuids: string[] = [],
  ): string[] {
    return this
      .externalDocumentScopeService
      .resolve({
        selectedDocumentUuids:
          Array.from(
            this.selectedExternalDocumentUuids,
          ),

        currentMessageDocumentUuids,

        documents:
          this.externalAttachedDocuments,

        messages:
          this.externalMessages,
      });
  }

  private sendExternalMessage(
    message: string,
    explicitDocumentUuids?: string[],
    explicitScopeMode?: 'selected' | 'conversation',
  ): void {
    if (!message) {
      this.isSending = false;
      this.cdr.markForCheck();
      return;
    }

    /*
     * Freeze the effective scope for THIS request.
     *
     * Explicit current-message files take precedence over
     * selected conversation files.
     */
    const effectiveDocumentUuids =
      explicitDocumentUuids !== undefined
        ? this.normalizeExternalDocumentUuids(
            explicitDocumentUuids,
          )
        : this.resolveExternalDocumentUuids();

    const documentScopeMode: 'selected' | 'conversation' =
      explicitScopeMode ??
      (this.selectedExternalDocumentUuids.size > 0
        ? 'selected'
        : 'conversation');

    const payload: ExternalAiChatRequest = {
      message,
      use_web: true,
      top_k: 8,

      /*
       * External AI contract:
       *
       * Always send document_uuids.
       *
       * selected docs -> selected UUIDs
       * no selection  -> all conversation UUIDs
       * no documents  -> []
       */
      document_uuids:
        effectiveDocumentUuids,
      document_scope_mode: documentScopeMode,
    };

    if (this.activeExternalConversationUuid) {
      payload.conversation_uuid =
        this.activeExternalConversationUuid;
    }

    console.debug(
      '[External AI] sending query scope',
      {
        conversation_uuid:
          payload.conversation_uuid,
        document_uuids:
          payload.document_uuids,
        document_scope_mode:
          payload.document_scope_mode,
        message:
          payload.message,
      },
    );

    this.aiChatService
      .sendExternalChatMessage(payload)
      .subscribe({
        next: (response: ExternalAiChatResponse) => {
          this.ngZone.run(() => {
            const outcome =
              this.externalAiChatResponsePlanner
                .plan(
                  response,
                  effectiveDocumentUuids,
                  new Date()
                    .toISOString(),
                );

            if (
              outcome.kind ===
              'error'
            ) {
              this.isSending =
                false;

              this.errorMessage =
                outcome.message;

              this.cdr.detectChanges();
              return;
            }

            if (
              outcome.kind ===
              'wait'
            ) {
              /*
               * Preserve the exact frozen request
               * scope while document processing
               * finishes. Never re-read sidebar
               * selection here.
               */
              this.queueRealtimeSend(
                message,
                effectiveDocumentUuids,
                outcome.waitUuids,
                documentScopeMode,
              );

              return;
            }

            if (
              outcome.conversationUuid
            ) {
              this.activeExternalConversationUuid =
                outcome.conversationUuid;

              this.router.navigate(
                [
                  '/ai/external',
                  outcome.conversationUuid,
                ],
                {
                  replaceUrl:
                    true,
                },
              );
            }

            this.appendAssistantMessageWithFastTyping(
              outcome.assistantMessage,
            );

            this.loadExternalConversations();

            /*
             * IMPORTANT:
             * Do NOT call loadAttachedDocuments() here.
             *
             * Sending/receiving a chat answer does not require
             * reloading the whole attachment list.
             */
          });
        },

        error: (error: unknown) => {
          this.ngZone.run(() => {
            console.error(
              'External AI chat error:',
              error,
            );

            this.errorMessage =
              this.aiApiErrorMessageService.getMessage(
                error,
                'Unable to send external AI message.',
              );

            this.isSending = false;
            this.cdr.detectChanges();
          });
        },
      });
  }


  private bindDocumentRealtimeEvents(): void {
    this
      .externalDocumentProcessingCoordinator
      .bindRealtime({
        getDocuments:
          () =>
            this.externalAttachedDocuments,

        onEvent:
          (event) => {
            this.ngZone.run(
              () => {
                this.applyDocumentRealtimeEvent(
                  event,
                );

                this.cdr.detectChanges();
              },
            );
          },

        onStatuses:
          (statusDocuments) => {
            this.ngZone.run(
              () => {
                this
                  .applyExternalDocumentProcessingStatuses(
                    statusDocuments,
                  );

                this.cdr.detectChanges();
              },
            );
          },

        onFailed:
          (message) => {
            this.ngZone.run(
              () => {
                this.isSending =
                  false;

                this.isUploading =
                  false;

                this.errorMessage =
                  message;

                this.cdr.detectChanges();
              },
            );
          },

        onSend:
          (pending) => {
            this.ngZone.run(
              () => {
                this.sendExternalMessage(
                  pending.message,
                  pending.scopeUuids,
                  pending.scopeMode,
                );
              },
            );
          },
      });
  }


  private subscribeRealtimeDocuments(
    documentUuids: string[],
  ): void {
    const normalized =
      this.normalizeExternalDocumentUuids(
        documentUuids,
      );

    this
      .externalDocumentProcessingCoordinator
      .subscribeDocuments(
        normalized,
      );
  }

  private applyDocumentRealtimeEvent(
    event: DocumentProcessingEvent,
  ): void {
    const state =
      this.externalDocumentReadinessService
        .applyRealtimeEvent(
          this.externalAttachedDocuments,
          this.externalMessages,
          event,
        );

    this.externalAttachedDocuments =
      state.documents;

    this.externalMessages =
      state.messages;
  }

  private queueRealtimeSend(
    message: string,
    scopeUuids: string[],
    waitUuids: string[],
    scopeMode: 'selected' | 'conversation',
  ): void {
    this.stopDocumentPolling();

    this
      .externalDocumentProcessingCoordinator
      .queueRealtimeSend({
        message,

        scopeUuids:
          this.normalizeExternalDocumentUuids(
            scopeUuids,
          ),

        waitUuids:
          this.normalizeExternalDocumentUuids(
            waitUuids,
          ),

        scopeMode,

        conversationUuid:
          this
            .activeExternalConversationUuid ||
          undefined,
      });
  }


  private clearPendingRealtimeSend(): void {
    this
      .externalDocumentProcessingCoordinator
      .clearPendingRealtimeSend();
  }

  private appendAssistantMessageWithFastTyping(message: LocalChatMessage): void {
    const fullContent = message.content || '';

    if (!fullContent) {
      this.externalMessages = [...this.externalMessages, message];
      this.isSending = false;
      this.cdr.detectChanges();
      this.scrollMessagesToBottom();
      return;
    }

    const messageIndex = this.externalMessages.length;

    const typingMessage: LocalChatMessage = {
      ...message,
      content: '',
    };

    this.externalMessages = [...this.externalMessages, typingMessage];
    this.isSending = false;
    this.cdr.detectChanges();
    this.scrollMessagesToBottom();

    const plan = this.getTypingPlan(fullContent.length);
    let cursor = 0;

    const tick = (): void => {
      cursor = Math.min(cursor + plan.chunkSize, fullContent.length);

      this.externalMessages = this.externalMessages.map((item: LocalChatMessage, index: number) => {
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


  private replaceMessageAttachments(
    messageIndex: number,
    documents: ExternalDocument[],
  ): void {
    this.externalMessages =
      this.externalAttachmentStateService
        .replaceMessageAttachments(
          this.externalMessages,
          messageIndex,
          documents,
        );
  }


  private markMessageAttachmentsFailed(
    messageIndex: number,
    reason: string,
  ): void {
    this.externalMessages =
      this.externalAttachmentStateService
        .markMessageAttachmentsFailed(
          this.externalMessages,
          messageIndex,
          reason,
        );
  }


  private syncMessageAttachmentsFromDocuments(
    documents: ExternalDocument[],
  ): void {
    this.externalMessages =
      this.externalAttachmentStateService
        .syncMessagesFromDocuments(
          this.externalMessages,
          documents,
        );
  }


  private mapDocumentToAttachment(
    document: ExternalDocument,
  ): LocalChatAttachment {
    return this
      .externalAttachmentStateService
      .mapDocumentToAttachment(
        document,
      );
  }


  private mergeAttachedDocuments(
    documents: ExternalDocument[],
  ): void {
    this.externalAttachedDocuments =
      this.externalAttachmentStateService
        .mergeDocuments(
          this.externalAttachedDocuments,
          documents,
        );
  }

  private startDocumentPolling(
    documentUuids?: string[],
    onReady?: () => void,
    initialDelayMs?: number,
  ): void {
    const targetDocumentUuids =
      Array.from(
        new Set(
          (
            documentUuids?.length
              ? documentUuids
              : this
                  .getPendingExternalDocumentUuids(
                    this
                      .externalAttachedDocuments,
                  )
          ).filter(Boolean),
        ),
      );

    if (!targetDocumentUuids.length) {
      onReady?.();
      return;
    }

    this
      .externalDocumentProcessingCoordinator
      .start({
        documentUuids:
          targetDocumentUuids,

        conversationUuid:
          this
            .activeExternalConversationUuid ||
          undefined,

        initialDelayMs,

        onStatuses:
          (statusDocuments) => {
            this.ngZone.run(
              () => {
                this
                  .applyExternalDocumentProcessingStatuses(
                    statusDocuments,
                  );

                this.cdr.detectChanges();
              },
            );
          },

        onFailed:
          (message) => {
            this.ngZone.run(
              () => {
                this.isSending =
                  false;

                this.isUploading =
                  false;

                this.errorMessage =
                  message;

                this.cdr.detectChanges();
              },
            );
          },

        onReady:
          () => {
            this.ngZone.run(
              () => {
                this.cdr.detectChanges();

                onReady?.();
              },
            );
          },
      });
  }


  private stopDocumentPolling(): void {
    this
      .externalDocumentProcessingCoordinator
      .stop();
  }

  private getPendingExternalDocumentUuids(
    documents: ExternalDocument[],
  ): string[] {
    return this
      .externalDocumentReadinessService
      .getPendingUuids(
        documents,
      );
  }


  private isExternalDocumentReady(
    document: Partial<ExternalDocument>,
  ): boolean {
    return this
      .externalDocumentReadinessService
      .isReady(
        document,
      );
  }


  private isExternalDocumentFailed(
    document: Partial<ExternalDocument>,
  ): boolean {
    return this
      .externalDocumentReadinessService
      .isFailed(
        document,
      );
  }


  private applyExternalDocumentProcessingStatuses(
    statusDocuments:
      ExternalDocumentReadinessItem[],
  ): void {
    const state =
      this.externalDocumentReadinessService
        .applyProcessingStatuses(
          this.externalAttachedDocuments,
          this.externalMessages,
          statusDocuments,
        );

    this.externalAttachedDocuments =
      state.documents;

    this.externalMessages =
      state.messages;
  }

  private syncSelectedDocuments(): void {
    const availableUuids = new Set<string>(
      this.externalAttachedDocuments.map((document: ExternalDocument) => document.uuid),
    );

    Array.from(this.selectedExternalDocumentUuids).forEach((uuid: string) => {
      if (!availableUuids.has(uuid)) {
        this.selectedExternalDocumentUuids.delete(uuid);
      }
    });
  }

  private scrollMessagesToBottom(): void {
    window.setTimeout(() => this.messageList?.scrollToBottom(), 0);
  }

  private mapConversationMessage(
    message: AiConversationMessage,
  ): LocalChatMessage {
    return this
      .externalConversationMessageMapper
      .map(
        message,
      );
  }

}
