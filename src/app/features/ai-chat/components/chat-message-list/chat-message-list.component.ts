import { DatePipe, NgClass, NgFor, NgIf } from '@angular/common';
import {
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';

import { LocalChatAttachment, LocalChatMessage } from '../../models/ai-chat.model';
import { FirewallMetadataComponent } from '../firewall-metadata/firewall-metadata.component';
import { SourceCitationsComponent } from '../source-citations/source-citations.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    DatePipe,
    FirewallMetadataComponent,
    NgClass,
    NgFor,
    NgIf,
    SourceCitationsComponent,
  ],
  templateUrl: './chat-message-list.component.html',
  styleUrl: './chat-message-list.component.scss',
})
export class ChatMessageListComponent {
  @Input() messages: LocalChatMessage[] = [];
  @Input() isSending = false;

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

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
      return '';
    }

    if (status === 'pending_upload') {
      return 'Uploading...';
    }

    return 'Uploading...';
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
