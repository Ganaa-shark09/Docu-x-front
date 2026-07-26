import { DatePipe, NgFor, NgIf } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import { LocalChatMessage } from '../../models/ai-chat.model';
import { FirewallMetadataComponent } from '../firewall-metadata/firewall-metadata.component';
import { SourceCitationsComponent } from '../source-citations/source-citations.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    DatePipe,
    FirewallMetadataComponent,
    NgFor,
    NgIf,
    SourceCitationsComponent,
  ],
  templateUrl: './chat-message-list.component.html',
  styleUrl: './chat-message-list.component.scss',
})
export class ChatMessageListComponent implements AfterViewInit, OnChanges {
  @Input() messages: LocalChatMessage[] = [];
  @Input() isSending = false;

  @ViewChild('messageScrollContainer')
  private messageScrollContainer?: ElementRef<HTMLDivElement>;

  private previousMessageCount = 0;
  private userIsReadingHistory = false;

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const messagesChanged = Boolean(changes['messages']);
    const sendingChanged = Boolean(changes['isSending']);

    if (!messagesChanged && !sendingChanged) {
      return;
    }

    const newMessageAdded = this.messages.length > this.previousMessageCount;
    this.previousMessageCount = this.messages.length;

    if (newMessageAdded || this.isSending) {
      this.scrollToBottomSoon();
    }
  }

  handleWheel(event: WheelEvent): void {
    const element = this.messageScrollContainer?.nativeElement;

    if (!element) {
      return;
    }

    event.preventDefault();
    element.scrollTop += event.deltaY;

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    this.userIsReadingHistory = distanceFromBottom > 160;
  }

  onScroll(): void {
    const element = this.messageScrollContainer?.nativeElement;

    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    this.userIsReadingHistory = distanceFromBottom > 160;
  }

  scrollToBottom(): void {
    const element = this.messageScrollContainer?.nativeElement;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
    this.userIsReadingHistory = false;
  }

  private scrollToBottomSoon(): void {
    if (this.userIsReadingHistory) {
      return;
    }

    setTimeout(() => {
      this.scrollToBottom();
    }, 0);
  }
}
