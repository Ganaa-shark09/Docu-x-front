import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';

import { LocalChatAttachment, LocalChatMessage } from '../../models/ai-chat.model';
import { AssistantResponseComponent } from '../assistant-response/assistant-response.component';
import { FirewallMetadataComponent } from '../firewall-metadata/firewall-metadata.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    AssistantResponseComponent,
    DatePipe,
    FirewallMetadataComponent,
    NgClass,
    NgFor,
    NgIf,
  ],
  templateUrl: './chat-message-list.component.html',
  styleUrl: './chat-message-list.component.scss',
})
export class ChatMessageListComponent {
  @Input() messages: LocalChatMessage[] = [];
  @Input() isSending = false;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  trackMessage = (index: number, message: LocalChatMessage): string => {
    const attachmentKey = (message.attachments || [])
      .map((attachment) => attachment.uuid || attachment.local_id || attachment.title)
      .join('|');

    return [
      message.role,
      message.created_at,
      message.content || '',
      attachmentKey,
      index,
    ].join('::');
  };

  scrollToBottom(): void {
    const element = this.scrollContainer?.nativeElement;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }

  getAttachmentStatusLabel(attachment: LocalChatAttachment): string {
    const status = String(attachment.status || '').toLowerCase();

    if (attachment.processing_error || status === 'failed') {
      return 'Failed';
    }

    if (attachment.is_ai_ready || status === 'ready') {
      return 'Ready';
    }

    if (status === 'pending_upload') {
      return 'Uploading...';
    }

    return 'Processing...';
  }

  getAttachmentStatusClass(attachment: LocalChatAttachment): string {
    const status = String(attachment.status || '').toLowerCase();

    if (attachment.processing_error || status === 'failed') {
      return 'chat-attachment__status chat-attachment__status--failed';
    }

    if (attachment.is_ai_ready || status === 'ready') {
      return 'chat-attachment__status chat-attachment__status--ready';
    }

    return 'chat-attachment__status chat-attachment__status--processing';
  }

  isAttachmentProcessing(attachment: LocalChatAttachment): boolean {
    const status = String(attachment.status || '').toLowerCase();

    return !attachment.is_ai_ready &&
      status !== 'ready' &&
      !attachment.processing_error &&
      status !== 'failed';
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
}
