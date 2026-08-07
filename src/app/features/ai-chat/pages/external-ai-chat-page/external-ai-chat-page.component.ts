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
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';

import {
  AiConversation,
  AiConversationMessage,
  ExternalAiChatRequest,
  ExternalDocument,
  LocalChatAttachment,
  LocalChatMessage,
} from '../../models/ai-chat.model';
import { AiChatService } from '../../services/ai-chat.service';
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
  templateUrl: './external-ai-chat-page.component.html',
  styleUrl: './external-ai-chat-page.component.scss',
})
export class ExternalAiChatPageComponent implements OnDestroy {
  private readonly aiChatService = inject(AiChatService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
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

  private documentPollingHandle: number | null = null;
  private conversationLoadRequestId = 0;

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
    this.loadExternalConversations();
  }

  ngOnDestroy(): void {
    document.body.classList.remove('ai-chat-no-page-scroll');
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
    this.router.navigate(['/dashboard']);
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
    this.cdr.markForCheck();
  }

  toggleDocumentsPanel(): void {
    this.documentsPanelOpen = !this.documentsPanelOpen;
    this.cdr.markForCheck();
  }

  loadExternalConversations(): void {
    this.isLoadingConversations = true;
    this.cdr.markForCheck();

    this.aiChatService
      .listConversations('external')
      .pipe(
        timeout(30000),
        finalize(() => {
          this.ngZone.run(() => {
            this.isLoadingConversations = false;
            this.cdr.detectChanges();
          });
        }),
      )
      .subscribe({
        next: (conversations) => {
          this.ngZone.run(() => {
            this.externalConversations = conversations;
            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            console.error('External conversations load error:', error);
            this.externalConversations = [];
            this.cdr.detectChanges();
          });
        },
      });
  }

