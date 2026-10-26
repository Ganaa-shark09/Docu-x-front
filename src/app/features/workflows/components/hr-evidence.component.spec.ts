import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { HREvidenceComponent } from './hr-evidence.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { hrDoc, hrId, hrProof, hrVersion } from '../hr-test.fixtures';
describe('HR evidence authenticated previews and revocation', () => {
  let fixture: ComponentFixture<HREvidenceComponent>,
    c: HREvidenceComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  const file = environment.apiBaseUrl + '/documents/' + hrDoc + '/preview/?scope=internal';
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:hr-source'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    TestBed.configureTestingModule({
      imports: [HREvidenceComponent],
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
    fixture = TestBed.createComponent(HREvidenceComponent);
    c = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('evidence', hrProof);
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  it('renders only supplied proof and exact offsets', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain(hrProof.preview);
    expect(text).toContain('10–50');
    expect(text).toContain('Page 2');
  });
  it('does not fabricate a page when unavailable', () => {
    fixture.componentRef.setInput('evidence', { ...hrProof, page: null });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Page Unavailable');
  });
  it.each(['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])(
    'previews authenticated %s Blob',
    (type) => {
      c.preview();
      const r = http.expectOne(file);
      expect(r.request.responseType).toBe('blob');
      r.flush(new Blob(['source'], { type }));
      expect(c.url).toBe('blob:hr-source');
      expect(c.image).toBe(type.startsWith('image/'));
      c.close();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:hr-source');
    },
  );
  it('reauthorizes a cited version before obtaining the source', () => {
    fixture.componentRef.setInput('evidence', { ...hrProof, policy_version_uuid: hrId });
    fixture.detectChanges();
    c.preview();
    http.expectNone(file);
    http
      .expectOne(environment.apiBaseUrl + '/workflows/hr-policy-versions/' + hrId + '/')
      .flush(hrVersion);
    http.expectOne(file).flush(new Blob(['source'], { type: 'application/pdf' }));
    expect(c.url).toBeTruthy();
  });
  it.each([401, 403, 404])('removes evidence after denied source status %s', (status) => {
    c.preview();
    http.expectOne(file).flush(null, { status, statusText: 'Denied' });
    fixture.detectChanges();
    expect(c.revoked).toBe(true);
    expect(c.url).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(hrProof.preview);
  });
  it('does not execute HTML previews', () => {
    c.preview();
    http.expectOne(file).flush(new Blob(['<script>alert(1)</script>'], { type: 'text/html' }));
    expect(c.url).toBeNull();
    expect(c.error).toContain('unavailable');
  });
  it.each(['governance', 'realtime'])('revokes object URLs on %s changes', (kind) => {
    c.preview();
    http.expectOne(file).flush(new Blob(['source'], { type: 'application/pdf' }));
    (kind === 'governance' ? changes : revoked).next(hrDoc);
    fixture.detectChanges();
    expect(c.url).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:hr-source');
    expect(fixture.nativeElement.textContent).not.toContain(hrProof.preview);
  });
  it('cancels late source responses after closing', () => {
    c.preview();
    const request = http.expectOne(file);
    c.close();
    expect(request.cancelled).toBe(true);
    expect(c.url).toBeNull();
  });
  it('cleans up object URLs when destroyed', () => {
    c.preview();
    http.expectOne(file).flush(new Blob(['source'], { type: 'image/png' }));
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:hr-source');
  });
});
