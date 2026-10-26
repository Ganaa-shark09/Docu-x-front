import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import { DocumentDetailPageComponent } from './document-detail-page.component';
import { DocumentGovernanceComponent } from '../components/document-governance.component';
import { DocumentGovernanceService } from '../services/document-governance.service';
import { DocumentsService } from '../services/documents.service';
import { DocumentDetail } from '../models/document.model';
@Component({ selector: 'app-document-governance', standalone: true, template: '' })
class GovernanceStub {
  @Input() scope: 'internal' | 'external' = 'internal';
  @Input() document?: DocumentDetail;
  @Output() administration = new EventEmitter<boolean>();
}
const doc: DocumentDetail = {
  uuid: 'd',
  title: 'Payroll',
  document_type: 'hr',
  status: 'ready',
  sensitivity_label: 'internal',
  original_filename: 'payroll.pdf',
  file: 'https://private.test/media/old.pdf',
  file_size: 100,
  is_indexed: true,
  is_ocr_completed: true,
  is_ai_ready: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  current_user_access: 'admin',
  processing_jobs: [],
  governance: {
    owner_user: 7,
    custodian: null,
    department: null,
    sensitivity_label: 'internal',
    retention_policy: null,
    retention_duration_days: 30,
    retention_start: '2020-01-01',
    retention_expires_at: '2020-01-31',
    legal_hold: true,
    governance_revision: 1,
    retention_status: 'legal_hold',
    deletion_eligible: false,
  },
};
describe('Document security actions', () => {
  let fixture: ComponentFixture<DocumentDetailPageComponent>;
  let changes: Subject<string>;
  let documents: {
    getDocument: ReturnType<typeof vi.fn>;
    getInvoiceReadiness: ReturnType<typeof vi.fn>;
    getFile: ReturnType<typeof vi.fn>;
    deleteDocument: ReturnType<typeof vi.fn>;
  };
  const OriginalURL = globalThis.URL;
  const create = vi.fn(() => 'blob:authorized-document');
  const revoke = vi.fn();
  beforeEach(() => {
    changes = new Subject<string>();
    documents = {
      getDocument: vi.fn(() => of({ ...doc })),
      getInvoiceReadiness: vi.fn(() => of({
        status: 'ready', can_start_invoice_workflow: true, internal_ai_indexed: true,
        message: 'Server verified', checks: [{ key: 'invoice_number', present: true }],
        missing_signals: [],
      })),
      getFile: vi.fn(() => of(new Blob(['authorized'], { type: 'application/pdf' }))),
      deleteDocument: vi.fn(() => of(undefined)),
    };
    class TestURL extends OriginalURL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    }
    vi.stubGlobal('URL', TestURL);
    create.mockClear();
    revoke.mockClear();
    TestBed.configureTestingModule({
      imports: [DocumentDetailPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: new Subject<string>().asObservable(), subscribeDocument: vi.fn() },
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ uuid: 'd' }) } },
        },
        { provide: DocumentsService, useValue: documents },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes.asObservable(), get: vi.fn(() => of(doc.governance)) },
        },
      ],
    });
    TestBed.overrideComponent(DocumentDetailPageComponent, {
      remove: { imports: [DocumentGovernanceComponent] },
      add: { imports: [GovernanceStub] },
    });
    fixture = TestBed.createComponent(DocumentDetailPageComponent);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    vi.unstubAllGlobals();
  });
  it('offers Prepare invoice workflow only for a ready internal invoice with edit-level access', () => {
    // Supply the invoice through the document service before the first render.
    fixture.destroy();
    documents.getDocument.mockReturnValue(of({
      ...doc,
      document_type: 'invoice',
      title: 'Invoice 02',
      original_filename: 'invoice-02.pdf',
      current_user_access: 'edit',
    }));
    fixture = TestBed.createComponent(DocumentDetailPageComponent);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.document-detail-page__button--invoice');
    expect(button).not.toBeNull();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button!.click();
    expect(navigate).toHaveBeenCalledWith(['/workflows/invoice-batches'], {
      queryParams: { document: 'd' },
    });
  });

  it('keeps the workflow action disabled when server preflight blocks an invoice', () => {
    fixture.destroy();
    documents.getDocument.mockReturnValue(of({ ...doc, document_type: 'invoice', title: 'Invoice' }));
    documents.getInvoiceReadiness.mockReturnValue(of({
      status: 'blocked', can_start_invoice_workflow: false, internal_ai_indexed: false,
      message: 'Document content resembles another type.', checks: [], missing_signals: [],
    }));
    fixture = TestBed.createComponent(DocumentDetailPageComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.canPrepareInvoiceWorkflow).toBe(false);
    const button = (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.document-detail-page__button--invoice');
    expect(button?.disabled).toBe(true);
  });

  it('does not expose invoice processing for mislabeled, unready or read-only documents', () => {
    const component = fixture.componentInstance;
    component.document = { ...doc, document_type: 'contract' };
    expect(component.canPrepareInvoiceWorkflow).toBe(false);
    component.document = { ...doc, document_type: 'invoice', status: 'processing' };
    expect(component.canPrepareInvoiceWorkflow).toBe(false);
    component.document = { ...doc, document_type: 'invoice', current_user_access: 'view' };
    expect(component.canPrepareInvoiceWorkflow).toBe(false);
    component.metadataOnly = true;
    expect(component.canPrepareInvoiceWorkflow).toBe(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    component.prepareInvoiceWorkflow();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not offer deletion under legal hold', () => {
    expect(fixture.componentInstance.canDelete).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Delete');
    fixture.componentInstance.deleteDocument();
    expect(documents.deleteDocument).not.toHaveBeenCalled();
  });
  it('offers disposition only when server reports eligibility and admin access', () => {
    fixture.componentInstance.document = {
      ...doc,
      governance: { ...doc.governance!, legal_hold: false, deletion_eligible: true },
    };
    expect(fixture.componentInstance.canDelete).toBe(true);
    fixture.componentInstance.document.current_user_access = 'view';
    expect(fixture.componentInstance.canDelete).toBe(false);
  });
  it('requests preview bytes from the authenticated service rather than static file URLs', () => {
    fixture.componentInstance.openFile();
    expect(documents.getFile).toHaveBeenCalledWith('d', 'preview', 'internal');
    expect(fixture.componentInstance.previewSafeUrl).not.toBeNull();
    fixture.componentInstance.closePreview();
    expect(revoke).toHaveBeenCalledWith('blob:authorized-document');
  });
  it('closes cached previews and reloads after governance revocation', () => {
    fixture.componentInstance.openFile();
    changes.next('d');
    expect(revoke).toHaveBeenCalledWith('blob:authorized-document');
    expect(fixture.componentInstance.previewSafeUrl).toBeNull();
    expect(documents.getDocument).toHaveBeenCalledTimes(2);
  });
  it('drops document display data after file access is denied', () => {
    documents.getFile.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 403, error: { detail: 'File access revoked.' } }),
      ),
    );
    fixture.componentInstance.openFile();
    expect(fixture.componentInstance.document).toBeNull();
    expect(fixture.componentInstance.errorMessage).toContain('revoked');
    expect(create).not.toHaveBeenCalled();
  });
  it('uses the governance endpoint when document content is unavailable', () => {
    documents.getDocument.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    fixture.componentInstance.loadDocument();
    expect(fixture.componentInstance.metadataOnly).toBe(true);
    expect(fixture.componentInstance.document?.governance?.legal_hold).toBe(true);
    expect(fixture.componentInstance.document?.file).toBeUndefined();
  });
});
