import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { LegalDefinitionComponent } from './legal-definition.component';
import { ContractDefinitionComponent } from './contract-definition.component';
import { environment } from '../../../../environments/environment';
import { definition, version, uuid } from '../workflow-test.fixtures';
describe('Legal canonical workflow factory and contract opt in', () => {
  let fixture: ComponentFixture<LegalDefinitionComponent>, http: HttpTestingController;
  const url = environment.apiBaseUrl + '/workflows/clause-analyses/definitions/';
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LegalDefinitionComponent, ContractDefinitionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LegalDefinitionComponent);
    fixture.componentRef.setInput('authorized', true);
    fixture.componentRef.setInput('companyAdmin', true);
    fixture.componentInstance.code = 'legal-review';
    fixture.componentInstance.reviewer = { user: 7 };
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });
  it('uses canonical legal definition factory with backend automatic playbook selection', () => {
    fixture.componentInstance.create();
    const r = http.expectOne(url);
    expect(r.request.body.policy).toEqual({ use_ai: false, playbook_version: null });
    expect(r.request.body.reviewer).toEqual({ user: 7 });
    expect(r.request.body.company).toBeUndefined();
    r.flush({ definition, version });
  });
  it('requires explicit immutable version when pinning', () => {
    fixture.componentInstance.pin = true;
    fixture.componentInstance.create();
    http.expectNone(url);
  });
  it('sends selected immutable playbook version', () => {
    fixture.componentInstance.pin = true;
    fixture.componentInstance.version = uuid;
    fixture.componentInstance.create();
    const r = http.expectOne(url);
    expect(r.request.body.policy.playbook_version).toBe(uuid);
    r.flush({ definition, version });
  });
  it('prevents duplicate legal factory submissions', () => {
    fixture.componentInstance.create();
    fixture.componentInstance.create();
    http.expectOne(url).flush({ definition, version });
  });
  it('blocks unauthorized legal workflow creation', () => {
    fixture.componentRef.setInput('authorized', false);
    fixture.componentInstance.create();
    http.expectNone(url);
  });
  it('does not expose raw provider failures', () => {
    fixture.componentInstance.create();
    http
      .expectOne(url)
      .flush({ detail: 'private diagnostic' }, { status: 500, statusText: 'Failure' });
    expect(fixture.componentInstance.error()).not.toContain('private diagnostic');
  });
  it('preserves optional contract policy unless legal layer is explicitly enabled', () => {
    const contract = TestBed.createComponent(ContractDefinitionComponent);
    contract.componentRef.setInput('authorized', true);
    contract.componentRef.setInput('companyAdmin', true);
    const c = contract.componentInstance;
    c.code = 'contract';
    c.reviewer = { user: 7 };
    c.create();
    const r = http.expectOne(environment.apiBaseUrl + '/workflows/contract-reviews/definitions/');
    expect(r.request.body.policy.clause_playbook_version).toBeUndefined();
    r.flush({ definition, version });
    contract.destroy();
  });
  it('pins legal policy in the existing contract factory when enabled', () => {
    const contract = TestBed.createComponent(ContractDefinitionComponent);
    contract.componentRef.setInput('authorized', true);
    contract.componentRef.setInput('companyAdmin', true);
    const c = contract.componentInstance;
    c.code = 'contract';
    c.reviewer = { user: 7 };
    c.legalEnabled = true;
    c.legalVersion = uuid;
    c.create();
    const r = http.expectOne(environment.apiBaseUrl + '/workflows/contract-reviews/definitions/');
    expect(r.request.body.policy.clause_playbook_version).toBe(uuid);
    r.flush({ definition, version });
    contract.destroy();
  });
});
