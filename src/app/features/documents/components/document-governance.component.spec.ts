import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentGovernanceComponent } from './document-governance.component';
import { DocumentDetail } from '../models/document.model';
import { DocumentGovernance } from '../models/governance.model';
import { DocumentGovernanceService } from '../services/document-governance.service';
import { environment } from '../../../../environments/environment';
const g: DocumentGovernance = {
  owner_user: 7,
  custodian: null,
  department: 2,
  sensitivity_label: 'payroll-private',
  retention_policy: 'r1',
  retention_duration_days: 30,
  retention_start: '2020-01-01T00:00:00Z',
  retention_expires_at: '2020-01-31T00:00:00Z',
  legal_hold: true,
  governance_revision: 3,
  retention_status: 'legal_hold',
  deletion_eligible: false,
};
const doc: DocumentDetail = {
  uuid: 'd1',
  title: 'Payroll',
  document_type: 'hr',
  status: 'ready',
  sensitivity_label: 'payroll-private',
  original_filename: 'payroll.pdf',
  file_size: 100,
  is_indexed: true,
  is_ocr_completed: true,
  is_ai_ready: true,
  created_at: '2020-01-01',
  updated_at: '2020-01-01',
  department_name: 'Finance',
  uploaded_by_email: 'uploader@example.test',
  current_user_access: 'admin',
  governance: g,
  access_policies: [
    {
      uuid: 'grant',
      user: 7,
      user_email: 'owner@example.test',
      access_level: 'view',
      can_download: true,
      can_export: false,
      can_use_ai: true,
      created_at: '2020-01-01',
      updated_at: '2020-01-01',
    },
  ],
};
describe('Document governance UI', () => {
  let fixture: ComponentFixture<DocumentGovernanceComponent>;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DocumentGovernanceComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DocumentGovernanceComponent);
    fixture.componentRef.setInput('document', doc);
    fixture.detectChanges();
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });
  function flush(admin = true): void {
    http.expectOne(`${environment.apiBaseUrl}/documents/d1/governance/`).flush(g);
    const fields = http.expectOne(`${environment.apiBaseUrl}/documents/d1/field-policies/`);
    if (admin)
      fields.flush([
        {
          uuid: 'salary-rule',
          field_key: 'salary',
          user: null,
          role: '',
          can_view: false,
          can_use_ai: false,
          can_export: false,
          masked_view: true,
        },
      ]);
    else fields.flush({ detail: 'Not permitted.' }, { status: 403, statusText: 'Forbidden' });
    const policies = http.expectOne((req) => req.url.endsWith('/sensitivity-policies/'));
    if (admin)
      policies.flush([
        {
          uuid: 's1',
          code: 'payroll-private',
          name: 'Private payroll',
          security_class: 'restricted',
          minimum_access: 'view',
          allow_ai: false,
          allow_export: false,
          allow_cloud: false,
          is_active: true,
        },
      ]);
    else policies.flush({ detail: 'Not permitted.' }, { status: 403, statusText: 'Forbidden' });
    http
      .expectOne((req) => req.url.endsWith('/retention-policies/'))
      .flush([{ uuid: 'r1', name: '30-day payroll', duration_days: 30, is_active: true }]);
    http
      .expectOne((req) => req.url.endsWith('/memberships/'))
      .flush([
        {
          uuid: 'm1',
          user: 7,
          user_email: 'owner@example.test',
          username: 'owner',
          department: 2,
          department_name: 'Finance',
          role: 'member',
          is_active: true,
        },
      ]);
    fixture.detectChanges();
  }
  it('renders ownership, uploader, retention expiry and legal hold separately', () => {
    flush();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('owner@example.test');
    expect(text).toContain('uploader@example.test');
    expect(text).toContain('30-day payroll');
    expect(text).toContain('Active ? deletion blocked');
    expect(text).toContain('Expired');
    expect(text).toContain('Not eligible for deletion');
  });
  it('uses server-defined sensitivity policies in the selector', () => {
    flush();
    fixture.componentInstance.beginEdit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select[name=sensitivity]').textContent).toContain(
      'Private payroll',
    );
  });
  it('does not expose administrator controls when protected reads are denied', () => {
    flush(false);
    expect(fixture.componentInstance.canAdminister).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Edit governance');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('sends the exact revision and supported ownership fields', () => {
    flush();
    fixture.componentInstance.beginEdit();
    fixture.componentInstance.draft.custodian = 7;
    fixture.componentInstance.save();
    const request = http.expectOne(`${environment.apiBaseUrl}/documents/d1/governance/`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body.expected_revision).toBe(3);
    expect(request.request.body.custodian).toBe(7);
    expect(request.request.body.company).toBeUndefined();
    request.flush({ ...g, custodian: 7, governance_revision: 4 });
    flush();
  });
  it('preserves valid governance and explains a rejected mutation', () => {
    flush();
    fixture.componentInstance.beginEdit();
    fixture.componentInstance.draft.legal_hold = false;
    fixture.componentInstance.save();
    http
      .expectOne(`${environment.apiBaseUrl}/documents/d1/governance/`)
      .flush(
        { detail: 'Organization administrator authority is required.' },
        { status: 403, statusText: 'Forbidden' },
      );
    flush();
    expect(fixture.componentInstance.governance?.legal_hold).toBe(true);
    expect(fixture.componentInstance.error).toContain('administrator authority');
    expect(fixture.componentInstance.editing).toBe(false);
  });
  it('displays field masking and AI/export restrictions without field values', () => {
    flush();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('salary');
    expect(text).toContain('Masked');
    expect(text).toContain('AI restricted');
    expect(text).toContain('Export restricted');
    expect(text).not.toContain('secret-payroll');
  });
  it('revocation uses DELETE and refreshes authoritative state', () => {
    flush();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const invalidate = vi.spyOn(TestBed.inject(DocumentGovernanceService), 'invalidate');
    fixture.componentInstance.revoke('grant', 'access');
    const request = http.expectOne(`${environment.apiBaseUrl}/documents/d1/access-policies/grant/`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(invalidate).toHaveBeenCalledWith('d1');
    flush();
  });
  it('field rules contain only permission configuration', () => {
    flush();
    fixture.componentInstance.rule.field_key = 'bank_details';
    fixture.componentInstance.addField();
    const request = http.expectOne(`${environment.apiBaseUrl}/documents/d1/field-policies/`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      field_key: 'bank_details',
      user: null,
      role: '',
      can_view: false,
      can_use_ai: false,
      can_export: false,
      masked_view: true,
    });
    request.flush({ uuid: 'rule', ...request.request.body });
    flush();
  });
});
