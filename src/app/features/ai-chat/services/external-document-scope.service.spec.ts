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
  ExternalDocumentScopeService,
} from './external-document-scope.service';


describe(
  'ExternalDocumentScopeService',
  () => {
    const service =
      new ExternalDocumentScopeService();


    function document(
      uuid: string,
    ): ExternalDocument {
      return {
        uuid,
        title:
          uuid,
      };
    }


    function messageWithAttachment(
      uuid: string,
    ): LocalChatMessage {
      return {
        role:
          'user',

        content:
          '',

        created_at:
          '2026-10-05T10:00:00.000Z',

        attachments: [
          {
            uuid,
            title:
              uuid,
          },
        ],
      };
    }


    it(
      'normalizes UUIDs by removing blanks and duplicates',
      () => {
        expect(
          service.normalize(
            [
              'document-1',
              '',
              'document-1',
              'document-2',
            ],
          ),
        ).toEqual(
          [
            'document-1',
            'document-2',
          ],
        );
      },
    );


    it(
      'uses selected documents plus files attached to the current prompt',
      () => {
        const result =
          service.resolve({
            selectedDocumentUuids: [
              'selected-1',
            ],

            currentMessageDocumentUuids: [
              'uploaded-1',
            ],

            documents: [
              document(
                'conversation-1',
              ),
            ],

            messages:
              [],
          });

        expect(
          result,
        ).toEqual(
          [
            'selected-1',
            'uploaded-1',
          ],
        );
      },
    );


    it(
      'uses all conversation documents when nothing is selected',
      () => {
        const result =
          service.resolve({
            selectedDocumentUuids:
              [],

            currentMessageDocumentUuids: [
              'uploaded-1',
            ],

            documents: [
              document(
                'conversation-1',
              ),
              document(
                'conversation-2',
              ),
            ],

            messages:
              [],
          });

        expect(
          result,
        ).toEqual(
          [
            'conversation-1',
            'conversation-2',
            'uploaded-1',
          ],
        );
      },
    );


    it(
      'includes message attachment UUIDs not yet present in the document list',
      () => {
        const result =
          service
            .getConversationDocumentUuids(
              [
                document(
                  'document-list-1',
                ),
              ],
              [
                messageWithAttachment(
                  'message-only-1',
                ),
              ],
            );

        expect(
          result,
        ).toEqual(
          [
            'document-list-1',
            'message-only-1',
          ],
        );
      },
    );


    it(
      'deduplicates UUIDs across documents, messages and current uploads',
      () => {
        const result =
          service.resolve({
            selectedDocumentUuids:
              [],

            currentMessageDocumentUuids: [
              'shared',
              'uploaded-2',
            ],

            documents: [
              document(
                'shared',
              ),
            ],

            messages: [
              messageWithAttachment(
                'shared',
              ),
              messageWithAttachment(
                'message-2',
              ),
            ],
          });

        expect(
          result,
        ).toEqual(
          [
            'shared',
            'message-2',
            'uploaded-2',
          ],
        );
      },
    );
  },
);
