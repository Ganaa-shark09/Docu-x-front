import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentListPageComponent } from './document-list-page.component';
import { DocumentsService } from '../services/documents.service';
import { DocumentListRecord } from '../models/document.model';
import { DocumentGovernanceService } from '../services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { DocumentProcessingStore } from '../../../core/realtime/document-processing.store';

describe('Document navigation request safety', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const requests: Subject<DocumentListRecord[]>[] = [];
    const revoked = new Subject<string>();
    const api = {
      getDepartments: () => of([]),
      getDocuments: vi.fn(() => {
        const request = new Subject<DocumentListRecord[]>();
        requests.push(request);
        return request.asObservable();
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { data: of({ scope: 'internal' }) } },
        { provide: DocumentsService, useValue: api },
        { provide: DocumentGovernanceService, useValue: { changes$: new Subject() } },
        { provide: DocumentRealtimeService, useValue: { revoked$: revoked } },
        {
          provide: DocumentProcessingStore,
          useValue: { states$: new Subject(), subscribeDocuments: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocumentListPageComponent);
    fixture.detectChanges();
    return { fixture, requests, revoked };
  }
  const record = { uuid: 'synthetic-document', title: 'Authorized document' } as DocumentListRecord;
  it('loads immediately and accepts only the latest filter response', () => {
    const { fixture, requests } = setup();
    expect(requests).toHaveLength(1);
    fixture.componentInstance.loadDocuments();
    expect(requests[0].observed).toBe(false);
    requests[1].next([record]);
    requests[0].next([]);
    expect(fixture.componentInstance.documents).toEqual([record]);
  });
  it('clears revoked records and cancels the pending response before reloading permissions', () => {
    const { fixture, requests, revoked } = setup();
    requests[0].next([record]);
    revoked.next(record.uuid);
    expect(fixture.componentInstance.documents).toEqual([]);
    expect(requests[0].observed).toBe(false);
    requests[0].next([record]);
    expect(fixture.componentInstance.documents).toEqual([]);
    requests[1].next([]);
    expect(fixture.componentInstance.isLoading).toBe(false);
  });
  it('cancels the outstanding request when leaving the page', () => {
    const { fixture, requests } = setup();
    fixture.destroy();
    expect(requests[0].observed).toBe(false);
  });
});
