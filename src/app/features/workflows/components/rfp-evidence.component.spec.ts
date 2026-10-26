import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { RFPEvidenceComponent } from './rfp-evidence.component';
import { RFPWorkflowService } from '../services/rfp-workflow.service';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { rfpProof, rfpClaim, rfpDoc } from '../rfp-test.fixtures';
describe('RFP authenticated evidence and revocation', () => {
  let fixture: ComponentFixture<RFPEvidenceComponent>,
    c: RFPEvidenceComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
    if (!URL.createObjectURL) URL.createObjectURL = () => '';
    if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rfp-source');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    TestBed.configureTestingModule({
      imports: [RFPEvidenceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DocumentGovernanceService, useValue: { changes$: changes } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: revoked, subscribeDocuments: vi.fn() },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(RFPEvidenceComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('evidence', rfpProof);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });
  function request() {
    c.preview();
    const r = http.expectOne(
      (q) => q.url === environment.apiBaseUrl + '/documents/' + rfpDoc + '/preview/',
    );
    expect(r.request.params.get('scope')).toBe('internal');
    return r;
  }
  it('uses authenticated internal document preview', () => {
    request().flush(new Blob(['image'], { type: 'image/png' }));
    fixture.detectChanges();
    expect(c.url()).toBe('blob:rfp-source');
    expect(fixture.nativeElement.querySelector('img')).toBeTruthy();
  });
  it('shows internal evidence distinctly from solicitation', () => {
    fixture.componentRef.setInput('internal', true);
    fixture.componentRef.setInput('evidence', rfpClaim);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Internal company evidence');
    expect(fixture.nativeElement.textContent).toContain('not an approved submission attachment');
  });
  it('does not invent excerpts', () => {
    expect(c.excerpt).toBe(rfpProof.preview);
    fixture.componentRef.setInput('evidence', rfpClaim);
    fixture.detectChanges();
    expect(c.excerpt).toBe(rfpClaim.quote);
  });
  it('rejects unsafe preview format', () => {
    request().flush(new Blob(['<script>'], { type: 'text/html' }));
    expect(c.url()).toBeNull();
    expect(c.error()).toContain('format is unavailable');
  });
  it('sandboxes authenticated PDF', () => {
    request().flush(new Blob(['pdf'], { type: 'application/pdf' }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe').getAttribute('sandbox')).toBe(
      'allow-same-origin',
    );
  });
  it.each([401, 403, 404])('clears protected excerpt and emits revocation on %s', (status) => {
    const revoked = vi.fn();
    TestBed.inject(RFPWorkflowService).revoked$.subscribe(revoked);
    request().flush(new Blob([]), { status, statusText: 'Denied' });
    fixture.detectChanges();
    expect(c.url()).toBeNull();
    expect(c.revoked()).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain(rfpProof.preview);
    expect(revoked).toHaveBeenCalled();
  });
  it.each(['governance', 'realtime', 'api'])('revokes object URL after %s change', (event) => {
    request().flush(new Blob(['image'], { type: 'image/png' }));
    if (event === 'api') TestBed.inject(RFPWorkflowService).revoked$.next('*');
    else (event === 'governance' ? changes : revoked).next('*');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:rfp-source');
    expect(c.url()).toBeNull();
    expect(c.revoked()).toBe(true);
  });
  it('cancels in-flight preview on revocation', () => {
    const r = request();
    revoked.next('*');
    expect(r.cancelled).toBe(true);
  });
  it('releases preview when source changes', () => {
    request().flush(new Blob(['image'], { type: 'image/png' }));
    fixture.componentRef.setInput('evidence', rfpClaim);
    fixture.detectChanges();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(c.url()).toBeNull();
  });
  it('keeps a retry available after a transient preview failure', () => {
    request().flush(new Blob([]), { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(c.revoked()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('could not be completed');
    expect(fixture.nativeElement.querySelector('button')).toBeTruthy();
  });
});
