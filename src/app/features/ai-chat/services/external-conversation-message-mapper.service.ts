import {
  Injectable,
} from '@angular/core';

import {
  AiConversationMessage,
  LocalChatMessage,
} from '../models/ai-chat.model';

import {
  ExternalDocumentScopeService,
} from './external-document-scope.service';


@Injectable({
  providedIn: 'root',
})
export class ExternalConversationMessageMapperService {
  constructor(
    private readonly documentScope:
      ExternalDocumentScopeService,
  ) {}


  map(
    message:
      AiConversationMessage,
  ): LocalChatMessage {
    /*
     * External AI stores the exact document UUIDs
     * used for each user query.
     *
     * Re-create lightweight attachment placeholders
     * while the conversation history is loading.
     * The attached-document load later hydrates them
     * with current filename/status/readiness data.
     */
    const requestedDocumentUuids =
      message.role === 'user' &&
      Array.isArray(
        message.metadata
          ?.requested_document_uuids,
      )
        ? this.documentScope
            .normalize(
              message.metadata
                .requested_document_uuids,
            )
        : [];

    return {
      role:
        message.role ===
        'assistant'
          ? 'assistant'
          : 'user',

      content:
        /^Uploaded\s+\d+\s+file/i
          .test(
            message.content ||
            '',
          )
          ? ''
          : message.content,

      created_at:
        message.created_at,

      sources:
        message.retrieved_sources ||
        message.sources ||
        [],

      model_provider:
        message.model_provider,

      model_name:
        message.model_name,

      usage: {
        prompt_tokens:
          message.prompt_tokens ||
          0,

        completion_tokens:
          message.completion_tokens ||
          0,

        total_tokens:
          message.total_tokens ||
          0,
      },

      external_context:
        message.metadata
          ?.external_context,

      attachments:
        requestedDocumentUuids.map(
          (uuid) => ({
            uuid,

            title:
              'Attached document',

            status:
              'processing',

            is_ai_ready:
              false,
          }),
        ),
    };
  }
}
