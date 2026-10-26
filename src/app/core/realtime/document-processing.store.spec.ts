import { TestBed } from '@angular/core/testing';

import { Subject } from 'rxjs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentProcessingEvent } from './realtime.models';

import { DocumentProcessingStore } from './document-processing.store';

import { DocumentRealtimeService } from './document-realtime.service';

describe('DocumentProcessingStore', () => {
  let store: DocumentProcessingStore;

  let events: Subject<DocumentProcessingEvent>;

  const revoked = new Subject<string>();
  const realtime = {
    revoked$: revoked.asObservable(),
    events$: undefined as any,

    subscribeDocuments: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    events = new Subject<DocumentProcessingEvent>();

    realtime.events$ = events.asObservable();

    TestBed.configureTestingModule({
      providers: [
        DocumentProcessingStore,

        {
          provide: DocumentRealtimeService,

          useValue: realtime,
        },
      ],
    });

    store = TestBed.inject(DocumentProcessingStore);
  });

  it('seeds an uploaded document as queued', () => {
    store.seedDocuments([
      {
        uuid: 'document-1',

        status: 'uploaded',

        is_ai_ready: false,
      },
    ]);

    expect(store.getState('document-1')).toEqual(
      expect.objectContaining({
        documentUuid: 'document-1',

        stage: 'queued',

        status: 'uploaded',

        progress: 0,

        isAiReady: false,
      }),
    );
  });

  it('infers ready when is_ai_ready is true', () => {
    store.seedDocuments([
      {
        uuid: 'document-ready',

        status: 'processing',

        is_ai_ready: true,
      },
    ]);

    expect(store.isReady('document-ready')).toBe(true);

    expect(store.getState('document-ready')?.stage).toBe('ready');

    expect(store.getState('document-ready')?.progress).toBe(100);
  });

  it('applies realtime processing updates', () => {
    store.seedDocuments([
      {
        uuid: 'document-2',

        status: 'uploaded',
      },
    ]);

    events.next({
      event: 'document.processing.updated',

      document_uuid: 'document-2',

      status: 'processing',

      stage: 'embedding',

      progress: 74,

      is_ai_ready: false,

      is_indexed: false,

      is_ocr_completed: true,

      message: 'Generating embeddings',
    });

    const state = store.getState('document-2');

    expect(state).toEqual(
      expect.objectContaining({
        stage: 'embedding',

        progress: 74,

        isOcrCompleted: true,

        isIndexed: false,

        message: 'Generating embeddings',
      }),
    );
  });

  it('marks a document ready from a realtime terminal event', () => {
    store.seedDocuments([
      {
        uuid: 'document-3',

        status: 'processing',
      },
    ]);

    events.next({
      event: 'document.processing.updated',

      document_uuid: 'document-3',

      status: 'ready',

      stage: 'ready',

      progress: 100,

      is_ai_ready: true,

      is_indexed: true,
    });

    expect(store.isReady('document-3')).toBe(true);

    expect(store.isFailed('document-3')).toBe(false);
  });

  it('marks a document failed and retains its error', () => {
    events.next({
      event: 'document.processing.updated',

      document_uuid: 'document-failed',

      status: 'failed',

      stage: 'failed',

      progress: 0,

      error: 'Extraction failed',
    });

    expect(store.isFailed('document-failed')).toBe(true);

    expect(store.getState('document-failed')?.error).toBe('Extraction failed');
  });

  it('ignores unrelated realtime events', () => {
    events.next({
      event: 'connection.ready',
    });

    expect(store.getState('anything')).toBeUndefined();
  });

  it('subscribes realtime for seeded document UUIDs', () => {
    store.subscribeDocuments([
      {
        uuid: 'doc-a',
      },

      {
        uuid: 'doc-b',
      },
    ]);

    expect(realtime.subscribeDocuments).toHaveBeenCalledWith(['doc-a', 'doc-b']);
  });

  it('clears processing state', () => {
    store.seedDocuments([
      {
        uuid: 'document-4',

        status: 'ready',

        is_ai_ready: true,
      },
    ]);

    store.clear();

    expect(store.getState('document-4')).toBeUndefined();
  });

  it('clears readiness after revocation and ignores stale updates', () => {
    store.seedDocuments([{ uuid: 'revoked', is_ai_ready: true, status: 'ready' }]);
    revoked.next('revoked');
    expect(store.isReady('revoked')).toBe(false);
    expect(store.getState('revoked')?.status).toBe('unavailable');
    events.next({
      event: 'document.processing.updated',
      document_uuid: 'revoked',
      status: 'ready',
      is_ai_ready: true,
    });
    expect(store.isReady('revoked')).toBe(false);
    store.seedDocuments([{ uuid: 'revoked', status: 'ready', is_ai_ready: true }]);
    expect(store.isReady('revoked')).toBe(false);
  });
});