  selectExternalConversation(uuid: string): void {
    const requestId = ++this.conversationLoadRequestId;

    this.activeExternalConversationUuid = uuid;
    this.isLoadingConversation = true;
    this.errorMessage = '';
    this.pendingFiles = [];
    this.selectedExternalDocumentUuids.clear();
    this.stopDocumentPolling();
    this.cdr.markForCheck();

    this.aiChatService
      .getConversation(uuid)
      .pipe(
        timeout(30000),
        finalize(() => {
          this.ngZone.run(() => {
            if (requestId === this.conversationLoadRequestId) {
              this.isLoadingConversation = false;
              this.cdr.detectChanges();
            }
          });
        }),
      )
      .subscribe({
        next: (conversation) => {
          this.ngZone.run(() => {
            if (requestId !== this.conversationLoadRequestId) {
              return;
            }

            this.externalMessages = (conversation.messages || [])
              .filter((message) => message.role === 'user' || message.role === 'assistant')
              .map((message) => this.mapConversationMessage(message));

            this.cdr.detectChanges();
            this.scrollMessagesToBottom();
            this.loadAttachedDocuments();
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            if (requestId !== this.conversationLoadRequestId) {
              return;
            }

            console.error('External conversation load error:', error);
            this.externalMessages = [];
            this.errorMessage =
              'Unable to load messages for this conversation. Attached files will still be loaded.';
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

  private addPendingFiles(files: File[]): void {
    if (!files.length) {
      return;
    }

    const validFiles = this.validateFiles(files);

    if (!validFiles.length) {
      return;
    }

    const existingKeys = new Set(
      this.pendingFiles.map((item) => `${item.name}-${item.size}-${item.file.lastModified}`),
    );

    const newPendingFiles = validFiles
      .filter((file) => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`))
      .map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID?.() || Math.random()}`,
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

    files.forEach((file) => {
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
      attachments: filesToUpload.map((file) => ({
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
    const formData = new FormData();

    if (this.activeExternalConversationUuid) {
      formData.append('conversation_uuid', this.activeExternalConversationUuid);
    }

    formData.append('document_type', 'other');
    formData.append('sensitivity_label', 'internal');

    pendingFiles.forEach((pendingFile) => {
      formData.append('files', pendingFile.file);
    });

    this.isUploading = true;
    this.documentsPanelOpen = true;
    this.cdr.markForCheck();

    this.aiChatService.bulkUploadExternalDocuments(formData).subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          this.activeExternalConversationUuid = response.conversation_uuid;
          this.mergeAttachedDocuments(response.documents || []);
          this.replaceMessageAttachments(messageIndex, response.documents || []);

          this.isUploading = false;
          this.cdr.detectChanges();

          this.loadExternalConversations();
          this.loadAttachedDocuments();
          this.startDocumentPolling();

          if (message) {
            this.sendExternalMessage(message);
          } else {
            this.isSending = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('External bulk upload error:', error);
          this.errorMessage =
            error?.error?.detail ||
            error?.error?.files?.[0] ||
            'Unable to upload files.';

          this.markMessageAttachmentsFailed(messageIndex, this.errorMessage);
          this.isUploading = false;
          this.isSending = false;
          this.cdr.detectChanges();
        });
      },
    });
  }

  private sendExternalMessage(message: string): void {
    if (!message) {
      this.isSending = false;
      this.cdr.markForCheck();
      return;
    }

    const selectedExternalDocumentUuids = Array.from(this.selectedExternalDocumentUuids);

    const payload: ExternalAiChatRequest = {
      message,
      use_web: true,
      top_k: 8,
    };

    if (this.activeExternalConversationUuid) {
      payload.conversation_uuid = this.activeExternalConversationUuid;
    }

    if (selectedExternalDocumentUuids.length > 0) {
      payload.document_uuids = selectedExternalDocumentUuids;
    }

    console.log('External AI payload:', payload);

    this.aiChatService.sendExternalChatMessage(payload).subscribe({
      next: (response) => {
        this.ngZone.run(() => {
          this.activeExternalConversationUuid = response.conversation_uuid;

          const assistantMessage: LocalChatMessage = {
            role: 'assistant',
            content: response.answer,
            created_at: new Date().toISOString(),
            sources: response.sources || [],
            model_provider: response.model_provider,
            model_name: response.model_name,
            usage: response.usage,
            external_context: response.external_context,
          };

          this.externalMessages = [...this.externalMessages, assistantMessage];
          this.isSending = false;
          this.cdr.detectChanges();

          this.scrollMessagesToBottom();
          this.loadExternalConversations();
          this.loadAttachedDocuments();
        });
      },
      error: (error) => {
        this.ngZone.run(() => {
          console.error('External AI chat error:', error);
          this.errorMessage =
            error?.error?.detail ||
            'Unable to send external AI message.';
          this.isSending = false;
          this.cdr.detectChanges();
        });
      },
    });
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

    this.aiChatService
      .getExternalDocuments(this.activeExternalConversationUuid)
      .pipe(
        timeout(30000),
        finalize(() => {
          this.ngZone.run(() => {
            this.isLoadingDocuments = false;
            this.cdr.detectChanges();
          });
        }),
      )
      .subscribe({
        next: (documents) => {
          this.ngZone.run(() => {
            this.externalAttachedDocuments = documents;
            this.syncSelectedDocuments();
            this.syncMessageAttachmentsFromDocuments(documents);

            if (this.shouldPollDocuments()) {
              this.startDocumentPolling();
            } else {
              this.stopDocumentPolling();
            }

            this.cdr.detectChanges();
          });
        },
        error: (error) => {
          this.ngZone.run(() => {
            console.error('Attached documents load error:', error);
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
            (item) => item.uuid !== document.uuid,
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

  private replaceMessageAttachments(
    messageIndex: number,
    documents: ExternalDocument[],
  ): void {
    this.externalMessages = this.externalMessages.map((message, index) => {
      if (index !== messageIndex) {
        return message;
      }

      return {
        ...message,
        attachments: documents.map((document) => this.mapDocumentToAttachment(document)),
      };
    });
  }

  private markMessageAttachmentsFailed(messageIndex: number, reason: string): void {
    this.externalMessages = this.externalMessages.map((message, index) => {
      if (index !== messageIndex) {
        return message;
      }

      return {
        ...message,
        attachments: (message.attachments || []).map((attachment) => ({
          ...attachment,
          status: 'failed',
          processing_error: reason,
        })),
      };
    });
  }

  private syncMessageAttachmentsFromDocuments(documents: ExternalDocument[]): void {
    const documentsByUuid = new Map(documents.map((document) => [document.uuid, document]));

    this.externalMessages = this.externalMessages
      .map((message) => {
        if (/^Uploaded\s+\d+\s+file/i.test(message.content || '') && !message.attachments?.length) {
          return {
            ...message,
            content: '',
          };
        }

        if (!message.attachments?.length) {
          return message;
        }

        return {
          ...message,
          attachments: message.attachments.map((attachment) => {
            if (attachment.uuid && documentsByUuid.has(attachment.uuid)) {
              return this.mapDocumentToAttachment(documentsByUuid.get(attachment.uuid)!);
            }

            const attachmentName =
              attachment.original_filename ||
              attachment.filename ||
              attachment.title;

            const matchedDocument = documents.find((document) => {
              const documentName =
                document.original_filename ||
                document.filename ||
                document.title;

              return documentName === attachmentName;
            });

            return matchedDocument
              ? this.mapDocumentToAttachment(matchedDocument)
              : attachment;
          }),
        };
      })
      .filter((message) => !!message.content || !!message.attachments?.length || message.role === 'assistant');

    const existingAttachmentUuids = new Set<string>();

    this.externalMessages.forEach((message) => {
      (message.attachments || []).forEach((attachment) => {
        if (attachment.uuid) {
          existingAttachmentUuids.add(attachment.uuid);
        }
      });
    });

    const missingDocumentMessages: LocalChatMessage[] = documents
      .filter((document) => !existingAttachmentUuids.has(document.uuid))
      .map((document) => ({
        role: 'user',
        content: '',
        created_at: document.created_at || new Date().toISOString(),
        attachments: [this.mapDocumentToAttachment(document)],
      }));

    if (missingDocumentMessages.length) {
      this.externalMessages = [...this.externalMessages, ...missingDocumentMessages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    }
  }

  private mapDocumentToAttachment(document: ExternalDocument): LocalChatAttachment {
    const status = String(document.status || '').toLowerCase();

    return {
      uuid: document.uuid,
      title: document.title,
      original_filename: document.original_filename,
      filename: document.filename,
      file_size: document.file_size,
      status: document.status,
      is_ai_ready: !!document.is_ai_ready || status === 'ready',
      processing_error: document.processing_error,
    };
  }

  private mergeAttachedDocuments(documents: ExternalDocument[]): void {
    const existing = new Map(
      this.externalAttachedDocuments.map((document) => [document.uuid, document]),
    );

    documents.forEach((document) => {
      existing.set(document.uuid, document);
    });

    this.externalAttachedDocuments = Array.from(existing.values());
  }

  private startDocumentPolling(): void {
    if (this.documentPollingHandle !== null) {
      return;
    }

    this.documentPollingHandle = window.setInterval(() => {
      this.loadAttachedDocuments();
    }, 2500);
  }

  private stopDocumentPolling(): void {
    if (this.documentPollingHandle !== null) {
      window.clearInterval(this.documentPollingHandle);
      this.documentPollingHandle = null;
    }
  }

  private shouldPollDocuments(): boolean {
    return this.externalAttachedDocuments.some((document) => {
      const status = String(document.status || '').toLowerCase();

      if (document.processing_error || status === 'failed') {
        return false;
      }

      return !document.is_ai_ready && status !== 'ready';
    });
  }

  private syncSelectedDocuments(): void {
    const availableUuids = new Set(
      this.externalAttachedDocuments.map((document) => document.uuid),
    );

    Array.from(this.selectedExternalDocumentUuids).forEach((uuid) => {
      if (!availableUuids.has(uuid)) {
        this.selectedExternalDocumentUuids.delete(uuid);
      }
    });
  }

  private scrollMessagesToBottom(): void {
    setTimeout(() => this.messageList?.scrollToBottom(), 0);
  }

  private mapConversationMessage(message: AiConversationMessage): LocalChatMessage {
    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: /^Uploaded\s+\d+\s+file/i.test(message.content || '') ? '' : message.content,
      created_at: message.created_at,
      sources: message.retrieved_sources || message.sources || [],
      model_provider: message.model_provider,
      model_name: message.model_name,
      usage: {
        prompt_tokens: message.prompt_tokens || 0,
        completion_tokens: message.completion_tokens || 0,
        total_tokens: message.total_tokens || 0,
      },
      external_context: message.metadata?.external_context,
    };
  }
}
