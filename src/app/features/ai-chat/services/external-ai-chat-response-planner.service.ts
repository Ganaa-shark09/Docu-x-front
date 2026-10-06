import {
  Injectable,
} from '@angular/core';

import {
  AiChatResponse,
  ExternalAiChatResponse,
  LocalChatMessage,
} from '../models/ai-chat.model';


export type ExternalAiChatResponsePlan =
  | {
      kind: 'wait';
      waitUuids: string[];
    }
  | {
      kind: 'error';
      message: string;
    }
  | {
      kind: 'success';
      conversationUuid?: string;
      assistantMessage: LocalChatMessage;
    };


@Injectable({
  providedIn: 'root',
})
export class ExternalAiChatResponsePlannerService {
  plan(
    response:
      ExternalAiChatResponse,
    effectiveDocumentUuids:
      string[],
    createdAt:
      string,
  ): ExternalAiChatResponsePlan {
    if (
      'status' in response &&
      response.status ===
        'attachments_processing'
    ) {
      const backendPendingUuids =
        Array.isArray(
          response
            .pending_document_uuids,
        )
          ? this.normalizeUuids(
              response
                .pending_document_uuids,
            )
          : [];

      const waitUuids =
        backendPendingUuids.length
          ? backendPendingUuids
          : this.normalizeUuids(
              effectiveDocumentUuids,
            );

      if (
        !waitUuids.length
      ) {
        return {
          kind:
            'error',

          message:
            'Attachments are still processing, but no document UUID was returned for status tracking.',
        };
      }

      return {
        kind:
          'wait',

        waitUuids,
      };
    }

    if (
      !this.isSuccessResponse(
        response,
      )
    ) {
      return {
        kind:
          'error',

        message:
          response.detail ||
          'External AI returned an unexpected response.',
      };
    }

    return {
      kind:
        'success',

      conversationUuid:
        response.conversation_uuid ||
        undefined,

      assistantMessage: {
        role:
          'assistant',

        content:
          response.answer,

        created_at:
          createdAt,

        sources:
          response.sources ||
          [],

        model_provider:
          response.model_provider,

        model_name:
          response.model_name,

        usage:
          response.usage,

        external_context:
          response.external_context,
      },
    };
  }


  private isSuccessResponse(
    response:
      ExternalAiChatResponse,
  ): response is AiChatResponse {
    if (
      'status' in response &&
      response.status ===
        'attachments_processing'
    ) {
      return false;
    }

    return (
      'answer' in response &&
      typeof response.answer ===
        'string'
    );
  }


  private normalizeUuids(
    uuids: string[],
  ): string[] {
    return Array.from(
      new Set(
        uuids.filter(
          Boolean,
        ),
      ),
    );
  }
}
