import {
  Injectable,
} from '@angular/core';

import {
  ExternalDocument,
  LocalChatMessage,
} from '../models/ai-chat.model';


export interface ExternalDocumentScopeRequest {
  selectedDocumentUuids: string[];
  currentMessageDocumentUuids?: string[];
  documents: ExternalDocument[];
  messages: LocalChatMessage[];
}


@Injectable({
  providedIn: 'root',
})
export class ExternalDocumentScopeService {
  normalize(
    documentUuids: string[],
  ): string[] {
    return Array.from(
      new Set(
        documentUuids.filter(
          Boolean,
        ),
      ),
    );
  }


  getConversationDocumentUuids(
    documents: ExternalDocument[],
    messages: LocalChatMessage[],
  ): string[] {
    const documentListUuids =
      documents
        .map(
          (document) =>
            document.uuid,
        )
        .filter(Boolean);

    /*
     * A message attachment may be visible slightly
     * before the attached-document list refreshes.
     * Include those UUIDs so the next query does not
     * accidentally omit a current conversation file.
     */
    const messageAttachmentUuids =
      messages.flatMap(
        (message) =>
          (
            message.attachments ||
            []
          )
            .map(
              (attachment) =>
                attachment.uuid ||
                '',
            )
            .filter(Boolean),
      );

    return this.normalize(
      [
        ...documentListUuids,
        ...messageAttachmentUuids,
      ],
    );
  }


  resolve(
    request:
      ExternalDocumentScopeRequest,
  ): string[] {
    const currentMessageUuids =
      this.normalize(
        request
          .currentMessageDocumentUuids ||
        [],
      );

    const selectedUuids =
      this.normalize(
        request
          .selectedDocumentUuids,
      );

    /*
     * Explicit selection:
     * selected existing files + files attached
     * to this specific prompt.
     */
    if (
      selectedUuids.length > 0
    ) {
      return this.normalize(
        [
          ...selectedUuids,
          ...currentMessageUuids,
        ],
      );
    }

    /*
     * No explicit selection:
     * all files already represented by the
     * conversation + files attached to this prompt.
     */
    return this.normalize(
      [
        ...this
          .getConversationDocumentUuids(
            request.documents,
            request.messages,
          ),

        ...currentMessageUuids,
      ],
    );
  }
}
