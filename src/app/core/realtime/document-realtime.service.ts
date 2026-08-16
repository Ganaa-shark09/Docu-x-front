import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

import {
  DocumentProcessingEvent,
  RealtimeConnectionState,
  WebSocketTicketResponse,
} from './realtime.models';

@Injectable({
  providedIn: 'root',
})
export class DocumentRealtimeService {
  private readonly http = inject(HttpClient);
  private readonly ngZone = inject(NgZone);

  private socket: WebSocket | null = null;

  private connecting = false;
  private manualDisconnect = false;

  private reconnectHandle: number | null = null;
  private reconnectAttempt = 0;

  private readonly desiredDocumentUuids =
    new Set<string>();

  private readonly eventsSubject =
    new Subject<DocumentProcessingEvent>();

  readonly events$ =
    this.eventsSubject.asObservable();

  private readonly connectionStateSubject =
    new BehaviorSubject<RealtimeConnectionState>(
      'disconnected',
    );

  readonly connectionState$ =
    this.connectionStateSubject.asObservable();

  get connectionState(): RealtimeConnectionState {
    return this.connectionStateSubject.value;
  }

  get isConnected(): boolean {
    return (
      this.connectionState === 'connected' &&
      this.socket?.readyState === WebSocket.OPEN
    );
  }

  subscribeDocuments(
    documentUuids: string[],
  ): void {
    const normalized =
      this.normalizeUuids(documentUuids);

    if (!normalized.length) {
      return;
    }

    normalized.forEach((uuid) => {
      this.desiredDocumentUuids.add(uuid);
    });

    if (this.isConnected) {
      this.sendCurrentSubscription();
      return;
    }

    this.ensureConnected();
  }

  subscribeDocument(
    documentUuid: string,
  ): void {
    this.subscribeDocuments([
      documentUuid,
    ]);
  }

