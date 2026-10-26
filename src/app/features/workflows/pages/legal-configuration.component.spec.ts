import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { LegalConfigurationComponent } from './legal-configuration.component';
import { DocumentGovernanceService } from '../../documents/services/document-governance.service';
import { DocumentRealtimeService } from '../../../core/realtime/document-realtime.service';
import { LegalClauseService } from '../services/legal-clause.service';
import { environment } from '../../../../environments/environment';
import { legalBook, legalType, legalVersion } from '../legal-test.fixtures';
import { uuid, page } from '../workflow-test.fixtures';
describe('Authorized legal configuration and immutable publication', () => {
  let fixture: ComponentFixture<LegalConfigurationComponent>,
    c: LegalConfigurationComponent,
    http: HttpTestingController,
    changes: Subject<string>,
    revoked: Subject<string>;
  const root = environment.apiBaseUrl + '/workflows';
  function setup(mode = 'playbooks', id = uuid, role = 'company_admin') {
    TestBed.configureTestingModule({
      imports: [LegalConfigurationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap(id ? { uuid: id } : {})),
            snapshot: { data: { mode } },
          },
        },
        {
          provide: DocumentGovernanceService,
          useValue: { changes$: changes, memberships: () => of([]) },
        },
        { provide: DocumentRealtimeService, useValue: { revoked$: revoked } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LegalConfigurationComponent);
    c = fixture.componentInstance;
    http.expectOne(environment.apiBaseUrl + '/auth/profile/').flush({ id: 1, role });
    if (id) {
      http.expectOne(root + '/clause-playbooks/' + id + '/').flush(legalBook);
      http
        .expectOne((r) => r.url === root + '/clause-playbooks/' + id + '/versions/')
        .flush(page([legalVersion]));
      http.expectOne((r) => r.url === root + '/clause-types/').flush(page([legalType]));
    } else if (mode === 'taxonomy')
      http
        .expectOne((r) => r.url === root + '/clause-types/')
        .flush(page([legalType, { ...legalType, uuid: 'company', scope: 'company' }]));
    else http.expectOne((r) => r.url === root + '/clause-playbooks/').flush(page([legalBook]));
    fixture.detectChanges();
  }
  beforeEach(() => {
    changes = new Subject();
    revoked = new Subject();
  });
  afterEach(() => {
    fixture?.destroy();
    http?.verify({ ignoreCancelled: true });
  });
  it('distinguishes draft from immutable published versions', async () => {
    setup();
    expect(fixture.nativeElement.textContent).toContain('Editable draft');
    c.inspect(legalVersion);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Immutable published version 2');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-legal-rule-editor input').disabled).toBe(true);
  });
  it('uses frozen version taxonomy even after company edits', () => {
    setup();
    c.types.set([{ ...legalType, name: 'Changed taxonomy' }]);
    c.inspect(legalVersion);
    expect(c.editorTaxonomy()[0].name).toBe('Liability cap');
  });
  it('never mutates published version rules', () => {
    setup();
    c.inspect(legalVersion);
    c.rules[0].code = 'draft_change';
    expect(legalVersion.rules[0].code).toBe('liability_cap');
  });
  it('does not show administrator controls to ordinary members', () => {
    setup('playbooks', uuid, 'member');
    expect(c.manage()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Publish saved draft');
  });
  it('keeps system clause types read only for administrators', () => {
    setup('taxonomy', '');
    c.newType(legalType);
    expect(c.typeEditor).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Protected system type');
  });
  it('supports company extensions through structured fact editors', () => {
    setup('taxonomy', '');
    c.newType();
    expect(c.typeEditor).not.toBeNull();
    expect(c.facts).toEqual([]);
  });
  it('prevents ordinary members from editing company taxonomy', () => {
    setup('taxonomy', '', 'member');
    c.newType({ ...legalType, scope: 'company' });
    expect(c.typeEditor).toBeNull();
  });
  it('requires deliberate publication confirmation', () => {
    setup();
    c.publish();
    http.expectNone(root + '/clause-playbooks/' + uuid + '/publish/');
  });
  it('blocks publication with unsaved changes', () => {
    setup();
    c.rules[0].code = 'new_requirement';
    c.publishConfirmed = true;
    c.publish();
    http.expectNone(root + '/clause-playbooks/' + uuid + '/publish/');
    expect(c.draftDirty()).toBe(true);
  });
  it('sends current revision on publication', () => {
    setup();
    c.publishConfirmed = true;
    c.publish();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/publish/');
    expect(r.request.body.expected_revision).toBe(4);
    r.flush(legalVersion);
    http.expectOne(root + '/clause-playbooks/' + uuid + '/').flush(legalBook);
    http.expectOne((r) => r.url.endsWith('/versions/')).flush(page([legalVersion]));
    http.expectOne((r) => r.url === root + '/clause-types/').flush(page([legalType]));
  });
  it('blocks repeated publication while pending', () => {
    setup();
    c.publishConfirmed = true;
    c.publish();
    c.publish();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/publish/');
    r.flush({}, { status: 400, statusText: 'Invalid' });
    expect(c.pending()).toBe(false);
  });
  it('saves ISO dates without datetime conversion', () => {
    setup();
    c.effectiveFrom = '2026-10-05';
    c.effectiveUntil = '2027-10-05';
    c.save();
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/draft/');
    expect(r.request.body.draft.effective_from).toBe('2026-10-05');
    expect(r.request.body.draft.effective_until).toBe('2027-10-05');
    r.flush({ ...legalBook, draft: r.request.body.draft });
  });
  it('rejects inverted effective dates', () => {
    setup();
    c.effectiveFrom = '2027-10-05';
    c.effectiveUntil = '2026-10-05';
    c.save();
    http.expectNone(root + '/clause-playbooks/' + uuid + '/draft/');
    expect(c.error()).toContain('effective end');
  });
  it('requires activation confirmation', () => {
    setup();
    c.activate(false);
    http.expectNone(root + '/clause-playbooks/' + uuid + '/activate/');
  });
  it('activates the selected historical version by UUID', () => {
    setup();
    c.activationConfirmed = true;
    c.activate(true, legalVersion.uuid);
    const r = http.expectOne(root + '/clause-playbooks/' + uuid + '/activate/');
    expect(r.request.body).toEqual({
      expected_revision: 4,
      active: true,
      version: legalVersion.uuid,
    });
    r.flush(legalBook);
  });
  it('shows generic taxonomy categories from the server', () => {
    setup('taxonomy', '');
    expect(fixture.nativeElement.textContent).toContain('commercial');
  });
  it.each(['governance', 'realtime', 'legal'])(
    'clears protected configuration and unsaved drafts on %s changes',
    (kind) => {
      setup();
      c.name = 'Protected draft';
      c.newType();
      c.aliases = 'Secret alias';
      if (kind === 'governance') changes.next('*');
      else if (kind === 'realtime') revoked.next('*');
      else TestBed.inject(LegalClauseService).invalidate();
      expect(c.book()).toBeNull();
      expect(c.types()).toEqual([]);
      expect(c.name).toBe('');
      expect(c.rules).toEqual([]);
      expect(c.aliases).toBe('');
      expect(c.typeEditor).toBeNull();
      expect(c.canCreate()).toBe(false);
    },
  );
  it('clears protected configuration on 403 without showing backend diagnostics', () => {
    setup();
    c.activationConfirmed = true;
    c.activate(false);
    http
      .expectOne(root + '/clause-playbooks/' + uuid + '/activate/')
      .flush({ detail: 'provider-private' }, { status: 403, statusText: 'Denied' });
    expect(c.book()).toBeNull();
    expect(c.error()).not.toContain('provider-private');
  });
  it('does not replay stale publication after revision conflict', () => {
    setup();
    c.publishConfirmed = true;
    c.publish();
    http
      .expectOne(root + '/clause-playbooks/' + uuid + '/publish/')
      .flush({}, { status: 409, statusText: 'Conflict' });
    http.expectOne(root + '/clause-playbooks/' + uuid + '/').flush({ ...legalBook, revision: 5 });
    http.expectOne((r) => r.url.endsWith('/versions/')).flush(page([legalVersion]));
    http.expectOne((r) => r.url === root + '/clause-types/').flush(page([legalType]));
    expect(c.book()!.revision).toBe(5);
    expect(c.publishConfirmed).toBe(false);
    http.expectNone(root + '/clause-playbooks/' + uuid + '/publish/');
  });
  it('uses bounded server pagination for playbooks', () => {
    setup('playbooks', '');
    c.move(1);
    const r = http.expectOne(root + '/clause-playbooks/?page=2');
    r.flush(page([]));
    expect(c.page).toBe(2);
  });
  it('does not construct tenant identifiers for company policy', () => {
    setup('playbooks', '');
    c.name = 'Company policy';
    c.createBook();
    const r = http.expectOne(root + '/clause-playbooks/');
    expect(r.request.body.company).toBeUndefined();
    r.flush(legalBook);
    http.expectOne((r) => r.url === root + '/clause-playbooks/').flush(page([legalBook]));
  });
});
