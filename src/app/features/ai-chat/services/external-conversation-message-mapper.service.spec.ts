import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  AiConversationMessage,
} from '../models/ai-chat.model';

import {
  ExternalConversationMessageMapperService,
} from './external-conversation-message-mapper.service';

import {
  ExternalDocumentScopeService,
} from './external-document-scope.service';


describe(
  'ExternalConversationMessageMapperService',
  () => {
    const service =
      new ExternalConversationMessageMapperService(
        new ExternalDocumentScopeService(),
      );


    function message(
      overrides:
        Partial<
          AiConversationMessage
        > = {},
    ): AiConversationMessage {
      return {
        role:
          'user',

        content:
          'Explain this document',

        created_at:
          '2026-10-05T10:00:00.000Z',

        ...overrides,
      } as AiConversationMessage;
    }


    it(
      'recreates attachment placeholders from persisted requested document UUIDs',
      () => {
        const result =
          service.map(
            message({
              metadata: {
                requested_document_uuids: [
                  'document-1',
                  'document-1',
                  'document-2',
                ],
              },
            }),
          );

        expect(
          result.attachments,
        ).toEqual(
          [
            {
              uuid:
                'document-1',

              title:
                'Attached document',

              status:
                'processing',

              is_ai_ready:
                false,
            },
            {
              uuid:
                'document-2',

              title:
                'Attached document',

              status:
                'processing',

              is_ai_ready:
                false,
            },
          ],
        );

        expect(
          result.content,
        ).toBe(
          'Explain this document',
        );
      },
    );


    it(
      'does not attach requested UUID metadata to assistant messages',
      () => {
        const result =
          service.map(
            message({
              role:
                'assistant',

              content:
                'Answer',

              metadata: {
                requested_document_uuids: [
                  'document-1',
                ],
              },
            }),
          );

        expect(
          result.role,
        ).toBe(
          'assistant',
        );

        expect(
          result.attachments,
        ).toEqual([]);
      },
    );


    it(
      'hides legacy synthetic upload-only message text',
      () => {
        const result =
          service.map(
            message({
              content:
                'Uploaded 2 files',
            }),
          );

        expect(
          result.content,
        ).toBe('');
      },
    );


    it(
      'maps sources and token usage from persisted conversation data',
      () => {
        const result =
          service.map(
            message({
              role:
                'assistant',

              retrieved_sources: [
                {
                  title:
                    'Source document',
                },
              ],

              prompt_tokens:
                10,

              completion_tokens:
                20,

              total_tokens:
                30,

              model_provider:
                'openai',

              model_name:
                'model-name',
            }),
          );

        expect(
          result.sources,
        ).toHaveLength(
          1,
        );

        expect(
          result.usage,
        ).toEqual({
          prompt_tokens:
            10,

          completion_tokens:
            20,

          total_tokens:
            30,
        });

        expect(
          result.model_provider,
        ).toBe(
          'openai',
        );

        expect(
          result.model_name,
        ).toBe(
          'model-name',
        );
      },
    );
  },
);
