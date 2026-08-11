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

  private documentPollingHandle: number | null = null;
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

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const uuid = params.get('conversationUuid');

      if (uuid && uuid !== this.activeExternalConversationUuid) {
        this.selectExternalConversation(uuid, false);
      }
    });

    window.setTimeout(() => this.loadExternalConversations(), 180);
  }

  ngOnDestroy(): void {
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

          if (this.shouldPollDocuments()) {
            this.startDocumentPolling();
          } else {
            this.stopDocumentPolling();
          }

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
    const formData = new FormData();

    if (this.activeExternalConversationUuid) {
      formData.append('conversation_uuid', this.activeExternalConversationUuid);
    }

    formData.append('document_type', 'other');
    formData.append('sensitivity_label', 'internal');

    pendingFiles.forEach((pendingFile: PendingExternalFile) => {
      formData.append('files', pendingFile.file);
    });

    this.isUploading = true;
    this.documentsPanelOpen = true;
    this.cdr.markForCheck();

    this.aiChatService.bulkUploadExternalDocuments(formData).subscribe({
      next: (response: { conversation_uuid: string; documents?: ExternalDocument[] }) => {
        this.ngZone.run(() => {
          if (response.conversation_uuid) {
            this.activeExternalConversationUuid = response.conversation_uuid;
            this.router.navigate(
              ['/ai/external', response.conversation_uuid],
              { replaceUrl: true },
            );
          }
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
      error: (error: any) => {
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

  private sendExternalMessage(message: string, explicitDocumentUuids?: string[]): void {
    if (!message) {
      this.isSending = false;
      this.cdr.markForCheck();
      return;
    }

    const selectedExternalDocumentUuids =
      explicitDocumentUuids && explicitDocumentUuids.length
        ? explicitDocumentUuids
        : Array.from(this.selectedExternalDocumentUuids);

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

    this.aiChatService.sendExternalChatMessage(payload).subscribe({
      next: (response: any) => {
        this.ngZone.run(() => {
          if (response.conversation_uuid) {
            this.activeExternalConversationUuid = response.conversation_uuid;
            this.router.navigate(
              ['/ai/external', response.conversation_uuid],
              { replaceUrl: true },
            );
          }

          const assistantMessage: LocalChatMessage = {
            role: 'assistant',
            content: response.answer || '',
            created_at: new Date().toISOString(),
            sources: response.sources || [],
            model_provider: response.model_provider,
            model_name: response.model_name,
            usage: response.usage,
            external_context: response.external_context,
          };

          this.appendAssistantMessageWithFastTyping(assistantMessage);
          this.loadExternalConversations();
          this.loadAttachedDocuments();
        });
      },
      error: (error: any) => {
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
    this.externalMessages = this.externalMessages.map((message: LocalChatMessage, index: number) => {
      if (index !== messageIndex) {
        return message;
      }

      return {
        ...message,
        attachments: documents.map((document: ExternalDocument) => this.mapDocumentToAttachment(document)),
      };
    });
  }

  private markMessageAttachmentsFailed(messageIndex: number, reason: string): void {
    this.externalMessages = this.externalMessages.map((message: LocalChatMessage, index: number) => {
      if (index !== messageIndex) {
        return message;
      }

      return {
        ...message,
        attachments: (message.attachments || []).map((attachment: LocalChatAttachment) => ({
          ...attachment,
          status: 'failed',
          processing_error: reason,
        })),
      };
    });
  }

  private syncMessageAttachmentsFromDocuments(documents: ExternalDocument[]): void {
    const documentsByUuid = new Map<string, ExternalDocument>(
      documents.map((document: ExternalDocument) => [document.uuid, document]),
    );

    this.externalMessages = this.externalMessages
      .map((message: LocalChatMessage) => {
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
          attachments: message.attachments.map((attachment: LocalChatAttachment) => {
            if (attachment.uuid && documentsByUuid.has(attachment.uuid)) {
              return this.mapDocumentToAttachment(documentsByUuid.get(attachment.uuid)!);
            }

            const attachmentName =
              attachment.original_filename ||
              attachment.filename ||
              attachment.title;

            const matchedDocument = documents.find((document: ExternalDocument) => {
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
      .filter((message: LocalChatMessage) => {
        return !!message.content || !!message.attachments?.length || message.role === 'assistant';
      });

    const existingAttachmentUuids = new Set<string>();

    this.externalMessages.forEach((message: LocalChatMessage) => {
      (message.attachments || []).forEach((attachment: LocalChatAttachment) => {
        if (attachment.uuid) {
          existingAttachmentUuids.add(attachment.uuid);
        }
      });
    });

    const missingDocumentMessages: LocalChatMessage[] = documents
      .filter((document: ExternalDocument) => !existingAttachmentUuids.has(document.uuid))
      .map((document: ExternalDocument) => ({
        role: 'user',
        content: '',
        created_at: document.created_at || new Date().toISOString(),
        attachments: [this.mapDocumentToAttachment(document)],
      }));

    if (missingDocumentMessages.length) {
      this.externalMessages = [...this.externalMessages, ...missingDocumentMessages].sort(
        (a: LocalChatMessage, b: LocalChatMessage) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
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
    const existing = new Map<string, ExternalDocument>(
      this.externalAttachedDocuments.map((document: ExternalDocument) => [document.uuid, document]),
    );

    documents.forEach((document: ExternalDocument) => {
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
    return this.externalAttachedDocuments.some((document: ExternalDocument) => {
      const status = String(document.status || '').toLowerCase();

      if (document.processing_error || status === 'failed') {
        return false;
      }

      return !document.is_ai_ready && status !== 'ready';
    });
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

  private mapConversationMessage(message: AiConversationMessage): LocalChatMessage {
    const raw = message as any;

    return {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: /^Uploaded\s+\d+\s+file/i.test(message.content || '') ? '' : message.content,
      created_at: message.created_at,
      sources: raw.retrieved_sources || raw.sources || [],
      model_provider: raw.model_provider,
      model_name: raw.model_name,
      usage: {
        prompt_tokens: raw.prompt_tokens || 0,
        completion_tokens: raw.completion_tokens || 0,
        total_tokens: raw.total_tokens || 0,
      },
      external_context: raw.metadata?.external_context,
    };
  }
}
