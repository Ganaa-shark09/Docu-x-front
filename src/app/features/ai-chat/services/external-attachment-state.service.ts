import {
  Injectable,
} from '@angular/core';

import {
  ExternalDocument,
  LocalChatAttachment,
  LocalChatMessage,
} from '../models/ai-chat.model';


@Injectable({
  providedIn: 'root',
})
export class ExternalAttachmentStateService {
  mapDocumentToAttachment(
    document: ExternalDocument,
  ): LocalChatAttachment {
    const status = String(
      document.status || '',
    ).toLowerCase();

    return {
      uuid:
        document.uuid,

      title:
        document.title,

      original_filename:
        document.original_filename,

      filename:
        document.filename,

      file_size:
        document.file_size,

      status:
        document.status,

      is_ai_ready:
        !!document.is_ai_ready ||
        status === 'ready',

      processing_error:
        document.processing_error,
    };
  }


  replaceMessageAttachments(
    messages: LocalChatMessage[],
    messageIndex: number,
    documents: ExternalDocument[],
  ): LocalChatMessage[] {
    return messages.map(
      (
        message,
        index,
      ) => {
        if (
          index !==
          messageIndex
        ) {
          return message;
        }

        return {
          ...message,

          attachments:
            documents.map(
              (document) =>
                this.mapDocumentToAttachment(
                  document,
                ),
            ),
        };
      },
    );
  }


  markMessageAttachmentsFailed(
    messages: LocalChatMessage[],
    messageIndex: number,
    reason: string,
  ): LocalChatMessage[] {
    return messages.map(
      (
        message,
        index,
      ) => {
        if (
          index !==
          messageIndex
        ) {
          return message;
        }

        return {
          ...message,

          attachments:
            (
              message.attachments ||
              []
            ).map(
              (attachment) => ({
                ...attachment,

                status:
                  'failed',

                processing_error:
                  reason,
              }),
            ),
        };
      },
    );
  }


  syncMessagesFromDocuments(
    messages: LocalChatMessage[],
    documents: ExternalDocument[],
  ): LocalChatMessage[] {
    const documentsByUuid =
      new Map<
        string,
        ExternalDocument
      >(
        documents.map(
          (document) => [
            document.uuid,
            document,
          ],
        ),
      );

    let nextMessages =
      messages
        .map(
          (message) => {
            /*
             * Older backend conversation history may
             * contain synthetic upload-only messages.
             */
            if (
              /^Uploaded\s+\d+\s+file/i.test(
                message.content || '',
              ) &&
              !message.attachments
                ?.length
            ) {
              return {
                ...message,
                content: '',
              };
            }

            if (
              !message.attachments
                ?.length
            ) {
              return message;
            }

            return {
              ...message,

              attachments:
                message.attachments.map(
                  (attachment) => {
                    if (
                      attachment.uuid &&
                      documentsByUuid.has(
                        attachment.uuid,
                      )
                    ) {
                      return this
                        .mapDocumentToAttachment(
                          documentsByUuid.get(
                            attachment.uuid,
                          )!,
                        );
                    }

                    const attachmentName =
                      attachment
                        .original_filename ||
                      attachment.filename ||
                      attachment.title;

                    const matchedDocument =
                      documents.find(
                        (document) => {
                          const documentName =
                            document
                              .original_filename ||
                            document.filename ||
                            document.title;

                          return (
                            documentName ===
                            attachmentName
                          );
                        },
                      );

                    return matchedDocument
                      ? this
                          .mapDocumentToAttachment(
                            matchedDocument,
                          )
                      : attachment;
                  },
                ),
            };
          },
        )
        .filter(
          (message) =>
            !!message.content ||
            !!message.attachments
              ?.length ||
            message.role ===
              'assistant',
        );

    const existingAttachmentUuids =
      new Set<string>();

    nextMessages.forEach(
      (message) => {
        (
          message.attachments ||
          []
        ).forEach(
          (attachment) => {
            if (
              attachment.uuid
            ) {
              existingAttachmentUuids
                .add(
                  attachment.uuid,
                );
            }
          },
        );
      },
    );

    const missingDocumentMessages:
      LocalChatMessage[] =
        documents
          .filter(
            (document) =>
              !existingAttachmentUuids
                .has(
                  document.uuid,
                ),
          )
          .map(
            (document) => ({
              role:
                'user',

              content:
                '',

              created_at:
                document.created_at ||
                new Date()
                  .toISOString(),

              attachments: [
                this
                  .mapDocumentToAttachment(
                    document,
                  ),
              ],
            }),
          );

    if (
      missingDocumentMessages.length
    ) {
      nextMessages = [
        ...nextMessages,
        ...missingDocumentMessages,
      ].sort(
        (
          first,
          second,
        ) =>
          new Date(
            first.created_at,
          ).getTime() -
          new Date(
            second.created_at,
          ).getTime(),
      );
    }

    return nextMessages;
  }


  mergeDocuments(
    existingDocuments:
      ExternalDocument[],
    incomingDocuments:
      ExternalDocument[],
  ): ExternalDocument[] {
    const documentsByUuid =
      new Map<
        string,
        ExternalDocument
      >(
        existingDocuments.map(
          (document) => [
            document.uuid,
            document,
          ],
        ),
      );

    incomingDocuments.forEach(
      (document) => {
        documentsByUuid.set(
          document.uuid,
          document,
        );
      },
    );

    return Array.from(
      documentsByUuid.values(),
    );
  }
}
