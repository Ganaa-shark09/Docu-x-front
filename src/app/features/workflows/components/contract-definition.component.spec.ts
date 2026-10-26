import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { ContractDefinitionComponent } from './contract-definition.component';
import { environment } from '../../../../environments/environment';
import { contractDefinition, contractVersion } from '../contract-test.fixtures';
describe('Contract factory policy and authorization', () => {
  let fixture: ComponentFixture<ContractDefinitionComponent>,
    c: ContractDefinitionComponent,
    http: HttpTestingController;
  const url = environment.apiBaseUrl + '/workflows/contract-reviews/definitions/';
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ContractDefinitionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ContractDefinitionComponent);
    c = fixture.componentInstance;
    fixture.componentRef.setInput('authorized', true);
    fixture.componentRef.setInput('companyAdmin', true);
    c.code = 'invoice-verified';
    c.reviewer = { user: 7 };
    fixture.detectChanges();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  it('creates published invoice policy with typed principal and server defaults', () => {
    const created = vi.fn();
    c.created.subscribe(created);
    c.create();
    const req = http.expectOne(url);
    expect(req.request.body.reviewer).toEqual({ user: 7 });
    expect(req.request.body.policy.confidence_threshold).toBe('0.85');
    expect(req.request.body.policy.tolerance).toBeUndefined();
    expect(req.request.body.company).toBeUndefined();
    req.flush({ definition: contractDefinition, version: contractVersion });
    expect(created).toHaveBeenCalledWith(contractDefinition);
  });
  it('blocks duplicate factory clicks', () => {
    c.create();
    c.create();
    http.expectOne(url).flush({ definition: contractDefinition, version: contractVersion });
  });
  it('requires backend-authorized management context', () => {
    fixture.componentRef.setInput('authorized', false);
    c.create();
    http.expectNone(url);
  });
  it('requires reviewer assignment', () => {
    c.reviewer = null;
    c.create();
    http.expectNone(url);
  });
  it('validates confidence and tolerance without coercing strings', () => {
    c.threshold = '1.2';
    c.create();
    http.expectNone(url);
    expect(c.error()).toContain('0 to 1');
  });
  it('uses actual explicit approver and locale policy', () => {
    c.approver = { department: 3, role: 'approver' };
    c.policy.date_order = 'DMY';
    c.policy.decimal_separator = ',';
    c.create();
    const req = http.expectOne(url);
    expect(req.request.body.approver).toEqual(c.approver);
    expect(req.request.body.policy.date_order).toBe('DMY');
    req.flush({ definition: contractDefinition, version: contractVersion });
  });
  it('clears factory UI on server denial without exposing internals', () => {
    const denied = vi.fn();
    c.accessDenied.subscribe(denied);
    c.create();
    http.expectOne(url).flush({ detail: 'SECRET' }, { status: 403, statusText: 'Forbidden' });
    expect(denied).toHaveBeenCalledOnce();
    expect(c.error()).not.toContain('SECRET');
  });
  it('does not navigate after management permission changes during request', () => {
    const created = vi.fn();
    c.created.subscribe(created);
    c.create();
    fixture.componentRef.setInput('authorized', false);
    http.expectOne(url).flush({ definition: contractDefinition, version: contractVersion });
    expect(created).not.toHaveBeenCalled();
  });
});
