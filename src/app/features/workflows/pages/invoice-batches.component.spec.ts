import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { InvoiceBatchesComponent } from './invoice-batches.component';

describe('Invoice batch workspace', () => {
  const base = environment.apiBaseUrl;
  let http: HttpTestingController;
  let handoffQuery: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  const definition = { uuid: 'definition-1', name: 'Invoice AP', code: 'invoice-ap', workflow_type: 'invoice',
    department: null, is_active: true, latest_version: { uuid: 'version-1', number: 1 },
    capabilities: { administer: true, start: true } };
  const emptyPage = { count: 0, next: null, previous: null, results: [] };
  const batch = { uuid: 'batch-1', name: 'October AP', version_uuid: 'version-1', created_at: '2026-10-23T00:00:00Z',
    progress: { total: 1, completed: 0, review: 0, failed: 0, processing: 1 },
    items: [{ uuid: 'item-1', position: 1, document_uuid: 'document-1', run_uuid: 'run-1',
      status: 'queued', error_code: '', error_message: '' }] };

  beforeEach(() => {
    handoffQuery = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: {
        paramMap: of(convertToParamMap({})),
        queryParamMap: handoffQuery.asObservable(),
      } },
    ] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  function open() {
    const fixture = TestBed.createComponent(InvoiceBatchesComponent);
    http.expectOne((request) => request.url === base + '/workflows/invoice-batches/').flush(emptyPage);
    http.expectOne((request) => request.url === base + '/workflows/definitions/').flush({ ...emptyPage, results: [definition] });
    http.expectOne((request) => request.url === base + '/documents/').flush([]);
    http.expectOne(base + '/workspaces/departments/').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('uploads a real document before starting one workflow run per invoice', () => {
    const fixture = open();
    const component = fixture.componentInstance;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.name = 'October AP';
    component.filesChanged({ target: { files: [new File(['invoice'], 'invoice.pdf', { type: 'application/pdf' })] } } as unknown as Event);
    component.submit();
    const upload = http.expectOne(base + '/documents/');
    expect(upload.request.body.get('document_type')).toBe('invoice');
    expect(upload.request.body.get('file').name).toBe('invoice.pdf');
    upload.flush({ uuid: 'document-1', title: 'invoice.pdf' });
    const create = http.expectOne(base + '/workflows/invoice-batches/');
    expect(create.request.body.documents).toEqual(['document-1']);
    expect(create.request.body.version).toBe('version-1');
    expect(create.request.body.idempotency_key).toBeTruthy();
    create.flush(batch);
    expect(component.pending()).toBe(false);
  });

  it('keeps an accepted upload and retries only remaining files after a partial failure', () => {
    const component = open().componentInstance;
    component.name = 'October AP';
    component.filesChanged({ target: { files: [new File(['one'], 'one.pdf'), new File(['two'], 'two.pdf')] } } as unknown as Event);
    component.submit();
    http.expectOne(base + '/documents/').flush({ uuid: 'document-1' });
    http.expectOne(base + '/documents/').flush({}, { status: 500, statusText: 'Unavailable' });
    expect(component.uploadedIds()).toEqual(['document-1']);
    expect(component.pendingFiles()).toHaveLength(1);
    expect(component.pending()).toBe(false);
  });

  it('appends new file selections, skips already queued files and permits removing a queued item', () => {
    const fixture = open();
    const component = fixture.componentInstance;
    const first = new File(['first'], 'first.pdf', { type: 'application/pdf', lastModified: 10 });
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf', lastModified: 20 });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [first] });
    component.filesChanged({ target: input } as unknown as Event);
    Object.defineProperty(input, 'files', { configurable: true, value: [first, second] });
    component.filesChanged({ target: input } as unknown as Event);
    expect(component.pendingFiles().map((file) => file.name)).toEqual(['first.pdf', 'second.pdf']);
    expect(component.uploadError()).toContain('already in the upload queue');
    component.removePendingFile(0);
    expect(component.pendingFiles().map((file) => file.name)).toEqual(['second.pdf']);
    expect(component.selectedCount()).toBe(1);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('1 / 500 invoices selected');
  });

  it('shows upload progress and preserves accepted documents on partial failure and retry', () => {
    const component = open().componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.name = 'October AP';
    component.filesChanged({ target: { files: [new File(['a'], 'first.pdf'), new File(['b'], 'second.pdf')] } } as unknown as Event);
    component.submit();
    expect(component.uploadStatus()).toBe('Uploading invoice 1 of 2…');
    http.expectOne(base + '/documents/').flush({ uuid: 'accepted-1' });
    expect(component.uploadStatus()).toBe('Uploading invoice 2 of 2…');
    http.expectOne(base + '/documents/').flush({}, { status: 500, statusText: 'Unavailable' });
    expect(component.pendingFiles()).toHaveLength(1);
    expect(component.uploadedIds()).toEqual(['accepted-1']);
    expect(component.selectedCount()).toBe(2);
    expect(component.uploadStatus()).toBe('');
    component.submit();
    http.expectOne(base + '/documents/').flush({ uuid: 'accepted-2' });
    const create = http.expectOne(base + '/workflows/invoice-batches/');
    expect(create.request.body.documents).toEqual(['accepted-1', 'accepted-2']);
    create.flush(batch);
    expect(navigate).toHaveBeenCalledWith(['/workflows/invoice-batches', batch.uuid]);
    expect(component.uploadedIds()).toEqual([]);
    expect(component.pendingFiles()).toEqual([]);
    expect(component.pending()).toBe(false);
  });

  it('filters only already-authorized document titles and shows the three-step intake', () => {
    const fixture = open();
    const component = fixture.componentInstance;
    component.documents.set([
      { uuid: 'd1', title: 'Apex Invoice', original_filename: 'apex.pdf' },
      { uuid: 'd2', title: 'Beta Invoice', original_filename: 'beta.pdf' },
    ] as never);
    component.existingSearch = 'apex';
    expect(component.visibleDocuments().map((doc) => doc.uuid)).toEqual(['d1']);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.textContent).toContain('Name and workflow');
    expect(page.textContent).toContain('Add invoice sources');
    expect(page.textContent).toContain('Governance and start');
    expect(page.textContent).toContain('Apex Invoice');
    expect(page.textContent).not.toContain('Beta Invoice');
  });

  it('clears stale batch history after access is revoked', () => {
    const component = open().componentInstance;
    component.batches.set({ ...emptyPage, results: [batch], count: 1 } as never);
    component.load();
    http.expectOne((request) => request.url === base + '/workflows/invoice-batches/')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne((request) => request.url === base + '/workflows/definitions/').flush({ ...emptyPage, results: [definition] });
    http.expectOne((request) => request.url === base + '/documents/').flush([]);
    http.expectOne(base + '/workspaces/departments/').flush([]);
    expect(component.batches()).toBeNull();
    expect(component.error()).toContain('permissions');
  });

  const invoiceUuid = '123e4567-e89b-42d3-a456-426614174000';
  const invoiceDetail = {
    uuid: invoiceUuid, title: 'Approved source invoice', document_type: 'invoice',
    original_filename: 'invoice.pdf', status: 'ready', sensitivity_label: 'restricted',
    current_user_access: 'edit',
  };

  function openWithHandoff(uuid = invoiceUuid) {
    handoffQuery.next(convertToParamMap({ document: uuid }));
    return open();
  }

  it('resolves a document deep link through an authorized internal read without auto-starting any workflow', () => {
    const fixture = openWithHandoff();
    const request = http.expectOne(base + '/documents/' + invoiceUuid + '/');
    expect(request.request.method).toBe('GET');
    request.flush(invoiceDetail);
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedDocuments()).toEqual([invoiceUuid]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Selected from Documents');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Approved source invoice');
    // Neither batch creation nor AI execution happens because of a link alone.
    expect(fixture.componentInstance.pending()).toBe(false);
    expect(fixture.componentInstance.handoffError()).toBe('');
  });

  it('fails closed for mislabeled non-invoices or read-only sources', () => {
    const fixture = openWithHandoff();
    http.expectOne(base + '/documents/' + invoiceUuid + '/').flush({
      ...invoiceDetail, document_type: 'contract',
    });
    expect(fixture.componentInstance.selectedDocuments()).toEqual([]);
    expect(fixture.componentInstance.handoffDocument()).toBeNull();
    expect(fixture.componentInstance.handoffError()).toContain('cannot be prepared');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Approved source invoice');
  });

  it('does not preselect a document if the internal detail endpoint denies access', () => {
    const fixture = openWithHandoff();
    http.expectOne(base + '/documents/' + invoiceUuid + '/').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(fixture.componentInstance.selectedDocuments()).toEqual([]);
    expect(fixture.componentInstance.handoffDocument()).toBeNull();
    expect(fixture.componentInstance.handoffError()).toContain('unavailable');
  });

  it('rejects an invalid deep link without requesting a document or starting any workflow', () => {
    const fixture = openWithHandoff('not-a-document-uuid');
    expect(fixture.componentInstance.selectedDocuments()).toEqual([]);
    expect(fixture.componentInstance.handoffError()).toContain('Invalid invoice document link');
  });

  it('shows a published-workflow setup action and blocks processing if none exists', () => {
    const fixture = open();
    const component = fixture.componentInstance;
    component.definitions.set([]);
    component.selectedDocuments.set([invoiceUuid]);
    component.name = 'October accounts payable';
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Invoice processing is not configured yet');
    component.submit();
    expect(component.pending()).toBe(false);
    expect(component.uploadError()).toContain('published invoice workflow');
  });

  it('does not expose a batch when its detail endpoint denies access', () => {
    const component = open().componentInstance;
    component.loadDetail('batch-1');
    http.expectOne(base + '/workflows/invoice-batches/batch-1/').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(component.selected()).toBeNull();
    expect(component.error()).toContain('permissions');
  });
});