  ensureConnected(): void {
    if (
      this.connecting ||
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    if (!this.desiredDocumentUuids.size) {
      return;
    }

    this.manualDisconnect = false;
    this.connecting = true;

    this.connectionStateSubject.next(
      this.reconnectAttempt > 0
        ? 'reconnecting'
        : 'connecting',
    );

    this.getWebSocketTicket().subscribe({
      next: (ticketResponse) => {
        this.openSocket(ticketResponse);
      },

      error: (error) => {
        console.error(
          '[DocuX realtime] ticket request failed',
          error,
        );

        this.connecting = false;
        this.connectionStateSubject.next(
          'disconnected',
        );

        this.scheduleReconnect();
      },
    });
  }

  /**
   * Call this only when authentication/session ends.
   *
   * Do NOT call it just because a page/component was destroyed.
   */
  disconnect(): void {
    this.manualDisconnect = true;
    this.connecting = false;
    this.reconnectAttempt = 0;

    if (this.reconnectHandle !== null) {
      window.clearTimeout(
        this.reconnectHandle,
      );

      this.reconnectHandle = null;
    }

    this.desiredDocumentUuids.clear();

    const socket = this.socket;
    this.socket = null;

    if (
      socket &&
      (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      )
    ) {
      socket.close(
        1000,
        'Session ended',
      );
    }

    this.connectionStateSubject.next(
      'disconnected',
    );
  }

  private getWebSocketTicket() {
    return this.http.post<WebSocketTicketResponse>(
      `${this.resolveApiBaseUrl()}/realtime/websocket-ticket/`,
      {},
    );
  }

  private openSocket(
    ticketResponse: WebSocketTicketResponse,
  ): void {
    const path =
      ticketResponse.websocket_path ||
      '/ws/document-events/';

    const ticket =
      encodeURIComponent(
        ticketResponse.ticket,
      );

    const url =
      `${this.resolveWebSocketBaseUrl()}${path}?ticket=${ticket}`;

    console.debug(
      '[DocuX realtime] opening socket',
      url.replace(
        /ticket=[^&]+/,
        'ticket=<redacted>',
      ),
    );

    const socket =
      new WebSocket(url);

    this.socket = socket;

    socket.onopen = () => {
      this.ngZone.run(() => {
        this.connecting = false;

        console.debug(
          '[DocuX realtime] transport open',
        );
      });
    };

    socket.onmessage = (
      message: MessageEvent<string>,
    ) => {
      this.ngZone.run(() => {
        let event: DocumentProcessingEvent;

        try {
          event =
            JSON.parse(message.data);
        } catch (error) {
          console.error(
            '[DocuX realtime] invalid message',
            error,
            message.data,
          );

          return;
        }

        if (
          event.event ===
          'connection.ready'
        ) {
          this.connectionStateSubject.next(
            'connected',
          );

          this.reconnectAttempt = 0;

          console.debug(
            '[DocuX realtime] connection.ready',
          );

          this.sendCurrentSubscription();
        }

        if (
          event.event ===
          'subscription.updated'
        ) {
          console.debug(
            '[DocuX realtime] subscription.updated',
            {
              subscribed:
                event.subscribed_document_uuids,
              rejected:
                event.rejected_document_uuids,
            },
          );
        }

        if (
          event.event ===
            'document.processing.snapshot' ||
          event.event ===
            'document.processing.updated'
        ) {
          console.debug(
            '[DocuX realtime] document event',
            event.document_uuid,
            event.stage,
            event.progress,
          );
        }

        this.eventsSubject.next(
          event,
        );
      });
    };

    socket.onerror = (error) => {
      console.error(
        '[DocuX realtime] socket error',
        error,
      );
    };

    socket.onclose = (event) => {
      this.ngZone.run(() => {
        console.warn(
          '[DocuX realtime] socket closed',
          event.code,
          event.reason,
        );

        if (this.socket === socket) {
          this.socket = null;
        }

        this.connecting = false;

        this.connectionStateSubject.next(
          'disconnected',
        );

        if (!this.manualDisconnect) {
          this.scheduleReconnect();
        }
      });
    };
  }

  private sendCurrentSubscription(): void {
    if (
      !this.socket ||
      this.socket.readyState !==
        WebSocket.OPEN
    ) {
      return;
    }

    const documentUuids =
      Array.from(
        this.desiredDocumentUuids,
      );

    if (!documentUuids.length) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        action: 'subscribe',
        document_uuids:
          documentUuids,
      }),
    );

    console.debug(
      '[DocuX realtime] subscribe',
      documentUuids,
    );
  }

  private scheduleReconnect(): void {
    if (
      this.manualDisconnect ||
      this.reconnectHandle !== null ||
      !this.desiredDocumentUuids.size
    ) {
      return;
    }

    const delays = [
      1000,
      2000,
      5000,
      10000,
      30000,
    ];

    const delay =
      delays[
        Math.min(
          this.reconnectAttempt,
          delays.length - 1,
        )
      ];

    this.reconnectAttempt += 1;

    this.connectionStateSubject.next(
      'reconnecting',
    );

    this.reconnectHandle =
      window.setTimeout(() => {
        this.reconnectHandle = null;

        /*
         * Reconnect always requests a NEW
         * short-lived ticket.
         */
        this.ensureConnected();
      }, delay);
  }

  private normalizeUuids(
    documentUuids: string[],
  ): string[] {
    return Array.from(
      new Set(
        documentUuids
          .map((uuid) =>
            String(uuid || '').trim(),
          )
          .filter(Boolean),
      ),
    );
  }

  private resolveApiBaseUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:8000/api';
    }

    if (
      window.location.hostname ===
        'localhost' ||
      window.location.hostname ===
        '127.0.0.1'
    ) {
      return 'http://localhost:8000/api';
    }

    return `${window.location.origin}/api`;
  }

  private resolveWebSocketBaseUrl(): string {
    if (typeof window === 'undefined') {
      return 'ws://localhost:8000';
    }

    if (
      window.location.hostname ===
        'localhost' ||
      window.location.hostname ===
        '127.0.0.1'
    ) {
      return 'ws://localhost:8000';
    }

    return window.location.origin
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:');
  }
}
