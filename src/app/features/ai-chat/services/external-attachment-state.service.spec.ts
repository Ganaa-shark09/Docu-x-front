import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  ExternalDocument,
  LocalChatMessage,
} from '../models/ai-chat.model';

import {
  ExternalAttachmentStateService,
} from './external-attachment-state.service';


describe(
  'ExternalAttachmentStateService',
  () => {
    const service =
      new ExternalAttachmentStateService();


    function document(
      overrides:
        Partial<ExternalDocument> = {},
    ): ExternalDocument {
      return {
        uuid:
          'document-1',

        title:
          'Document 1',

        original_filename:
          'document-1.pdf',

        status:
          'processing',

        is_ai_ready:
          false,

        created_at:
          '2026-10-05T10:00:00.000Z',

        ...overrides,
      };
    }


    function message(
      overrides:
        Partial<LocalChatMessage> = {},
    ): LocalChatMessage {
      return {
        role:
          'user',

        content:
          'Explain this file',

        created_at:
          '2026-10-05T10:01:00.000Z',

        ...overrides,
      };
    }


    it(
      'maps a ready document to a ready attachment',
      () => {
        const attachment =
          service
            .mapDocumentToAttachment(
              document({
                status:
                  'ready',

                is_ai_ready:
                  true,
              }),
            );

        expect(
          attachment.uuid,
        ).toBe(
          'document-1',
        );

        expect(
          attachment.is_ai_ready,
        ).toBe(true);

        expect(
          attachment.original_filename,
        ).toBe(
          'document-1.pdf',
        );
      },
    );


    it(
      'replaces attachments without changing the user query text',
      () => {
        const messages = [
          message({
            attachments: [
              {
                local_id:
                  'local-1',

                title:
                  'document-1.pdf',

                status:
                  'pending_upload',
              },
            ],
          }),
        ];

        const result =
          service
            .replaceMessageAttachments(
              messages,
              0,
              [
                document(),
              ],
            );

        expect(
          result[0].content,
        ).toBe(
          'Explain this file',
        );

        expect(
          result[0]
            .attachments?.[0]
            .uuid,
        ).toBe(
          'document-1',
        );
      },
    );


    it(
      'marks only the target message attachments as failed',
      () => {
        const messages = [
          message({
            attachments: [
              {
                local_id:
                  'local-1',

                title:
                  'document.pdf',

                status:
                  'pending_upload',
              },
            ],
          }),

          message({
            content:
              'Second message',
          }),
        ];

        const result =
          service
            .markMessageAttachmentsFailed(
              messages,
              0,
              'Upload failed',
            );

        expect(
          result[0]
            .attachments?.[0]
            .status,
        ).toBe(
          'failed',
        );

        expect(
          result[0]
            .attachments?.[0]
            .processing_error,
        ).toBe(
          'Upload failed',
        );

        expect(
          result[1],
        ).toEqual(
          messages[1],
        );
      },
    );


    it(
      'hydrates stored attachments and creates messages for missing documents',
      () => {
        const messages = [
          message({
            created_at:
              '2026-10-05T10:01:00.000Z',

            attachments: [
              {
                uuid:
                  'document-1',

                title:
                  'Attached document',

                status:
                  'processing',
              },
            ],
          }),
        ];

        const result =
          service
            .syncMessagesFromDocuments(
              messages,
              [
                document({
                  uuid:
                    'document-1',

                  title:
                    'First document',

                  status:
                    'ready',

                  is_ai_ready:
                    true,

                  created_at:
                    '2026-10-05T10:00:00.000Z',
                }),

                document({
                  uuid:
                    'document-2',

                  title:
                    'Second document',

                  original_filename:
                    'document-2.pdf',

                  created_at:
                    '2026-10-05T10:02:00.000Z',
                }),
              ],
            );

        expect(
          result,
        ).toHaveLength(
          2,
        );

        expect(
          result[0]
            .attachments?.[0]
            .title,
        ).toBe(
          'First document',
        );

        expect(
          result[1]
            .attachments?.[0]
            .uuid,
        ).toBe(
          'document-2',
        );
      },
    );


    it(
      'merges documents by UUID and lets incoming state win',
      () => {
        const result =
          service.mergeDocuments(
            [
              document({
                status:
                  'processing',
              }),
            ],

            [
              document({
                status:
                  'ready',

                is_ai_ready:
                  true,
              }),

              document({
                uuid:
                  'document-2',

                title:
                  'Document 2',
              }),
            ],
          );

        expect(
          result,
        ).toHaveLength(
          2,
        );

        expect(
          result.find(
            (item) =>
              item.uuid ===
              'document-1',
          )?.status,
        ).toBe(
          'ready',
        );
      },
    );
  },
);
