import { DatePipe, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AiConversation } from '../../models/ai-chat.model';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  imports: [DatePipe, NgFor, NgIf],
  templateUrl: './conversation-list.component.html',
  styleUrl: './conversation-list.component.scss',
})
export class ConversationListComponent {
  @Input() conversations: AiConversation[] = [];
  @Input() activeConversationUuid: string | null = null;
  @Input() isLoading = false;

  @Output() newChat = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() selected = new EventEmitter<string>();
  @Output() deleteRequested = new EventEmitter<string>();

  selectConversation(uuid: string): void {
    this.selected.emit(uuid);
  }

  requestDelete(event: MouseEvent, uuid: string): void {
    event.stopPropagation();
    this.deleteRequested.emit(uuid);
  }
}
