import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { RFPLegalReferenceComponent } from './rfp-legal-reference.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { environment } from '../../../../environments/environment';
import { rfpId, rfpDoc } from '../rfp-test.fixtures';
describe('RFP reuse of legal clause intelligence', () => {
  let fixture: ComponentFixture<RFPLegalReferenceComponent>,
    http: HttpTestingController,
    changes: Subject<string>;
  const url = environment.apiBaseUrl + '/workflows/clause-analyses/' + rfpId + '/';
  beforeEach(() => {
    changes = new Subject<string>();
    TestBed.configureTestingModule({
      imports: [RFPLegalReferenceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: DocumentGovernanceService, useValue: { changes$: changes } },
        {
          provide: DocumentRealtimeService,
          useValue: { revoked$: new Subject<string>(), subscribeDocuments: vi.fn() },
        },
      ],
    });
    fixture = TestBed.createComponent(RFPLegalReferenceComponent);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    fixture.destroy();
    http.verify({ ignoreCancelled: true });
  });
  function load() {
    fixture.componentRef.setInput('value', { analysis_uuid: rfpId });
    fixture.detectChanges();
    return http.expectOne(url);
  }
  it('links the authorized legal workflow, without another analysis engine', () => {
    load().flush({
      analysis_uuid: rfpId,
      workflow_uuid: rfpDoc,
      document_uuid: rfpDoc,
      revision: 2,
      coverage: { complete: true },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(
      '/workflows/runs/' + rfpDoc,
    );
    expect(fixture.nativeElement.textContent).toContain('Source coverage complete');
  });
  it.each([403, 404])('clears references and safely maps %s', (status) => {
    load().flush({ detail: 'SECRET_LEGAL_ERROR' }, { status, statusText: 'Denied' });
    fixture.detectChanges();
    expect(fixture.componentInstance.analysis()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('SECRET');
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });
  it('cancels reference lookup after governance change', () => {
    const r = load();
    changes.next('*');
    expect(r.cancelled).toBe(true);
    expect(fixture.componentInstance.analysis()).toBeNull();
  });
  it('does not fetch arbitrary correction values', () => {
    fixture.componentRef.setInput('value', { date: '2026-11-12' });
    fixture.detectChanges();
    http.expectNone(url);
  });
});
