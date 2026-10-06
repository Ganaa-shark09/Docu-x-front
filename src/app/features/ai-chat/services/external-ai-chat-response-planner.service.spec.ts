import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AiChatResponse,
  ExternalAiChatResponse,
  ExternalAttachmentsProcessingResponse,
} from '../models/ai-chat.model';

import {
  ExternalAiChatResponsePlannerService,
} from './external-ai-chat-response-planner.service';


describe(
  'ExternalAiChatResponsePlannerService',
  () => {
    const service =
      new ExternalAiChatResponsePlannerService();


    function processingResponse(
      overrides:
        Partial<
          ExternalAttachmentsProcessingResponse
        > = {},
    ): ExternalAttachmentsProcessingResponse {
      return {
        status:
          'attachments_processing',

        detail:
          'Attachments are processing.',

        retry_after_ms:
          3000,

        pending_document_uuids:
          [],

        documents:
          [],

        ready_documents:
          [],

        processing_documents:
          [],

        failed_documents:
          [],

        missing_document_uuids:
          [],

        all_ready:
          false,

        has_processing:
          true,

        has_failed:
          false,

        ...overrides,
      };
    }


    it(
      'waits on backend pending UUIDs when they are provided',
      () => {
        const result =
          service.plan(
            processingResponse({
              pending_document_uuids: [
                'pending-1',
                'pending-1',
                'pending-2',
              ],
            }),
            [
              'frozen-1',
            ],
            '2026-10-05T10:00:00.000Z',
          );

        expect(
          result,
        ).toEqual({
          kind:
            'wait',

          waitUuids: [
            'pending-1',
            'pending-2',
          ],
        });
      },
    );


    it(
      'falls back to the frozen request scope when backend pending UUIDs are absent',
      () => {
        const result =
          service.plan(
            processingResponse(),
            [
              'selected-before-send',
              'uploaded-processing',
            ],
            '2026-10-05T10:00:00.000Z',
          );

        expect(
          result,
        ).toEqual({
          kind:
            'wait',

          waitUuids: [
            'selected-before-send',
            'uploaded-processing',
          ],
        });
      },
    );


    it(
      'returns an error when processing cannot be tracked',
      () => {
        const result =
          service.plan(
            processingResponse(),
            [],
            '2026-10-05T10:00:00.000Z',
          );

        expect(
          result,
        ).toEqual({
          kind:
            'error',

          message:
            'Attachments are still processing, but no document UUID was returned for status tracking.',
        });
      },
    );


    it(
      'maps a successful AI response to an assistant message',
      () => {
        const response:
          AiChatResponse = {
            conversation_uuid:
              'conversation-1',

            answer:
              'Document summary',

            sources: [
              {
                title:
                  'Invoice.pdf',
              },
            ],

            model_provider:
              'openai',

            model_name:
              'model-name',

            usage: {
              prompt_tokens:
                10,

              completion_tokens:
                20,

              total_tokens:
                30,
            },

            external_context: {
              intent:
                'document_question',
            },
          };

        const result =
          service.plan(
            response,
            [
              'document-1',
            ],
            '2026-10-05T10:00:00.000Z',
          );

        expect(
          result,
        ).toEqual({
          kind:
            'success',

          conversationUuid:
            'conversation-1',

          assistantMessage: {
            role:
              'assistant',

            content:
              'Document summary',

            created_at:
              '2026-10-05T10:00:00.000Z',

            sources: [
              {
                title:
                  'Invoice.pdf',
              },
            ],

            model_provider:
              'openai',

            model_name:
              'model-name',

            usage: {
              prompt_tokens:
                10,

              completion_tokens:
                20,

              total_tokens:
                30,
            },

            external_context: {
              intent:
                'document_question',
            },
          },
        });
      },
    );


    it(
      'rejects a malformed non-answer response defensively',
      () => {
        const malformed =
          {
            detail:
              'Unexpected backend response.',
          } as ExternalAiChatResponse;

        const result =
          service.plan(
            malformed,
            [],
            '2026-10-05T10:00:00.000Z',
          );

        expect(
          result,
        ).toEqual({
          kind:
            'error',

          message:
            'Unexpected backend response.',
        });
      },
    );
  },
);
