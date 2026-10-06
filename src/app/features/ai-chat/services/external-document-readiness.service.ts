import {
  Injectable,
} from '@angular/core';

import {
  ExternalDocument,
  ExternalDocumentReadinessItem,
  LocalChatAttachment,
  LocalChatMessage,
} from '../models/ai-chat.model';

import {
  DocumentProcessingEvent,
} from '../../../core/realtime/realtime.models';


export interface ExternalDocumentReadinessState {
  documents: ExternalDocument[];
  messages: LocalChatMessage[];
}


@Injectable({
  providedIn: 'root',
})
export class ExternalDocumentReadinessService {
  isReady(
    document: Partial<ExternalDocument>,
  ): boolean {
    const status = String(
      document.status || '',
    ).toLowerCase();

    return (
      document.is_ai_ready === true ||
      status === 'ready'
    );
  }


  isFailed(
    document: Partial<ExternalDocument>,
  ): boolean {
    const status = String(
      document.status || '',
    ).toLowerCase();

    return (
      status === 'failed' ||
      !!document.processing_error
    );
  }


  getPendingUuids(
    documents: ExternalDocument[],
  ): string[] {
    return documents
      .filter(
        (document) =>
          !this.isReady(document) &&
          !this.isFailed(document),
      )
      .map(
        (document) =>
          document.uuid,
      )
      .filter(Boolean);
  }


  applyRealtimeEvent(
    documents: ExternalDocument[],
    messages: LocalChatMessage[],
    event: DocumentProcessingEvent,
  ): ExternalDocumentReadinessState {
    const uuid =
      event.document_uuid;

    if (!uuid) {
      return {
        documents,
        messages,
      };
    }

    const nextDocuments =
      documents.map(
        (document) => {
          if (
            document.uuid !==
            uuid
          ) {
            return document;
          }

          return {
            ...document,

            status:
              event.status ??
              document.status,

            is_ai_ready:
              typeof event.is_ai_ready ===
                'boolean'
                ? event.is_ai_ready
                : document.is_ai_ready,

            processing_error:
              event.error ??
              document.processing_error,
          };
        },
      );

    const nextMessages =
      messages.map(
        (message) => ({
          ...message,

          attachments:
            (
              message.attachments ||
              []
            ).map(
              (attachment) =>
                this.applyRealtimeAttachmentEvent(
                  attachment,
                  uuid,
                  event,
                ),
            ),
        }),
      );

    return {
      documents: nextDocuments,
      messages: nextMessages,
    };
  }


  applyProcessingStatuses(
    documents: ExternalDocument[],
    messages: LocalChatMessage[],
    statusDocuments:
      ExternalDocumentReadinessItem[],
  ): ExternalDocumentReadinessState {
    if (!statusDocuments.length) {
      return {
        documents,
        messages,
      };
    }

    const statusByUuid =
      new Map<
        string,
        ExternalDocumentReadinessItem
      >(
        statusDocuments.map(
          (document) => [
            document.uuid,
            document,
          ],
        ),
      );

    const nextDocuments =
      documents.map(
        (document) => {
          const latest =
            statusByUuid.get(
              document.uuid,
            );

          if (!latest) {
            return document;
          }

          return {
            ...document,

            status:
              latest.status ??
              document.status,

            is_ai_ready:
              typeof latest.is_ai_ready ===
                'boolean'
                ? latest.is_ai_ready
                : document.is_ai_ready,

            processing_error:
              latest.processing_error ??
              document.processing_error,
          };
        },
      );

    const nextMessages =
      messages.map(
        (message) => ({
          ...message,

          attachments:
            (
              message.attachments ||
              []
            ).map(
              (attachment) =>
                this.applyStatusToAttachment(
                  attachment,
                  statusByUuid,
                ),
            ),
        }),
      );

    return {
      documents: nextDocuments,
      messages: nextMessages,
    };
  }


  private applyRealtimeAttachmentEvent(
    attachment: LocalChatAttachment,
    documentUuid: string,
    event: DocumentProcessingEvent,
  ): LocalChatAttachment {
    if (
      attachment.uuid !==
      documentUuid
    ) {
      return attachment;
    }

    return {
      ...attachment,

      status:
        event.status ??
        attachment.status,

      is_ai_ready:
        typeof event.is_ai_ready ===
          'boolean'
          ? event.is_ai_ready
          : attachment.is_ai_ready,

      processing_error:
        event.error ??
        attachment.processing_error,
    };
  }


  private applyStatusToAttachment(
    attachment: LocalChatAttachment,
    statusByUuid:
      Map<
        string,
        ExternalDocumentReadinessItem
      >,
  ): LocalChatAttachment {
    if (!attachment.uuid) {
      return attachment;
    }

    const latest =
      statusByUuid.get(
        attachment.uuid,
      );

    if (!latest) {
      return attachment;
    }

    return {
      ...attachment,

      status:
        latest.status ??
        attachment.status,

      is_ai_ready:
        typeof latest.is_ai_ready ===
          'boolean'
          ? latest.is_ai_ready
          : attachment.is_ai_ready,

      processing_error:
        latest.processing_error ??
        attachment.processing_error,
    };
  }
}
