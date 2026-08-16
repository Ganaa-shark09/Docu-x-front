import { NgIf } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import {
  AiChatRequest,
  AiConversation,
  AiConversationMessage,
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
    NgIf,
  ],
  templateUrl: './ai-chat-page.component.html',
  styleUrl: './ai-chat-page.component.scss',
})
export class AiChatPageComponent implements OnDestroy {
  private readonly aiChatService = inject(AiChatService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(ChatMessageListComponent) private messageList?: ChatMessageListComponent;

  internalConversations: AiConversation[] = [];
  internalMessages: LocalChatMessage[] = [];

  activeInternalConversationUuid: string | null = null;

  isLoadingConversations = false;
  isLoadingConversation = false;
  isSending = false;
  isSwitchingToExternal = false;

  errorMessage = '';

  private conversationLoadRequestId = 0;
  private routeSubscription?: Subscription;

  constructor() {
    document.body.classList.add('ai-chat-no-page-scroll');

    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const uuid = params.get('conversationUuid');

      if (uuid && uuid !== this.activeInternalConversationUuid) {
        this.selectConversation(uuid, false);
      }
    });

    window.setTimeout(() => this.loadConversations(), 180);
  }

  ngOnDestroy(): void {
    document.body.classList.remove('ai-chat-no-page-scroll');
    this.routeSubscription?.unsubscribe();
  }

  openExternalAi(): void {
    this.isSwitchingToExternal = true;
    this.cdr.markForCheck();

    window.setTimeout(() => {
      this.router.navigate(['/ai/external']);
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
    this.activeInternalConversationUuid = null;
    this.internalMessages = [];
    this.errorMessage = '';
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

  sendMessage(message: string): void {
    const cleanMessage = message.trim();

    if (!cleanMessage || this.isSending) {
      return;
    }

    this.errorMessage = '';

    const userMessage: LocalChatMessage = {
      role: 'user',
      content: cleanMessage,
      created_at: new Date().toISOString(),
    };

    this.internalMessages = [...this.internalMessages, userMessage];
    this.isSending = true;
    this.cdr.markForCheck();
    this.scrollMessagesToBottom();

    const payload: AiChatRequest = {
      message: cleanMessage,
      top_k: 5,
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
          this.errorMessage =
            error?.error?.detail ||
            'Unable to send internal AI message.';
          this.isSending = false;
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
}
