import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { environment } from '../../../../environments/environment';
import { DocumentGovernanceService } from './document-governance.service';
import { DocumentsService } from './documents.service';
describe('Governance API contracts', () => {
  let service: DocumentGovernanceService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentGovernanceService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('loads every policy page without trusting server-provided URL origins', async () => {
    const result = firstValueFrom(service.sensitivity());
    http
      .expectOne(
        (req) => req.url.endsWith('/sensitivity-policies/') && req.params.get('page') === '1',
      )
      .flush({ results: [{ code: 'custom-a' }], next: 'https://untrusted.test/' });
    http
      .expectOne(
        (req) =>
          req.url === `${environment.apiBaseUrl}/documents/sensitivity-policies/` &&
          req.params.get('page') === '2',
      )
      .flush({ results: [{ code: 'custom-b' }], next: null });
    expect((await result).map((p) => p.code)).toEqual(['custom-a', 'custom-b']);
  });
  it('creates and updates sensitivity policies at confirmed endpoints', async () => {
    const data = {
      code: 'custom',
      name: 'Custom',
      security_class: 'restricted' as const,
      minimum_access: 'review' as const,
      allow_ai: false,
      allow_export: false,
      allow_cloud: false,
      is_active: true,
    };
    const create = firstValueFrom(service.saveSensitivity(data));
    const request = http.expectOne(`${environment.apiBaseUrl}/documents/sensitivity-policies/`);
    expect(request.request.method).toBe('POST');
    request.flush({ uuid: 's', ...data });
    await create;
    const edit = firstValueFrom(service.saveSensitivity({ ...data, name: 'Changed' }, 's'));
    const update = http.expectOne(`${environment.apiBaseUrl}/documents/sensitivity-policies/s/`);
    expect(update.request.method).toBe('PATCH');
    update.flush({ uuid: 's', ...data, name: 'Changed' });
    expect((await edit).name).toBe('Changed');
  });
  it('creates retention policy with a positive duration', async () => {
    const result = firstValueFrom(
      service.saveRetention({ name: 'Audit', duration_days: 365, is_active: true }),
    );
    const request = http.expectOne(`${environment.apiBaseUrl}/documents/retention-policies/`);
    expect(request.request.body.duration_days).toBe(365);
    request.flush({ uuid: 'r', name: 'Audit', duration_days: 365, is_active: true });
    await result;
  });
  it('uses authenticated internal preview and explicit external download routes without URL tokens', async () => {
    const documents = TestBed.inject(DocumentsService);
    for (const scope of ['internal', 'external'] as const) {
      const action = scope === 'internal' ? 'preview' : 'download';
      const result = firstValueFrom(documents.getFile('d', action, scope));
      const request = http.expectOne(
        (req) => req.url === `${environment.apiBaseUrl}/documents/d/${action}/`,
      );
      expect(request.request.params.get('scope')).toBe(scope);
      expect(request.request.params.has('token')).toBe(false);
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['document']));
      await result;
    }
  });

  it('keeps external governance and revocation explicitly scoped', async () => {
    const result = firstValueFrom(service.get('external-doc', 'external'));
    const request = http.expectOne(
      `${environment.apiBaseUrl}/documents/external-doc/governance/?scope=external`,
    );
    expect(request.request.method).toBe('GET');
    request.flush({ governance_revision: 2 });
    await result;
    const revoke = firstValueFrom(service.revoke('external-doc', 'rule', 'access', 'external'));
    const deletion = http.expectOne(
      `${environment.apiBaseUrl}/documents/external-doc/access-policies/rule/?scope=external`,
    );
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null);
    await revoke;
  });
});
