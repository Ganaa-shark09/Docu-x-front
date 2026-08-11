import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { marked, type Token, Tokens } from 'marked';

import { LocalChatMessage } from '../../models/ai-chat.model';

type AssistantBlock =
  | { id: string; kind: 'html'; html: string }
  | { id: string; kind: 'code'; code: string; language: string }
  | { id: string; kind: 'table'; html: string }
  | { id: string; kind: 'quote'; html: string };

@Component({
  selector: 'app-assistant-response',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './assistant-response.component.html',
  styleUrl: './assistant-response.component.scss',
})
export class AssistantResponseComponent {
  @Input({ required: true }) message!: LocalChatMessage;

  copiedBlockId: string | null = null;

  get blocks(): AssistantBlock[] {
    const text = this.message?.content ?? '';
    const tokens = marked.lexer(text);
    const blocks: AssistantBlock[] = [];

    let buffered: Token[] = [];
    let index = 0;

    const flushBuffered = (): void => {
      if (!buffered.length) {
        return;
      }

      blocks.push({
        id: `html-${index++}`,
        kind: 'html',
        html: marked.parser(buffered),
      });

      buffered = [];
    };

    for (const token of tokens) {
      if (token.type === 'code') {
        flushBuffered();

        const codeToken = token as Tokens.Code;

        blocks.push({
          id: `code-${index++}`,
          kind: 'code',
          code: codeToken.text,
          language: codeToken.lang || 'text',
        });

        continue;
      }

      if (token.type === 'table') {
        flushBuffered();

        blocks.push({
          id: `table-${index++}`,
          kind: 'table',
          html: marked.parser([token]),
        });

        continue;
      }

      if (token.type === 'blockquote') {
        flushBuffered();

        blocks.push({
          id: `quote-${index++}`,
          kind: 'quote',
          html: marked.parser([token]),
        });

        continue;
      }

      buffered.push(token);
    }

    flushBuffered();

    return blocks;
  }

  get hasSources(): boolean {
    return (this.message?.sources?.length ?? 0) > 0;
  }

  trackBlock(_index: number, block: AssistantBlock): string {
    return block.id;
  }

  async copyCode(block: AssistantBlock): Promise<void> {
    if (block.kind !== 'code') {
      return;
    }

    await navigator.clipboard.writeText(block.code);

    this.copiedBlockId = block.id;

    window.setTimeout(() => {
      if (this.copiedBlockId === block.id) {
        this.copiedBlockId = null;
      }
    }, 1200);
  }

  isCopied(blockId: string): boolean {
    return this.copiedBlockId === blockId;
  }

  sourceType(source: any): string {
    return source?.source_type || source?.type || 'source';
  }

  sourceTitle(source: any): string {
    return source?.title ||
      source?.document_title ||
      source?.file_name ||
      source?.url ||
      'Reference';
  }

  sourceSnippet(source: any): string {
    return this.shortenSnippet(
      source?.snippet ||
      source?.content_preview ||
      source?.preview ||
      source?.text ||
      '',
    );
  }

  sourceUrl(source: any): string | null {
    return source?.url || source?.web_url || null;
  }

  shortenSnippet(value?: string | null, max = 240): string {
    if (!value) {
      return '';
    }

    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
}
