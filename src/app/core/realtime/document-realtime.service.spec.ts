import { provideHttpClient } from '@angular/common/http';

import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { TestBed } from '@angular/core/testing';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentRealtimeService } from './document-realtime.service';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  readonly url: string;

  readyState = FakeWebSocket.CONNECTING;

  onopen: ((event: Event) => void) | null = null;

  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onclose: ((event: CloseEvent) => void) | null = null;

  send = vi.fn();

  close = vi.fn((code?: number, reason?: string) => {
    this.readyState = FakeWebSocket.CLOSED;

    void code;
    void reason;
  });

  constructor(url: string) {
    this.url = url;

    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;

    this.onopen?.(new Event('open'));
  }

  message(payload: unknown): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify(payload),
      }),
    );
  }
}

describe('DocumentRealtimeService', () => {
  let service: DocumentRealtimeService;

  let httpMock: HttpTestingController;

  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];

    vi.stubGlobal('WebSocket', FakeWebSocket);

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(DocumentRealtimeService);

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.disconnect();

    httpMock.verify();

    vi.unstubAllGlobals();

    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    }
  });

  it('requests a short-lived ticket before opening the socket', () => {
    service.subscribeDocument('document-1');

    expect(service.connectionState).toBe('connecting');

    const request = httpMock.expectOne('http://localhost:8000/api/realtime/websocket-ticket/');

    expect(request.request.method).toBe('POST');

    expect(request.request.body).toEqual({});

    request.flush({
      ticket: 'ticket-value',

      expires_in_seconds: 60,

      websocket_path: '/ws/document-events/',
    });

    expect(FakeWebSocket.instances).toHaveLength(1);

    expect(FakeWebSocket.instances[0].url).toBe(
      'ws://localhost:8000/ws/document-events/?ticket=ticket-value',
    );
  });

  it('deduplicates document UUIDs before subscribing', () => {
    service.subscribeDocuments(['document-1', 'document-1', ' document-2 ', '']);

    const request = httpMock.expectOne('http://localhost:8000/api/realtime/websocket-ticket/');

    request.flush({
      ticket: 'ticket',

      expires_in_seconds: 60,

      websocket_path: '/ws/document-events/',
    });

    const socket = FakeWebSocket.instances[0];

    socket.open();

    expect(socket.send).not.toHaveBeenCalled();

    socket.message({
      event: 'connection.ready',
    });

    expect(socket.send).toHaveBeenCalledTimes(1);

    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({
      action: 'subscribe',

      document_uuids: ['document-1', 'document-2'],
    });
  });

  it('emits processing events received through the socket', () => {
    const received: unknown[] = [];

    service.events$.subscribe((event) => {
      received.push(event);
    });

    service.subscribeDocument('document-3');

    const request = httpMock.expectOne('http://localhost:8000/api/realtime/websocket-ticket/');

    request.flush({
      ticket: 'ticket',

      expires_in_seconds: 60,

      websocket_path: '/ws/document-events/',
    });

    const socket = FakeWebSocket.instances[0];

    socket.open();

    socket.message({
      event: 'document.processing.updated',

      document_uuid: 'document-3',

      stage: 'indexing',

      progress: 90,
    });

    expect(received).toContainEqual(
      expect.objectContaining({
        event: 'document.processing.updated',

        document_uuid: 'document-3',

        stage: 'indexing',

        progress: 90,
      }),
    );
  });

  it('does not emit malformed websocket JSON', () => {
    const received: unknown[] = [];

    service.events$.subscribe((event) => {
      received.push(event);
    });

    service.subscribeDocument('document-4');

    const request = httpMock.expectOne('http://localhost:8000/api/realtime/websocket-ticket/');

    request.flush({
      ticket: 'ticket',

      expires_in_seconds: 60,

      websocket_path: '/ws/document-events/',
    });

    const socket = FakeWebSocket.instances[0];

    socket.onmessage?.(
      new MessageEvent('message', {
        data: '{broken-json',
      }),
    );

    expect(received).toEqual([]);
  });

  it('disconnects the socket and clears connection state', () => {
    service.subscribeDocument('document-5');

    const request = httpMock.expectOne('http://localhost:8000/api/realtime/websocket-ticket/');

    request.flush({
      ticket: 'ticket',

      expires_in_seconds: 60,

      websocket_path: '/ws/document-events/',
    });

    const socket = FakeWebSocket.instances[0];

    socket.open();

    socket.message({
      event: 'connection.ready',
    });

    expect(service.connectionState).toBe('connected');

    service.disconnect();

    expect(socket.close).toHaveBeenCalledWith(1000, 'Session ended');

    expect(service.connectionState).toBe('disconnected');
  });

  it('evicts revoked documents and never blindly resubscribes them', () => {
    service.subscribeDocument('revoked-doc');
    httpMock
      .expectOne('http://localhost:8000/api/realtime/websocket-ticket/')
      .flush({ ticket: 'ticket', websocket_path: '/ws/document-events/' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ event: 'connection.ready' });
    const revoked: string[] = [];
    service.revoked$.subscribe((uuid) => revoked.push(uuid));
    socket.message({ event: 'subscription.revoked', document_uuid: 'revoked-doc' });
    socket.send.mockClear();
    service.subscribeDocument('revoked-doc');
    expect(revoked).toEqual(['revoked-doc']);
    expect(socket.send).not.toHaveBeenCalled();
    service.ensureConnected();
    httpMock.expectNone('http://localhost:8000/api/realtime/websocket-ticket/');
  });
  it('treats subscription rejection as authorization denial instead of transport failure', () => {
    service.subscribeDocument('denied-doc');
    httpMock
      .expectOne('http://localhost:8000/api/realtime/websocket-ticket/')
      .flush({ ticket: 'ticket', websocket_path: '/ws/document-events/' });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.message({ event: 'connection.ready' });
    socket.message({
      event: 'subscription.updated',
      rejected_document_uuids: ['denied-doc'],
      subscribed_document_uuids: [],
    });
    expect(service.connectionState).toBe('connected');
    socket.send.mockClear();
    service.subscribeDocument('denied-doc');
    expect(socket.send).not.toHaveBeenCalled();
  });
});
